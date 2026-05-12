"""
Генерация изображений:
1. gemini-2.5-flash-image (бесплатно, generateContent)
2. DALL-E 3 (OpenAI, fallback при 429 или ошибке Gemini)
"""
import httpx
from app.config import settings

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_GEMINI_MODEL = "gemini-2.5-flash-image"

_DALLE_SIZE = {
    "1:1":  "1024x1024",
    "16:9": "1792x1024",
    "9:16": "1024x1792",
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
    size = _DALLE_SIZE.get(aspect_ratio, "1024x1024")
    resp = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size=size,
        quality="standard",
        n=1,
        response_format="b64_json",
    )
    b64 = resp.data[0].b64_json
    if not b64:
        raise ValueError("DALL-E не вернул изображение.")
    return b64


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Синхронная генерация — запускать через asyncio.to_thread."""
    gemini_ok = bool(settings.GEMINI_API_KEY)
    dalle_ok = bool(settings.OPENAI_API_KEY)

    if not gemini_ok and not dalle_ok:
        raise ValueError("Нет доступных API ключей для генерации изображений.")

    if gemini_ok:
        try:
            return _gemini(prompt)
        except ValueError as e:
            msg = str(e).lower()
            # 429 rate limit или paid-only — пробуем DALL-E
            if not (dalle_ok and ("quota" in msg or "paid" in msg or "billing" in msg or "rate" in msg or "429" in msg)):
                raise  # Другая ошибка — пробрасываем

    if dalle_ok:
        return _dalle(prompt, aspect_ratio)

    raise ValueError("Gemini недоступен. Добавьте OPENAI_API_KEY для DALL-E.")
