"""
Генерация изображений:
1. gemini-2.5-flash-image (бесплатно, generateContent)
2. DALL-E 3 (OpenAI, fallback при 429 или ошибке Gemini)
"""
import httpx
from app.config import settings

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_GEMINI_MODEL = "gemini-2.5-flash-image"

_GPT_IMAGE_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "4:3":  "1536x1024",
}

_DALLE3_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
    "4:3":  "1024x1024",
}

_DALLE2_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1024x1024",
    "9:16": "1024x1024",
    "4:3":  "1024x1024",
}


def _gemini(prompt: str) -> str:
    url = f"{_GEMINI_BASE}/{_GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    r = httpx.post(
        url,
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        },
        timeout=90,
    )
    d = r.json()
    if "error" in d:
        raise ValueError(d["error"].get("message", str(d["error"])))
    for cand in d.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            b64 = part.get("inlineData", {}).get("data", "")
            if b64:
                return b64
    raise ValueError("Gemini не вернул изображение.")


def _dalle(prompt: str, aspect_ratio: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    # gpt-image-1 — новейшая модель OpenAI (не требует response_format, всегда b64)
    # dall-e-3 / dall-e-2 — fallback для старых аккаунтов
    models = [
        ("gpt-image-1", _GPT_IMAGE_SIZE.get(aspect_ratio, "1024x1024"),
         {"quality": "medium"}),
        ("dall-e-3",    _DALLE3_SIZE.get(aspect_ratio, "1024x1024"),
         {"quality": "standard", "response_format": "b64_json"}),
        ("dall-e-2",    _DALLE2_SIZE.get(aspect_ratio, "1024x1024"),
         {"response_format": "b64_json"}),
    ]

    last_error = "неизвестная ошибка"
    for model, size, extra in models:
        try:
            resp = client.images.generate(
                model=model,
                prompt=prompt[:1000],
                size=size,
                n=1,
                **extra,
            )
            b64 = resp.data[0].b64_json
            if b64:
                return b64
        except Exception as e:
            last_error = str(e)
            if "does not exist" in last_error.lower():
                continue  # модели нет → пробуем следующую
            raise ValueError(f"OpenAI ({model}): {e}") from e

    raise ValueError(f"OpenAI: ни одна модель генерации изображений недоступна. {last_error}")


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Синхронная генерация — запускать через asyncio.to_thread."""
    gemini_ok = bool(settings.GEMINI_API_KEY)
    dalle_ok = bool(settings.OPENAI_API_KEY)

    if not gemini_ok and not dalle_ok:
        raise ValueError("Нет доступных API ключей для генерации изображений.")

    gemini_error = None
    if gemini_ok:
        try:
            return _gemini(prompt)
        except ValueError as e:
            gemini_error = str(e)
            if not dalle_ok:
                raise

    if dalle_ok:
        try:
            return _dalle(prompt, aspect_ratio)
        except ValueError as e:
            raise ValueError(
                f"Все генераторы недоступны. Gemini: {gemini_error or 'не настроен'}. DALL-E: {e}"
            ) from e

    raise ValueError("Gemini недоступен. Добавьте OPENAI_API_KEY для DALL-E.")
