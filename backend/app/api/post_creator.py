"""
API для создания постов вручную:
  POST /{business_id}/generate-text   — Claude пишет текст поста по идее
  POST /{business_id}/generate-prompt — Claude пишет промт для картинки
  POST /{business_id}/generate-image  — Gemini Imagen 3 генерирует картинку
  POST /{business_id}/publish         — сохраняет ContentSlot(ы) в БД
"""
import asyncio
import uuid
from datetime import datetime
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.models import (
    Business, ContentSlot, PlatformConnection, PlanStatus, Platform, User,
)

router = APIRouter()


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _get_business(business_id: str, user: User, db: AsyncSession) -> Business:
    r = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == user.id)
    )
    biz = r.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Бизнес не найден")
    return biz


def _claude() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


# ─── 1. Генерация текста поста ────────────────────────────────────────────────

@router.post("/{business_id}/generate-text")
async def generate_post_text(
    business_id: str,
    idea: str = Form(...),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        biz = await _get_business(business_id, current_user, db)
        profile = biz.profile or {}
        strategy = biz.strategy or {}
        name = biz.name
    except HTTPException:
        profile = {}
        strategy = {}
        name = "компании"

    # Если прикреплён файл-изображение — передаём его в Claude как vision
    messages: list = []
    if file and file.content_type and file.content_type.startswith("image/"):
        content = await file.read()
        import base64
        b64 = base64.b64encode(content).decode()
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": file.content_type, "data": b64},
                },
                {
                    "type": "text",
                    "text": (
                        f"Бизнес: {name}\n"
                        f"Идея поста: {idea}\n\n"
                        "На изображении выше — визуальный контекст. Напиши текст поста."
                    ),
                },
            ],
        })
    else:
        messages.append({
            "role": "user",
            "content": f"Идея поста: {idea}",
        })

    tone = strategy.get("tone_of_voice", "профессиональный, дружелюбный")
    niche = profile.get("niche", "")
    target = profile.get("target_audience", "")

    system = (
        f"Ты — топовый SMM-копирайтер. Пишешь посты для бизнеса «{name}».\n"
        f"Ниша: {niche}. Целевая аудитория: {target}. Тон: {tone}.\n\n"
        "Правила:\n"
        "• Пиши живо, без канцеляризмов\n"
        "• Добавь 3–5 релевантных хэштегов в конце\n"
        "• Оптимальная длина: 800–1500 символов\n"
        "• Учитывай актуальные тренды российских соцсетей\n"
        "• Не добавляй никаких пояснений — только текст поста"
    )

    client = _claude()
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=system,
        messages=messages,
    )
    text = resp.content[0].text.strip()
    return {"text": text}


# ─── 2. Генерация промта для изображения ─────────────────────────────────────

class PromptIn(BaseModel):
    post_text: str


@router.post("/{business_id}/generate-prompt")
async def generate_image_prompt(
    business_id: str,
    body: PromptIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    biz = await _get_business(business_id, current_user, db)

    profile = biz.profile or {}
    niche = profile.get("niche", "")

    system = (
        "You are an expert prompt engineer for Imagen 3 image generation.\n"
        "Create a detailed English image generation prompt based on the social media post.\n\n"
        "Rules:\n"
        "• Write in English only\n"
        "• Be specific: describe style, mood, lighting, composition, colors\n"
        "• No text or words in the image\n"
        "• Photorealistic or high-quality illustration style\n"
        "• Return ONLY the prompt, no explanations"
    )

    client = _claude()
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=500,
        system=system,
        messages=[{
            "role": "user",
            "content": (
                f"Business niche: {niche}\n\n"
                f"Post text (Russian):\n{body.post_text}\n\n"
                "Write the image generation prompt:"
            ),
        }],
    )
    prompt = resp.content[0].text.strip()
    return {"prompt": prompt}


# ─── 3. Генерация изображения ─────────────────────────────────────────────────

class ImageIn(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"


@router.post("/{business_id}/generate-image")
async def generate_image(
    business_id: str,
    body: ImageIn,
    current_user: User = Depends(get_current_user),
):
    from app.services.gemini_image import generate_image_sync
    try:
        b64 = await asyncio.to_thread(
            generate_image_sync, body.prompt, body.aspect_ratio
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return {"image_base64": b64}


# ─── 4. Публикация в контент-план ─────────────────────────────────────────────

class PublishIn(BaseModel):
    post_text: str
    image_prompt: Optional[str] = None
    image_base64: Optional[str] = None
    platforms: list[str]          # ["vk", "telegram"]
    scheduled_at: Optional[str] = None   # ISO datetime или null = сейчас


@router.post("/{business_id}/publish")
async def publish_to_plan(
    business_id: str,
    body: PublishIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    biz = await _get_business(business_id, current_user, db)

    if not body.platforms:
        raise HTTPException(400, "Выбери хотя бы одну платформу")

    scheduled = (
        datetime.fromisoformat(body.scheduled_at)
        if body.scheduled_at
        else datetime.utcnow()
    )

    created = []
    for platform_str in body.platforms:
        try:
            platform = Platform(platform_str)
        except ValueError:
            continue

        slot = ContentSlot(
            id=uuid.uuid4(),
            business_id=biz.id,
            platform=platform,
            scheduled_at=scheduled,
            rubric={"name": "Ручной пост", "type": "custom"},
            post_text=body.post_text,
            image_prompt=body.image_prompt,
            image_base64=body.image_base64,
            status=PlanStatus.content_ready,
        )
        db.add(slot)
        created.append({"platform": platform_str, "slot_id": str(slot.id)})

    await db.commit()
    return {"status": "added_to_plan", "slots": created}
