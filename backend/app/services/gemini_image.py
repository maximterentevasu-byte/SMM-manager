"""
Генерация изображений через Google Gemini Imagen 3.
Возвращает base64-строку PNG.
"""
import httpx
from app.config import settings

_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta"
    "/models/imagen-3.0-generate-001:predict"
)


def generate_image_sync(prompt: str, aspect_ratio: str = "1:1") -> str:
    """Синхронная генерация — запускать через asyncio.to_thread."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY не задан в переменных окружения.")

    r = httpx.post(
        f"{_ENDPOINT}?key={settings.GEMINI_API_KEY}",
        json={
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
                "safetyFilterLevel": "block_few",
                "personGeneration": "allow_adult",
            },
        },
        timeout=90,
    )

    data = r.json()
    if "error" in data:
        raise ValueError(f"Gemini API ошибка: {data['error'].get('message', data['error'])}")

    predictions = data.get("predictions") or []
    if not predictions:
        raise ValueError("Gemini не вернул изображение. Проверь промт — возможно он нарушает политику.")

    b64 = predictions[0].get("bytesBase64Encoded", "")
    if not b64:
        raise ValueError("Gemini вернул пустое изображение.")
    return b64
