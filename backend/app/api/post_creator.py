"""
API для создания постов вручную.
Все AI-вызовы — нативный async через httpx.AsyncClient (без потоков).
"""
import uuid
import base64
import re
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
_GPT_USER_MODEL = "gpt-5.4"
_GEMINI_TEXT_MODEL = "gemini-3.1-pro-preview"


# ─── DB helper ───────────────────────────────────────────────────────────────

async def _get_business(business_id: str, user: User, db: AsyncSession) -> Business:
    r = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == user.id)
    )
    biz = r.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Бизнес не найден")
    return biz


# ─── URL fetching ─────────────────────────────────────────────────────────────

async def _fetch_telegram_text(url: str, max_chars: int = 2500) -> str:
    """Извлекает текст публичного Telegram-поста через OG-метатеги."""
    import html as html_lib
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
            html_text = r.text

        parts: list[str] = []
        for pattern in [
            r'<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']*)["\']',
            r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']*)["\']',
            r'<meta\s+name=["\']twitter:description["\']\s+content=["\']([^"\']*)["\']',
        ]:
            m = re.search(pattern, html_text, re.IGNORECASE)
            if m:
                part = html_lib.unescape(m.group(1)).strip()
                if part and part not in parts:
                    parts.append(part)

        result = "\n".join(parts)
        if len(result) > 20:
            return result[:max_chars]
    except Exception:
        pass
    return ""


async def _fetch_url_text(url: str, max_chars: int = 2500) -> str:
    # Соцсети с закрытым контентом не парсятся без авторизации
    _BLOCKED_DOMAINS = ("instagram.com", "vk.com", "ok.ru", "facebook.com")
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.lower().lstrip("www.")

        # Telegram: специальный парсинг OG-метатегов
        if domain in ("t.me", "telegram.me") or domain.endswith(".t.me"):
            return await _fetch_telegram_text(url, max_chars)

        if any(domain == b or domain.endswith("." + b) for b in _BLOCKED_DOMAINS):
            return ""
    except Exception:
        pass
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.get(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            )
            html = r.text
            html = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', html)
            text = re.sub(r'\s+', ' ', text).strip()
            return text[:max_chars]
    except Exception:
        return ""


# ─── Image description via Claude vision ─────────────────────────────────────

async def _describe_images(images: list[dict], client: httpx.AsyncClient) -> str:
    """images: list of {data: base64str, mime: str}. Returns text description."""
    if not images or not settings.ANTHROPIC_API_KEY:
        return ""
    content: list = [{"type": "text", "text": "Опиши подробно что изображено на каждой фотографии (для контекста создания поста в соцсетях):"}]
    for img in images[:5]:
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": img.get("mime", "image/jpeg"),
                "data": img["data"],
            }
        })
    try:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": settings.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01"},
            json={"model": _CLAUDE_MODEL, "max_tokens": 600, "messages": [{"role": "user", "content": content}]},
        )
        if r.status_code == 200:
            return r.json()["content"][0]["text"].strip()
    except Exception:
        pass
    return ""


# ─── Async AI helpers ─────────────────────────────────────────────────────────

def _gemini_text_sync(system: str, user_text: str, max_tokens: int) -> str:
    import logging
    log = logging.getLogger("gemini_text")
    log.info("[Gemini] model=%s max_tokens=%d", _GEMINI_TEXT_MODEL, max_tokens)
    try:
        from google import genai
        from google.genai import types
    except ImportError as e:
        log.error("[Gemini] google-genai не установлен: %s", e)
        raise ValueError(f"google-genai не установлен: {e}")

    gc = genai.Client(api_key=settings.GEMINI_API_KEY)
    log.info("[Gemini] client создан, вызываем generate_content...")
    try:
        resp = gc.models.generate_content(
            model=_GEMINI_TEXT_MODEL,
            contents=f"{system}\n\n{user_text}",
            config=types.GenerateContentConfig(max_output_tokens=max_tokens),
        )
    except Exception as e:
        log.error("[Gemini] generate_content упал: %s | type=%s", e, type(e).__name__)
        raise ValueError(f"Gemini generate_content error: {e}")

    log.info("[Gemini] ответ получен, resp.text length=%s", len(resp.text or ""))
    text = resp.text or ""
    if not text.strip():
        log.error("[Gemini] пустой ответ. candidates=%s", getattr(resp, 'candidates', 'n/a'))
        raise ValueError("Gemini: пустой ответ")
    return text.strip()


async def _gemini_text(client: httpx.AsyncClient, system: str, user_text: str, max_tokens: int) -> str:
    import asyncio
    return await asyncio.to_thread(_gemini_text_sync, system, user_text, max_tokens)


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


async def _generate_text(system: str, user_text: str, max_tokens: int = 1200) -> tuple[str, str]:
    """Claude → GPT (Gemini только для картинок). Возвращает (text, model_used)."""
    errors: list[str] = []
    async with httpx.AsyncClient(timeout=60) as client:
        if settings.ANTHROPIC_API_KEY:
            try:
                return await _claude_text(client, system, user_text, max_tokens), "claude"
            except Exception as e:
                errors.append(f"Claude: {e}")

        if settings.OPENAI_API_KEY:
            try:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                    json={
                        "model": _GPT_USER_MODEL,
                        "max_completion_tokens": max_tokens,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": user_text},
                        ],
                    },
                )
                if r.status_code != 200:
                    raise ValueError(f"GPT {r.status_code}: {r.text[:200]}")
                return r.json()["choices"][0]["message"]["content"].strip(), "gpt"
            except Exception as e:
                errors.append(f"GPT: {e}")

    raise HTTPException(500, "Ошибка генерации: " + " | ".join(errors))


async def _generate_text_by_model(
    system: str, user_text: str, model: str, max_tokens: int = 1200
) -> str:
    """Генерация конкретной премиум-моделью без каскадного фолбека."""
    async with httpx.AsyncClient(timeout=60) as client:
        if model == "claude":
            if not settings.ANTHROPIC_API_KEY:
                raise HTTPException(500, "Claude API недоступен")
            return await _claude_text(client, system, user_text, max_tokens)

        if model == "gpt":
            if not settings.OPENAI_API_KEY:
                raise HTTPException(500, "OpenAI API недоступен")
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json={
                    "model": _GPT_USER_MODEL,
                    "max_completion_tokens": max_tokens,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_text},
                    ],
                },
            )
            if r.status_code != 200:
                raise HTTPException(500, f"GPT {r.status_code}: {r.text[:200]}")
            return r.json()["choices"][0]["message"]["content"].strip()

        if model == "gemini":
            if not settings.GEMINI_API_KEY:
                raise HTTPException(500, "Gemini API недоступен")
            import asyncio
            try:
                return await asyncio.to_thread(_gemini_text_sync, system, user_text, max_tokens)
            except Exception as e:
                raise HTTPException(500, str(e))

    raise HTTPException(500, f"Неизвестная модель: {model}")


# ─── 1. Генерация текста поста ────────────────────────────────────────────────

class ImageData(BaseModel):
    data: str        # base64
    mime: str = "image/jpeg"


class TextIn(BaseModel):
    idea: str
    url: Optional[str] = None
    images: Optional[list[ImageData]] = None


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

    context_parts: list[str] = []

    if body.url:
        url_text = await _fetch_url_text(body.url)
        # Включаем только если реально что-то получили (не ошибка, не пустота)
        if url_text and not url_text.startswith("[Не удалось") and len(url_text) > 150:
            context_parts.append(f"Референсный материал (стиль написания из внешнего источника):\n{url_text}")

    if body.images:
        async with httpx.AsyncClient(timeout=30) as cl:
            img_dicts = [{"data": img.data, "mime": img.mime} for img in body.images]
            img_desc = await _describe_images(img_dicts, cl)
        if img_desc:
            context_parts.append(f"Описание прикреплённых фото:\n{img_desc}")

    extra = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

    system = (
        f"Ты — топовый SMM-копирайтер. Пишешь посты для бизнеса «{name}».\n"
        f"Ниша: {niche}. Целевая аудитория: {target}. Тон: {tone}.\n\n"
        "Правила:\n"
        "• Пиши живо, без канцеляризмов\n"
        "• Добавь 3–5 релевантных хэштегов в конце\n"
        "• Оптимальная длина: 1000–1500 символов\n"
        "• Разбивай текст на абзацы через пустую строку (\\n\\n) — НЕ пиши сплошным блоком\n"
        "• Учитывай актуальные тренды российских соцсетей\n"
        "• Не добавляй никаких пояснений — только текст поста\n"
        "• СТРОГО используй только факты из идеи. Никогда не придумывай продукты, бренды, страны, события, детали, которые явно не указаны в идее"
    )

    text, model_used = await _generate_text(system, f"Задача: {body.idea}{extra}", max_tokens=3000)
    return {"text": text, "model_used": model_used}


# ─── 2б. Бренд-контекст бизнеса ─────────────────────────────────────────────

@router.get("/{business_id}/brand-context")
async def get_brand_context(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает визуальный стиль и цвета бренда из профиля."""
    try:
        biz = await _get_business(business_id, current_user, db)
        profile = biz.profile if isinstance(biz.profile, dict) else {}
        strategy = biz.strategy if isinstance(biz.strategy, dict) else {}
    except HTTPException:
        return {"visual_style": "", "brand_colors": [], "brand_voice": "", "niche": ""}

    return {
        "visual_style": profile.get("visual_style", ""),
        "brand_colors": profile.get("brand_colors", []),
        "brand_voice": profile.get("brand_voice", ""),
        "niche": profile.get("niche", ""),
        "usp": profile.get("usp", ""),
    }


# ─── 2. Генерация промта для изображения ─────────────────────────────────────

class PromptIn(BaseModel):
    post_text: str
    idea: Optional[str] = None
    url: Optional[str] = None
    images: Optional[list[ImageData]] = None


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

    context_parts: list[str] = []

    if body.url:
        url_text = await _fetch_url_text(body.url, max_chars=1000)
        if url_text and not url_text.startswith("[Не удалось") and len(url_text) > 150:
            context_parts.append(f"Reference content (for style/context only):\n{url_text}")

    if body.images:
        async with httpx.AsyncClient(timeout=30) as cl:
            img_dicts = [{"data": img.data, "mime": img.mime} for img in body.images]
            img_desc = await _describe_images(img_dicts, cl)
        if img_desc:
            context_parts.append(f"Attached photos description:\n{img_desc}")

    extra = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""
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
        f"Post text:\n{body.post_text}{extra}\n\n"
        "Write a specific image prompt that shows exactly what this post is about:"
    )

    prompt, model_used = await _generate_text(system, user_text, 400)
    return {"prompt": prompt, "model_used": model_used}


# ─── 3. Генерация изображения ─────────────────────────────────────────────────

class ImageIn(BaseModel):
    prompt: Optional[str] = None
    prompt_ru: Optional[str] = None
    aspect_ratio: str = "1:1"


@router.post("/{business_id}/generate-image")
async def generate_image(
    business_id: str,
    body: ImageIn,
    current_user: User = Depends(get_current_user),
):
    """Переводит промт и немедленно возвращает task_id (генерация идёт в Celery-воркере)."""
    import asyncio
    from app.workers.image_tasks import generate_image_task

    prompt = body.prompt

    if body.prompt_ru:
        translation_system = (
            "You are a professional translator specializing in AI image generation prompts. "
            "Translate the following prompt from Russian to English. "
            "Preserve all visual details, style, mood, and compositional elements exactly. "
            "Return ONLY the English translation, no explanations or comments."
        )
        try:
            prompt, _ = await asyncio.wait_for(
                _generate_text(translation_system, body.prompt_ru, 400),
                timeout=10.0,
            )
        except Exception:
            prompt = body.prompt_ru

    if not prompt:
        raise HTTPException(400, "Укажите prompt или prompt_ru")

    task = generate_image_task.apply_async(args=[prompt, body.aspect_ratio])
    return {"task_id": task.id, "prompt_en": prompt}


@router.get("/{business_id}/image-task/{task_id}")
async def get_image_task(
    business_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Поллинг статуса задачи генерации изображения."""
    from celery.result import AsyncResult
    from app.workers.celery_app import celery_app as _celery

    result = AsyncResult(task_id, app=_celery)
    state = result.state
    if state in ("PENDING", "RECEIVED", "STARTED", "RETRY"):
        return {"status": "pending"}
    if state == "SUCCESS":
        return result.result or {"status": "error", "error": "пустой результат"}
    return {"status": "error", "error": str(result.result)}


# ─── 3б. Редактирование изображения ─────────────────────────────────────────

class EditImageIn(BaseModel):
    base_image: ImageData
    reference_images: Optional[list[ImageData]] = None
    instruction_ru: str


@router.post("/{business_id}/edit-image")
async def edit_image_endpoint(
    business_id: str,
    body: EditImageIn,
    current_user: User = Depends(get_current_user),
):
    """Переводит инструкцию и немедленно возвращает task_id (редактирование идёт в Celery-воркере)."""
    import asyncio
    from app.workers.image_tasks import edit_image_task

    translation_system = (
        "You are a professional image editing instruction translator. "
        "Translate the following image editing instruction from Russian to English. "
        "Be precise and specific about what to change, what to keep, and how the result should look. "
        "Return ONLY the English translation, no comments."
    )
    try:
        instruction_en, _ = await asyncio.wait_for(
            _generate_text(translation_system, body.instruction_ru, 400),
            timeout=10.0,
        )
    except Exception:
        instruction_en = body.instruction_ru

    refs = [{"data": img.data, "mime": img.mime} for img in (body.reference_images or [])]
    task = edit_image_task.apply_async(args=[
        {"data": body.base_image.data, "mime": body.base_image.mime},
        refs,
        instruction_en,
    ])
    return {"task_id": task.id, "instruction_en": instruction_en}


# ─── 4. Публикация в соцсети ─────────────────────────────────────────────────

class PublishIn(BaseModel):
    post_text: str
    image_prompt: Optional[str] = None
    image_base64: Optional[str] = None
    images_base64: Optional[list[str]] = None
    platforms: list[str]
    scheduled_at: Optional[str] = None


async def _publish_to_telegram(session: aiohttp.ClientSession, token: str, chat_id: str,
                                full_text: str, image_base64: Optional[str],
                                images_base64: Optional[list[str]] = None) -> str:
    import json as _json
    base_url = f"https://api.telegram.org/bot{token}"
    all_images = images_base64 or ([image_base64] if image_base64 else [])

    if len(all_images) > 1:
        # Album via sendMediaGroup
        form = aiohttp.FormData()
        form.add_field("chat_id", chat_id)
        media_arr = []
        for i, b64 in enumerate(all_images[:10]):
            img_bytes = base64.b64decode(b64)
            fname = f"file{i}"
            form.add_field(fname, img_bytes, filename=f"{fname}.png", content_type="image/png")
            item: dict = {"type": "photo", "media": f"attach://{fname}"}
            if i == 0:
                item["caption"] = full_text[:1024]
            media_arr.append(item)
        form.add_field("media", _json.dumps(media_arr))
        resp = await session.post(f"{base_url}/sendMediaGroup", data=form)
        result = await resp.json()
        if not result.get("ok"):
            raise ValueError(f"Telegram: {result.get('description', str(result))}")
        return str(result["result"][0]["message_id"])

    if len(all_images) == 1:
        img_bytes = base64.b64decode(all_images[0])
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
                        full_text, body.image_base64, body.images_base64,
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
