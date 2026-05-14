from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid, aiohttp, base64
from datetime import datetime

from app.database import get_db
from app.models.models import User, Business, ContentSlot, PlatformConnection, PlanStatus
from app.api.auth import get_current_user
from app.workers.content_tasks import generate_content_plan_task
from app.config import settings

router = APIRouter()


class GeneratePlanRequest(BaseModel):
    year: int
    month: int


class UpdateSlotRequest(BaseModel):
    post_text: Optional[str] = None
    status: Optional[str] = None
    scheduled_at: Optional[str] = None


@router.post("/{business_id}/generate-plan")
async def generate_plan(
    business_id: str,
    body: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Business not found")
    if not business.strategy:
        raise HTTPException(400, "Сначала сгенерируйте стратегию")

    generate_content_plan_task.delay(business_id, body.year, body.month)
    return {"status": "started", "message": "Контент-план генерируется"}


@router.get("/{business_id}/plan")
async def get_plan(
    business_id: str,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ContentSlot).where(
            ContentSlot.business_id == business_id
        ).order_by(ContentSlot.scheduled_at)
    )
    slots = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "platform": s.platform.value if hasattr(s.platform, "value") else s.platform,
            "scheduled_at": s.scheduled_at.isoformat(),
            "rubric_name": s.rubric.get("name", "") if s.rubric else "",
            "idea": s.idea,
            "post_text": s.post_text,
            "image_url": s.image_url,
            "image_base64": s.image_base64,
            "image_prompt": s.image_prompt,
            "status": s.status.value if hasattr(s.status, "value") else s.status,
        }
        for s in slots
    ]


@router.patch("/slot/{slot_id}")
async def update_slot(
    slot_id: str,
    body: UpdateSlotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404, "Slot not found")

    if body.post_text is not None:
        slot.post_text = body.post_text
        if slot.status == PlanStatus.planned:
            slot.status = PlanStatus.content_ready

    if body.scheduled_at is not None:
        slot.scheduled_at = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)

    await db.commit()
    return {"status": "updated"}


@router.post("/slot/{slot_id}/publish")
async def publish_slot_now(
    slot_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    slot_result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
    slot = slot_result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404, "Slot not found")
    if not slot.post_text:
        raise HTTPException(400, "Нет текста поста")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == slot.business_id,
            PlatformConnection.platform == slot.platform,
            PlatformConnection.is_active == True
        )
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(400, "Площадка не подключена")

    from app.services.publishers import decrypt_token
    token = decrypt_token(connection.token_encrypted)
    page_id = connection.external_page_id

    platform = slot.platform.value if hasattr(slot.platform, "value") else slot.platform

    # Для VK используем пользовательский токен из аналитики (поддерживает загрузку фото)
    if platform == "vk" and connection.vk_user_token_encrypted:
        token = decrypt_token(connection.vk_user_token_encrypted)

    hashtags_str = " ".join(f"#{t}" for t in (slot.hashtags or []))
    full_text = f"{slot.post_text}\n\n{hashtags_str}".strip()
    has_b64 = bool(slot.image_base64)
    has_url = bool(slot.image_url)

    async with aiohttp.ClientSession() as session:

        # ── Telegram ──────────────────────────────────────────────────────────
        if platform == "telegram":
            if has_b64:
                img_bytes = base64.b64decode(slot.image_base64)
                form = aiohttp.FormData()
                form.add_field("chat_id", page_id)
                form.add_field("caption", full_text[:1024])
                form.add_field("photo", img_bytes, filename="image.png", content_type="image/png")
                resp = await session.post(
                    f"https://api.telegram.org/bot{token}/sendPhoto", data=form
                )
            elif has_url:
                resp = await session.post(
                    f"https://api.telegram.org/bot{token}/sendPhoto",
                    json={"chat_id": page_id, "photo": slot.image_url, "caption": full_text[:1024]}
                )
            else:
                resp = await session.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": page_id, "text": full_text[:4096]}
                )

            tg = await resp.json()
            if not tg.get("ok"):
                raise HTTPException(400, f"Telegram: {tg.get('description', str(tg))}")

            slot.status = PlanStatus.published
            slot.published_at = datetime.utcnow()
            slot.external_post_id = str(tg["result"]["message_id"])
            await db.commit()
            return {"status": "published", "message_id": tg["result"]["message_id"]}

        # ── VK ────────────────────────────────────────────────────────────────
        elif platform == "vk":
            group_id = page_id.lstrip("-")
            attachment = ""

            if has_b64 or has_url:
                try:
                    # 1. Получаем URL для загрузки фото
                    r = await session.get(
                        "https://api.vk.com/method/photos.getWallUploadServer",
                        params={"group_id": group_id, "access_token": token, "v": "5.131"}
                    )
                    srv = await r.json()
                    if "error" in srv:
                        raise ValueError(srv["error"]["error_msg"])
                    upload_url = srv["response"]["upload_url"]

                    # 2. Загружаем изображение
                    if has_b64:
                        img_bytes = base64.b64decode(slot.image_base64)
                    else:
                        dl = await session.get(slot.image_url)
                        img_bytes = await dl.read()

                    form = aiohttp.FormData()
                    form.add_field("photo", img_bytes, filename="photo.png", content_type="image/png")
                    r = await session.post(upload_url, data=form)
                    up = await r.json()

                    # 3. Сохраняем фото
                    r = await session.post(
                        "https://api.vk.com/method/photos.saveWallPhoto",
                        params={
                            "group_id": group_id,
                            "photo": up["photo"],
                            "server": up["server"],
                            "hash": up["hash"],
                            "access_token": token,
                            "v": "5.131",
                        }
                    )
                    saved = await r.json()
                    if "error" in saved:
                        raise ValueError(saved["error"]["error_msg"])
                    ph = saved["response"][0]
                    attachment = f"photo{ph['owner_id']}_{ph['id']}"
                except Exception:
                    attachment = ""  # публикуем без фото если загрузка упала

            # 4. Публикуем на стену
            params = {
                "owner_id": f"-{group_id}",
                "message": full_text,
                "access_token": token,
                "v": "5.131",
            }
            if attachment:
                params["attachments"] = attachment

            r = await session.post("https://api.vk.com/method/wall.post", params=params)
            vk = await r.json()
            if "error" in vk:
                raise HTTPException(400, f"VK: {vk['error']['error_msg']}")

            slot.status = PlanStatus.published
            slot.published_at = datetime.utcnow()
            slot.external_post_id = str(vk["response"]["post_id"])
            await db.commit()
            return {"status": "published", "post_id": vk["response"]["post_id"]}

        else:
            raise HTTPException(400, f"Платформа {platform} не поддерживается")


@router.post("/slot/{slot_id}/generate-image")
async def generate_image_for_slot(
    slot_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
    slot = result.scalar_one_or_none()
    if not slot:
        raise HTTPException(404, "Slot not found")

    if not slot.image_prompt:
        biz_result = await db.execute(select(Business).where(Business.id == slot.business_id))
        business = biz_result.scalar_one_or_none()
        if business and slot.idea:
            from app.workers.content_tasks import _generate_image_prompt
            import asyncio
            slot.image_prompt = await _generate_image_prompt(slot, business.profile)
            await db.commit()
        else:
            raise HTTPException(400, "Нет данных для генерации промта")

    import asyncio
    from app.services.gemini_image import generate_image_sync
    try:
        b64 = await asyncio.to_thread(generate_image_sync, slot.image_prompt, "1:1")
    except ValueError as e:
        raise HTTPException(400, f"Ошибка генерации: {str(e)}")

    slot.image_base64 = b64
    slot.image_url = None
    await db.commit()

    return {"status": "generated", "image_base64": b64}