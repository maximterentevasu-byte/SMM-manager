import asyncio
import base64
from datetime import datetime
from cryptography.fernet import Fernet
import aiohttp

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import ContentSlot, PlatformConnection, PlanStatus
from app.config import settings
from sqlalchemy import select, and_


def decrypt_token(encrypted: str) -> str:
    fernet = Fernet(settings.FERNET_KEY.encode())
    return fernet.decrypt(encrypted.encode()).decode()


@celery_app.task(name="app.workers.posting_tasks.check_publish_queue")
def check_publish_queue():
    asyncio.run(_check_queue())


async def _check_queue():
    async with get_worker_db() as db:
        now = datetime.utcnow()
        result = await db.execute(
            select(ContentSlot).where(
                and_(
                    ContentSlot.status == PlanStatus.content_ready,
                    ContentSlot.scheduled_at <= now
                )
            )
        )
        slots = result.scalars().all()
        for slot in slots:
            publish_post_task.delay(str(slot.id))


@celery_app.task(name="app.workers.posting_tasks.publish_post_task", max_retries=3)
def publish_post_task(slot_id: str):
    asyncio.run(_publish(slot_id))


async def _publish(slot_id: str):
    async with get_worker_db() as db:
        result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
        slot = result.scalar_one_or_none()
        if not slot:
            return

        conn_result = await db.execute(
            select(PlatformConnection).where(
                and_(
                    PlatformConnection.business_id == slot.business_id,
                    PlatformConnection.platform == slot.platform,
                    PlatformConnection.is_active == True
                )
            )
        )
        connection = conn_result.scalar_one_or_none()
        if not connection:
            slot.status = PlanStatus.failed
            slot.error_message = "Нет подключения к площадке"
            await db.commit()
            return

        try:
            token = decrypt_token(connection.token_encrypted)
            platform = slot.platform.value if hasattr(slot.platform, "value") else slot.platform
            if platform == "vk":
                post_id = await _post_to_vk(slot, token, connection.external_page_id)
            elif platform == "telegram":
                post_id = await _post_to_telegram(slot, token, connection.external_page_id)
            else:
                raise ValueError(f"Неизвестная площадка: {platform}")

            slot.status = PlanStatus.published
            slot.external_post_id = post_id
            slot.published_at = datetime.utcnow()
            print(f"✓ Опубликован: {slot_id}")
        except Exception as e:
            slot.status = PlanStatus.failed
            slot.error_message = str(e)
            print(f"✗ Ошибка публикации: {e}")

        await db.commit()


async def _post_to_vk(slot, token: str, owner_id: str) -> str:
    hashtags_str = " ".join(f"#{t}" for t in (slot.hashtags or []))
    full_text = f"{slot.post_text}\n\n{hashtags_str}".strip()

    # owner_id для сообщества должен быть отрицательным
    owner_id_int = int(owner_id)
    if owner_id_int > 0:
        owner_id_int = -owner_id_int

    base_params = {"access_token": token, "v": "5.199"}

    async with aiohttp.ClientSession() as session:
        attachment = None

        # Загружаем изображение если есть
        img_bytes = None
        if slot.image_base64:
            img_bytes = base64.b64decode(slot.image_base64)
        elif slot.image_url:
            async with session.get(slot.image_url) as img_resp:
                if img_resp.status == 200:
                    img_bytes = await img_resp.read()

        if img_bytes:
            # 1. Получаем URL для загрузки
            r = await session.get(
                "https://api.vk.com/method/photos.getWallUploadServer",
                params={**base_params, "group_id": abs(owner_id_int)},
            )
            upload_data = await r.json()
            if "error" in upload_data:
                raise Exception(f"VK getWallUploadServer: {upload_data['error']['error_msg']}")
            upload_url = upload_data["response"]["upload_url"]

            # 2. Загружаем фото
            form = aiohttp.FormData()
            form.add_field("photo", img_bytes, filename="photo.png", content_type="image/png")
            r = await session.post(upload_url, data=form)
            uploaded = await r.json()

            # 3. Сохраняем фото
            r = await session.post(
                "https://api.vk.com/method/photos.saveWallPhoto",
                params={
                    **base_params,
                    "group_id": abs(owner_id_int),
                    "photo": uploaded.get("photo", ""),
                    "server": uploaded.get("server", ""),
                    "hash": uploaded.get("hash", ""),
                },
            )
            saved = await r.json()
            if "error" in saved:
                raise Exception(f"VK saveWallPhoto: {saved['error']['error_msg']}")
            ph = saved["response"][0]
            attachment = f"photo{ph['owner_id']}_{ph['id']}"

        # 4. Публикуем пост
        post_params = {
            **base_params,
            "owner_id": owner_id_int,
            "message": full_text,
        }
        if attachment:
            post_params["attachments"] = attachment

        resp = await session.post("https://api.vk.com/method/wall.post", params=post_params)
        result = await resp.json()

    if "error" in result:
        raise Exception(f"VK: {result['error']['error_msg']}")
    return str(result["response"]["post_id"])


async def _post_to_telegram(slot, bot_token: str, chat_id: str) -> str:
    hashtags_str = " ".join(f"#{t}" for t in (slot.hashtags or []))
    full_text = f"{slot.post_text}\n\n{hashtags_str}".strip()
    base_url = f"https://api.telegram.org/bot{bot_token}"

    async with aiohttp.ClientSession() as session:
        if slot.image_base64:
            # base64 → multipart sendPhoto
            img_bytes = base64.b64decode(slot.image_base64)
            form = aiohttp.FormData()
            form.add_field("chat_id", chat_id)
            form.add_field("caption", full_text[:1024])
            form.add_field("photo", img_bytes, filename="image.png", content_type="image/png")
            resp = await session.post(f"{base_url}/sendPhoto", data=form)
        elif slot.image_url:
            resp = await session.post(
                f"{base_url}/sendPhoto",
                json={"chat_id": chat_id, "photo": slot.image_url, "caption": full_text[:1024]},
            )
        else:
            resp = await session.post(
                f"{base_url}/sendMessage",
                json={"chat_id": chat_id, "text": full_text[:4096]},
            )
        result = await resp.json()

    if not result.get("ok"):
        raise Exception(f"TG: {result.get('description')}")
    return str(result["result"]["message_id"])