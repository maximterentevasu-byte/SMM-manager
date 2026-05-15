"""
Генерация и редактирование изображений (каскад):
ГЕНЕРАЦИЯ:   Gemini 3.1 Flash Image → GPT Image 2 → GPT Image 1 Mini
РЕДАКТИРОВАНИЕ: Gemini 3.1 Flash Image (Image-to-Image) → GPT Image 2 edit
"""
import io
import base64
import httpx
from PIL import Image
from openai import OpenAI
from app.config import settings

_GEMINI_MODEL = "gemini-3.1-flash-image-preview"
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# Размеры для OpenAI
_OAI_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "4:3":  "1536x1024",
}


def _gemini(prompt: str) -> str:
    """Gemini 3.1 Flash Image — низкое разрешение (~512px), REST API."""
    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    r = httpx.post(
        url,
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
            },
        },
        timeout=45,
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


def _openai_image(prompt: str, aspect_ratio: str, model: str) -> str:
    """GPT Image 2 или GPT Image 1 Mini — OpenAI Images API."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    size = _OAI_SIZE.get(aspect_ratio, "1024x1024")
    resp = client.images.generate(
        model=model,
        prompt=prompt[:1000],
        size=size,
        n=1,
    )
    b64 = resp.data[0].b64_json
    if not b64:
        raise ValueError(f"{model}: пустой ответ")
    return b64


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """
    Синхронная генерация — запускать через asyncio.to_thread.
    Каскад: Gemini 3.1 Flash Image → GPT Image 2 → GPT Image 1 Mini
    """
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            return _gemini(prompt)
        except Exception as e:
            errors.append(f"Gemini: {e}")

    if settings.OPENAI_API_KEY:
        for model_name in ("gpt-image-2", "gpt-image-1-mini"):
            try:
                return _openai_image(prompt, aspect_ratio, model_name)
            except Exception as e:
                errors.append(f"{model_name}: {e}")

    raise ValueError("Все генераторы недоступны: " + " | ".join(errors))


# ─── Редактирование изображений ───────────────────────────────────────────────

def _gemini_edit(base_image: dict, reference_images: list[dict], instruction: str) -> str:
    """Gemini Image-to-Image редактирование через REST API."""
    # Нормализуем изображения в JPEG чтобы mime-тип всегда совпадал с данными
    norm_base = _normalize_to_jpeg(base_image)
    norm_refs = [_normalize_to_jpeg(r) for r in reference_images[:13]]

    # Images must come before the instruction text
    parts: list = []
    for img in [norm_base] + norm_refs:
        parts.append({
            "inlineData": {
                "mimeType": img["mime"],
                "data": img["data"],
            }
        })
    parts.append({"text": instruction})
    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    r = httpx.post(
        url,
        json={
            "contents": [{"parts": parts}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        },
        timeout=50,
    )
    d = r.json()
    if "error" in d:
        raise ValueError(d["error"].get("message", str(d["error"])))
    for cand in d.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            b64 = part.get("inlineData", {}).get("data", "")
            if b64:
                return b64
    # Surface any text Gemini returned for debugging
    texts = [
        part.get("text", "")
        for cand in d.get("candidates", [])
        for part in cand.get("content", {}).get("parts", [])
        if part.get("text")
    ]
    hint = f" Ответ: {' '.join(texts)[:300]}" if texts else ""
    raise ValueError(f"Gemini edit: нет изображения в ответе.{hint}")


def _normalize_to_jpeg(img_dict: dict) -> dict:
    """Нормализует изображение в JPEG — снимает проблему несовпадения mime-типа."""
    raw = base64.b64decode(img_dict["data"])
    pil = Image.open(io.BytesIO(raw)).convert("RGB")
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=90)
    return {"data": base64.b64encode(buf.getvalue()).decode(), "mime": "image/jpeg"}


def _to_png_buf(img_dict: dict) -> io.BytesIO:
    """Конвертирует base64-изображение в PNG BytesIO (для OpenAI edit API)."""
    raw = base64.b64decode(img_dict["data"])
    pil = Image.open(io.BytesIO(raw)).convert("RGBA")
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    buf.seek(0)
    buf.name = "image.png"
    return buf


def _openai_edit(base_image: dict, reference_images: list[dict], instruction: str) -> str:
    """GPT Image 2 редактирование через images.edit API."""
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    images = [_to_png_buf(base_image)]
    for ref in reference_images[:6]:
        images.append(_to_png_buf(ref))
    result = client.images.edit(
        model="gpt-image-2",
        image=images,
        prompt=instruction[:1000],
        size="1024x1024",
        timeout=50,
    )
    b64 = result.data[0].b64_json
    if not b64:
        raise ValueError("GPT Image 2 edit: пустой ответ")
    return b64


def edit_image_sync(
    base_image: dict,
    reference_images: list[dict],
    instruction: str,
) -> str:
    """
    Синхронное редактирование — запускать через asyncio.to_thread.
    Каскад: Gemini 3.1 Flash Image (Image-to-Image) → GPT Image 2 edit
    """
    errors: list[str] = []

    if settings.GEMINI_API_KEY:
        try:
            return _gemini_edit(base_image, reference_images, instruction)
        except Exception as e:
            errors.append(f"Gemini edit: {e}")

    if settings.OPENAI_API_KEY:
        try:
            return _openai_edit(base_image, reference_images, instruction)
        except Exception as e:
            errors.append(f"GPT Image 2 edit: {e}")

    raise ValueError("Все редакторы недоступны: " + " | ".join(errors))
