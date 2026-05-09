import asyncio
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
            if slot.platform == "vk":
                post_id = await _post_to_vk(slot, token, connection.external_page_id)
            elif slot.platform == "telegram":
                post_id = await _post_to_telegram(slot, token, connection.external_page_id)
            else:
                raise ValueError(f"Неизвестная площадка: {slot.platform}")

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
    params = {"access_token": token, "owner_id": owner_id,
               "message": full_text, "v": "5.199"}
    async with aiohttp.ClientSession() as session:
        resp = await session.get("https://api.vk.com/method/wall.post", params=params)
        result = await resp.json()
    if "error" in result:
        raise Exception(f"VK: {result['error']['error_msg']}")
    return str(result["response"]["post_id"])


async def _post_to_telegram(slot, bot_token: str, chat_id: str) -> str:
    hashtags_str = " ".join(f"#{t}" for t in (slot.hashtags or []))
    full_text = f"{slot.post_text}\n\n{hashtags_str}".strip()
    base_url = f"https://api.telegram.org/bot{bot_token}"
    async with aiohttp.ClientSession() as session:
        if slot.image_url:
            resp = await session.post(f"{base_url}/sendPhoto",
                json={"chat_id": chat_id, "photo": slot.image_url, "caption": full_text[:1024]})
        else:
            resp = await session.post(f"{base_url}/sendMessage",
                json={"chat_id": chat_id, "text": full_text[:4096]})
        result = await resp.json()
    if not result.get("ok"):
        raise Exception(f"TG: {result.get('description')}")
    return str(result["result"]["message_id"])