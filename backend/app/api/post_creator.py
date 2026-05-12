"""
API для создания постов вручную.
Все AI-вызовы — нативный async через httpx.AsyncClient (без потоков).
"""
import uuid
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.models import Business, ContentSlot, PlanStatus, Platform, User

router = APIRouter()
_CLAUDE_MODEL = "claude-sonnet-4-6"


# ─── DB helper ───────────────────────────────────────────────────────────────

async def _get_business(business_id: str, user: User, db: AsyncSession) -> Business:
    r = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == user.id)
    )
    biz = r.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Бизнес не найден")
    return biz


# ─── Async AI helpers ─────────────────────────────────────────────────────────

async def _gemini_text(client: httpx.AsyncClient, system: str, user_text: str, max_tokens: int) -> str:
    r = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}",
        json={
            "contents": [{"parts": [{"text": f"{system}\n\n{user_text}"}]}],
            "generationConfig": {"maxOutputTokens": max_tokens},
        },
    )
    if r.status_code != 200:
        raise ValueError(f"Gemini {r.status_code}: {r.text[:200]}")
    cands = r.json().get("candidates", [])
    if not cands:
        raise ValueError("Gemini: нет кандидатов")
    parts = cands[0].get("content", {}).get("parts", [])
    text = parts[0].get("text", "").strip() if parts else ""
    if not text:
        raise ValueError("Gemini: пустой ответ")
    return text


async def _gpt_text(client: httpx.AsyncClient, system: str, user_text: str, max_tokens: int) -> str:
    r = await client.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
        json={
            "model": "gpt-4o-mini",
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_text},
            ],
        },
    )
    if r.status_code != 200:
        raise ValueError(f"OpenAI {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"].strip()


async def _claude_text(client: httpx.AsyncClient, system: str, user_text: str, max_tokens: int) -> str:
    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": settings.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        json={
            "model": _CLAUDE_MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user_text}],
        },
    )
    if r.status_code != 200:
        raise ValueError(f"Claude {r.status_code}: {r.text[:200]}")
    return r.json()["content"][0]["text"].strip()


async def _generate_text(system: str, user_text: str, max_tokens: int = 1200) -> str:
    """Gemini → GPT → Claude, все вызовы нативно async."""
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=60) as client:
        if settings.GEMINI_API_KEY:
            try:
                return await _gemini_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"Gemini: {e}")

        if settings.OPENAI_API_KEY:
            try:
                return await _gpt_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"GPT: {e}")

        if settings.ANTHROPIC_API_KEY:
            try:
                return await _claude_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"Claude: {e}")

    raise HTTPException(500, "Ошибка генерации: " + " | ".join(errors))


# ─── 1. Генерация текста поста ────────────────────────────────────────────────

class TextIn(BaseModel):
    idea: str


@router.post("/{business_id}/generate-text")
async def generate_post_text(
    business_id: str,
    body: TextIn,
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

    text = await _generate_text(system, f"Идея поста: {body.idea}")
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
    try:
        biz = await _get_business(business_id, current_user, db)
        niche = (biz.profile or {}).get("niche", "")
    except HTTPException:
        niche = ""

    system = (
        "You are an expert prompt engineer for AI image generation.\n"
        "Create a detailed English image generation prompt based on the social media post.\n\n"
        "Rules:\n"
        "• Write in English only\n"
        "• Be specific: describe style, mood, lighting, composition, colors\n"
        "• No text or words in the image\n"
        "• Photorealistic or high-quality illustration style\n"
        "• Return ONLY the prompt, no explanations"
    )
    user_text = f"Business niche: {niche}\n\nPost text:\n{body.post_text}\n\nWrite the image prompt:"

    prompt = await _generate_text(system, user_text, 400)
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
    import asyncio
    from app.services.gemini_image import generate_image_sync
    try:
        b64 = await asyncio.to_thread(generate_image_sync, body.prompt, body.aspect_ratio)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"image_base64": b64}


# ─── 4. Публикация в контент-план ─────────────────────────────────────────────

class PublishIn(BaseModel):
    post_text: str
    image_prompt: Optional[str] = None
    image_base64: Optional[str] = None
    platforms: list[str]
    scheduled_at: Optional[str] = None


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
        datetime.fromisoformat(body.scheduled_at) if body.scheduled_at else datetime.utcnow()
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
