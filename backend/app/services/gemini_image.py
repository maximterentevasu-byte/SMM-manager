"""
Генерация изображений (каскад):
1. Gemini 3.1 Flash Image  (gemini-3.1-flash-image-preview, низкое разрешение ~512px)
2. GPT Image 2             (gpt-image-2)
3. GPT Image 1 Mini        (gpt-image-1-mini)
"""
import httpx
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
