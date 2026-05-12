"""
Генерация изображений через Google Imagen 4 (imagen-4.0-generate-001).
Возвращает base64-строку PNG.
"""
import httpx
from app.config import settings

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
_MODEL = "imagen-4.0-generate-001"


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Синхронная генерация — запускать через asyncio.to_thread."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY не задан в переменных окружения.")

    r = httpx.post(
        f"{_BASE}/{_MODEL}:predict?key={settings.GEMINI_API_KEY}",
        json={
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
            },
        },
        timeout=90,
    )

    data = r.json()
    if "error" in data:
        raise ValueError(f"Gemini API ошибка: {data['error'].get('message', data['error'])}")

    predictions = data.get("predictions") or []
    if not predictions:
        raise ValueError("Imagen не вернул изображение. Проверь промт — возможно нарушает политику.")

    b64 = predictions[0].get("bytesBase64Encoded", "")
    if not b64:
        raise ValueError("Imagen вернул пустое изображение.")
    return b64
