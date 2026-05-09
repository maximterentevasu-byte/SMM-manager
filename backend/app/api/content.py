from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid, aiohttp, boto3
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

    await db.commit()
    return {"status": "updated"}


@router.post("/slot/{slot_id}/publish")
async def publish_slot_now(
    slot_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
    slot = result.scalar_one_or_none()
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
    chat_id = connection.external_page_id

    hashtags_str = " ".join(f"#{t}" for t in (slot.hashtags or []))
    full_text = f"{slot.post_text}\n\n{hashtags_str}".strip()

    platform = slot.platform.value if hasattr(slot.platform, "value") else slot.platform

    async with aiohttp.ClientSession() as session:
        if slot.image_url and platform == "telegram":
            resp = await session.post(
                f"https://api.telegram.org/bot{token}/sendPhoto",
                json={"chat_id": chat_id, "photo": slot.image_url, "caption": full_text[:1024]}
            )
        else:
            resp = await session.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": full_text[:4096]}
            )
        result_data = await resp.json()

    if not result_data.get("ok"):
        raise HTTPException(400, f"Ошибка публикации: {result_data}")

    slot.status = PlanStatus.published
    slot.published_at = datetime.utcnow()
    slot.external_post_id = str(result_data["result"]["message_id"])
    await db.commit()

    return {"status": "published", "message_id": result_data["result"]["message_id"]}


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

    if not settings.OPENAI_API_KEY:
        raise HTTPException(400, "OpenAI API key не задан в .env")

    # Если нет промта — генерируем его прямо сейчас
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

    import openai
    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        response = await client.images.generate(
            model="dall-e-3",
            prompt=slot.image_prompt[:1000],
            size="1024x1024",
            quality="hd",
            style="natural",
            n=1,
        )
        image_url = response.data[0].url

        # Пытаемся загрузить в S3 если настроен
        image_url_final = image_url
        if settings.S3_ACCESS_KEY and settings.S3_BUCKET:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(image_url) as r:
                        img_bytes = await r.read()

                s3 = boto3.client(
                    "s3",
                    endpoint_url=settings.S3_ENDPOINT,
                    aws_access_key_id=settings.S3_ACCESS_KEY,
                    aws_secret_access_key=settings.S3_SECRET_KEY,
                    region_name=settings.S3_REGION,
                )
                key = f"posts/{uuid.uuid4()}.jpg"
                s3.put_object(
                    Bucket=settings.S3_BUCKET,
                    Key=key,
                    Body=img_bytes,
                    ContentType="image/jpeg",
                    ACL="public-read"
                )
                image_url_final = f"{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{key}"
            except Exception:
                pass  # Используем прямую ссылку OpenAI если S3 недоступен

        slot.image_url = image_url_final
        await db.commit()

        return {"status": "generated", "image_url": image_url_final}

    except Exception as e:
        raise HTTPException(400, f"Ошибка генерации: {str(e)}")