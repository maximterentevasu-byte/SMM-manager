"""
API для создания постов вручную.
Все AI-вызовы — нативный async через httpx.AsyncClient (без потоков).
"""
import uuid
import base64
from datetime import datetime
from typing import Optional

import aiohttp
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.models import Business, ContentSlot, PlanStatus, Platform, PlatformConnection, User

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
    """Claude → GPT → Gemini, все вызовы нативно async."""
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=60) as client:
        if settings.ANTHROPIC_API_KEY:
            try:
                return await _claude_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"Claude: {e}")

        if settings.OPENAI_API_KEY:
            try:
                return await _gpt_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"GPT: {e}")

        if settings.GEMINI_API_KEY:
            try:
                return await _gemini_text(client, system, user_text, max_tokens)
            except Exception as e:
                errors.append(f"Gemini: {e}")

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
        profile = biz.profile if isinstance(biz.profile, dict) else {}
        strategy = biz.strategy if isinstance(biz.strategy, dict) else {}
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
        "• Не добавляй никаких пояснений — только текст поста\n"
        "• СТРОГО используй только факты из идеи. Никогда не придумывай продукты, бренды, страны, события, детали, которые явно не указаны в идее"
    )

    text = await _generate_text(system, f"Идея поста: {body.idea}")
    return {"text": text}


# ─── 2. Генерация промта для изображения ─────────────────────────────────────

class PromptIn(BaseModel):
    post_text: str
    idea: Optional[str] = None


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

    idea_block = f"\nOriginal post idea: {body.idea}" if body.idea else ""

    system = (
        "You are an expert prompt engineer for AI image generation.\n"
        "Create a highly specific image generation prompt that visually represents the EXACT content of the post.\n\n"
        "Rules:\n"
        "• Write in English only\n"
        "• The image must directly reflect the specific subject, objects, and context from the post and original idea\n"
        "• Never use generic descriptions like 'diverse group of people' — be concrete and specific\n"
        "• Describe: exact subject matter, visual style, mood, lighting, composition, colors\n"
        "• No text or words in the image\n"
        "• Photorealistic or high-quality illustration style\n"
        "• Return ONLY the prompt, no explanations"
    )
    user_text = (
        f"Business niche: {niche}{idea_block}\n\n"
        f"Post text:\n{body.post_text}\n\n"
        "Write a specific image prompt that shows exactly what this post is about:"
    )

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


# ─── 4. Публикация в соцсети ─────────────────────────────────────────────────

class PublishIn(BaseModel):
    post_text: str
    image_prompt: Optional[str] = None
    image_base64: Optional[str] = None
    platforms: list[str]
    scheduled_at: Optional[str] = None


async def _publish_to_telegram(session: aiohttp.ClientSession, token: str, chat_id: str,
                                full_text: str, image_base64: Optional[str]) -> str:
    base_url = f"https://api.telegram.org/bot{token}"
    if image_base64:
        img_bytes = base64.b64decode(image_base64)
        form = aiohttp.FormData()
        form.add_field("chat_id", chat_id)
        form.add_field("caption", full_text[:1024])
        form.add_field("photo", img_bytes, filename="image.png", content_type="image/png")
        resp = await session.post(f"{base_url}/sendPhoto", data=form)
    else:
        resp = await session.post(
            f"{base_url}/sendMessage",
            json={"chat_id": chat_id, "text": full_text[:4096]},
        )
    result = await resp.json()
    if not result.get("ok"):
        raise ValueError(f"Telegram: {result.get('description', str(result))}")
    return str(result["result"]["message_id"])


async def _publish_to_vk(session: aiohttp.ClientSession, token: str, page_id: str,
                          full_text: str, image_base64: Optional[str]) -> str:
    group_id = page_id.lstrip("-")
    base_params = {"access_token": token, "v": "5.131"}
    attachment = ""

    if image_base64:
        img_bytes = base64.b64decode(image_base64)
        r = await session.get(
            "https://api.vk.com/method/photos.getWallUploadServer",
            params={**base_params, "group_id": group_id},
        )
        srv = await r.json()
        if "error" in srv:
            raise ValueError(f"VK getWallUploadServer: {srv['error']['error_msg']}")
        upload_url = srv["response"]["upload_url"]

        form = aiohttp.FormData()
        form.add_field("photo", img_bytes, filename="photo.png", content_type="image/png")
        r = await session.post(upload_url, data=form)
        up = await r.json()

        r = await session.post(
            "https://api.vk.com/method/photos.saveWallPhoto",
            params={**base_params, "group_id": group_id,
                    "photo": up.get("photo", ""), "server": up.get("server", ""),
                    "hash": up.get("hash", "")},
        )
        saved = await r.json()
        if "error" in saved:
            raise ValueError(f"VK saveWallPhoto: {saved['error']['error_msg']}")
        ph = saved["response"][0]
        attachment = f"photo{ph['owner_id']}_{ph['id']}"

    post_params = {**base_params, "owner_id": f"-{group_id}", "message": full_text}
    if attachment:
        post_params["attachments"] = attachment
    r = await session.post("https://api.vk.com/method/wall.post", params=post_params)
    vk = await r.json()
    if "error" in vk:
        raise ValueError(f"VK: {vk['error']['error_msg']}")
    return str(vk["response"]["post_id"])


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

    from app.services.publishers import decrypt_token
    results = []

    async with aiohttp.ClientSession() as session:
        for platform_str in body.platforms:
            try:
                platform = Platform(platform_str)
            except ValueError:
                continue

            conn_result = await db.execute(
                select(PlatformConnection).where(
                    PlatformConnection.business_id == biz.id,
                    PlatformConnection.platform == platform,
                    PlatformConnection.is_active == True,
                )
            )
            connection = conn_result.scalar_one_or_none()

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

            if not connection:
                results.append({"platform": platform_str, "status": "no_connection",
                                 "error": "Площадка не подключена"})
                continue

            token = decrypt_token(connection.token_encrypted)
            # Для VK используем пользовательский токен из аналитики (он поддерживает загрузку фото)
            vk_user_token = (
                decrypt_token(connection.vk_user_token_encrypted)
                if platform_str == "vk" and connection.vk_user_token_encrypted
                else None
            )
            full_text = body.post_text

            try:
                warning = None
                if platform_str == "telegram":
                    ext_id = await _publish_to_telegram(
                        session, token, connection.external_page_id,
                        full_text, body.image_base64,
                    )
                elif platform_str == "vk":
                    publish_token = vk_user_token or token
                    try:
                        ext_id = await _publish_to_vk(
                            session, publish_token, connection.external_page_id,
                            full_text, body.image_base64,
                        )
                    except ValueError as ve:
                        err = str(ve)
                        if "group auth" in err.lower() or "unavailable with group" in err.lower():
                            # Токен сообщества не поддерживает загрузку фото → публикуем без фото
                            ext_id = await _publish_to_vk(
                                session, publish_token, connection.external_page_id,
                                full_text, None,
                            )
                            warning = ("Пост опубликован без фото. "
                                       "Для публикации с картинкой нужен пользовательский токен VK "
                                       "с правами wall+photos (не токен сообщества).")
                        else:
                            raise
                else:
                    results.append({"platform": platform_str, "status": "unsupported"})
                    continue

                slot.status = PlanStatus.published
                slot.published_at = datetime.utcnow()
                slot.external_post_id = ext_id
                entry: dict = {"platform": platform_str, "status": "published", "id": ext_id}
                if warning:
                    entry["warning"] = warning
                results.append(entry)
            except Exception as e:
                slot.status = PlanStatus.failed
                slot.error_message = str(e)
                results.append({"platform": platform_str, "status": "error", "error": str(e)})

    await db.commit()
    return {"status": "done", "results": results}
