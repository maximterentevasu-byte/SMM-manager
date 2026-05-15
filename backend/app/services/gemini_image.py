"""
Генерация и редактирование изображений (каскад) — полностью async.
Каскад генерации:   Gemini Flash Image → gpt-image-2 → gpt-image-1-mini
Каскад редактирования: Gemini Flash Image (img2img) → gpt-image-2 edit
"""
import io
import base64
import httpx
from PIL import Image
from openai import AsyncOpenAI
from app.config import settings

_GEMINI_MODEL = "gemini-3.1-flash-image-preview"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_OAI_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "4:3":  "1536x1024",
}

_GEMINI_TIMEOUT = 90.0   # секунд на запрос к Gemini (в Celery нет HTTP-лимита)
_OAI_TIMEOUT    = 120.0  # секунд на запрос к OpenAI (edit/generate может занимать 60-90с)


# ─── Вспомогательные синхронные функции (PIL, быстрые) ───────────────────────

def _normalize_to_jpeg(img_dict: dict) -> dict:
    raw = base64.b64decode(img_dict["data"])
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=90)
    return {"data": base64.b64encode(buf.getvalue()).decode(), "mime": "image/jpeg"}


def _to_png_buf(img_dict: dict) -> io.BytesIO:
    raw = base64.b64decode(img_dict["data"])
    pil = Image.open(io.BytesIO(raw)).convert("RGBA")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    buf.name = "image.png"
    return buf


# ─── Генерация изображений ───────────────────────────────────────────────────

async def _gemini_generate(prompt: str) -> str:
    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=_GEMINI_TIMEOUT) as client:
        r = await client.post(
            url,
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["IMAGE"]},
            },
        )
    d = r.json()
    if "error" in d:
        raise ValueError(d["error"].get("message", str(d["error"])))
    for cand in d.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            b64 = part.get("inlineData", {}).get("data", "")
            if b64:
                return b64
    raise ValueError("Gemini не вернул изображение")


async def _openai_generate(prompt: str, aspect_ratio: str, model: str) -> str:
    size = _OAI_SIZE.get(aspect_ratio, "1024x1024")
    async with AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        max_retries=0,
        timeout=httpx.Timeout(connect=5.0, read=_OAI_TIMEOUT, write=5.0, pool=5.0),
    ) as client:
        resp = await client.images.generate(
            model=model,
            prompt=prompt[:1000],
            size=size,
            n=1,
        )
    b64 = resp.data[0].b64_json
    if not b64:
        raise ValueError(f"{model}: пустой ответ")
    return b64


async def generate_image(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Каскад: Gemini Flash Image → gpt-image-2 → gpt-image-1-mini."""
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            return await _gemini_generate(prompt)
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if settings.OPENAI_API_KEY:
        for model_name in ("gpt-image-2", "gpt-image-1-mini"):
            try:
                return await _openai_generate(prompt, aspect_ratio, model_name)
            except Exception as e:
                errors.append(f"{model_name}: {e}")

    raise ValueError("Все генераторы недоступны: " + " | ".join(errors))


# ─── Редактирование изображений ───────────────────────────────────────────────

async def _gemini_edit(base_image: dict, reference_images: list[dict], instruction: str) -> str:
    import asyncio
    # PIL-операции блокируют event loop — запускаем в потоке
    norm_base, norm_refs = await asyncio.to_thread(
        lambda: (
            _normalize_to_jpeg(base_image),
            [_normalize_to_jpeg(r) for r in reference_images[:13]],
        )
    )

    parts: list = []
    for img in [norm_base] + norm_refs:
        parts.append({"inlineData": {"mimeType": img["mime"], "data": img["data"]}})
    parts.append({"text": instruction})

    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    async with httpx.AsyncClient(timeout=_GEMINI_TIMEOUT) as client:
        r = await client.post(
            url,
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            },
        )
    d = r.json()
    if "error" in d:
        raise ValueError(d["error"].get("message", str(d["error"])))
    for cand in d.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            b64 = part.get("inlineData", {}).get("data", "")
            if b64:
                return b64
    texts = [
        part.get("text", "")
        for cand in d.get("candidates", [])
        for part in cand.get("content", {}).get("parts", [])
        if part.get("text")
    ]
    hint = f" Ответ: {' '.join(texts)[:300]}" if texts else ""
    raise ValueError(f"Gemini edit: нет изображения в ответе.{hint}")


async def _openai_edit(base_image: dict, reference_images: list[dict], instruction: str) -> str:
    import asyncio
    # PIL-операции блокируют event loop — запускаем в потоке
    png_buf = await asyncio.to_thread(_to_png_buf, base_image)

    async with AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        max_retries=0,
        timeout=httpx.Timeout(connect=5.0, read=_OAI_TIMEOUT, write=15.0, pool=5.0),
    ) as client:
        result = await client.images.edit(
            model="gpt-image-2",
            image=png_buf,
            prompt=instruction[:1000],
            size="1024x1024",
        )
    b64 = result.data[0].b64_json
    if not b64:
        raise ValueError("GPT Image 2 edit: пустой ответ")
    return b64


async def edit_image(
    base_image: dict,
    reference_images: list[dict],
    instruction: str,
) -> str:
    """Каскад: Gemini Flash Image (img2img) → GPT Image 2 edit."""
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            return await _gemini_edit(base_image, reference_images, instruction)
        except Exception as e:
            errors.append(f"Gemini edit: {e}")

    if settings.OPENAI_API_KEY:
        try:
            return await _openai_edit(base_image, reference_images, instruction)
        except Exception as e:
            errors.append(f"GPT Image 2 edit: {e}")

    raise ValueError("Все редакторы недоступны: " + " | ".join(errors))
