"""
Генерация изображений через Gemini 2.0 Flash Image (Nano Banana 2).
Использует generateContent с responseModalities: ["IMAGE"].
Возвращает base64-строку PNG/JPEG.
"""
import httpx
from app.config import settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_MODEL = "gemini-2.0-flash-preview-image-generation"


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Синхронная генерация — запускать через asyncio.to_thread."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY не задан в переменных окружения.")

    # Вставляем aspect ratio в промт, модель это понимает
    ar_hint = {
        "1:1":  "square format (1:1 aspect ratio)",
        "16:9": "wide landscape format (16:9 aspect ratio)",
        "9:16": "vertical portrait format (9:16 aspect ratio)",
        "4:3":  "standard landscape format (4:3 aspect ratio)",
    }.get(aspect_ratio, "square format (1:1 aspect ratio)")

    full_prompt = f"{prompt}. Output as {ar_hint}."

    r = httpx.post(
        f"{_BASE}/{_MODEL}:generateContent?key={settings.GEMINI_API_KEY}",
        json={
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"]},
        },
        timeout=90,
    )

    data = r.json()

    if "error" in data:
        raise ValueError(f"Gemini API ошибка: {data['error'].get('message', data['error'])}")

    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini не вернул кандидатов. Проверь промт или лимиты.")

    parts = candidates[0].get("content", {}).get("parts") or []
    for part in parts:
        inline = part.get("inlineData") or part.get("inline_data")
        if inline:
            b64 = inline.get("data", "")
            if b64:
                return b64

    raise ValueError("Gemini не вернул изображение. Возможно промт нарушает политику контента.")
