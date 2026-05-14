import json
import uuid
import aiohttp
from io import BytesIO
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)


async def generate_image_prompt(slot, business_profile: dict) -> str:
    """Создаёт детальный промт для генерации изображения"""
    visual_style = business_profile.get("visual_style", "реалистичная профессиональная фотография")
    brand_colors = business_profile.get("brand_colors", [])
    idea = slot.idea or {}

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=400,
        messages=[{
            "role": "user",
            "content": f"""Создай детальный промт для генерации изображения через DALL-E или Kandinsky.

Визуальный стиль бренда: {visual_style}
Цвета бренда: {', '.join(brand_colors) if brand_colors else 'не заданы, используй нейтральные тёплые тона'}
Тема поста: {idea.get('idea', '')}
Визуальная концепция: {idea.get('visual_concept', '')}

Требования:
- Опиши реалистичную ФОТОГРАФИЮ, не иллюстрацию
- Конкретная сцена: объекты, свет, ракурс, атмосфера
- НЕ добавляй текст или надписи на изображение
- Длина: 80-120 слов на английском языке

Верни ТОЛЬКО промт на английском, без пояснений."""
        }]
    )
    return response.content[0].text.strip()


async def generate_image_dalle(prompt: str) -> bytes:
    """Генерация через каскад: Gemini 3.1 Flash Image → GPT Image 2 → GPT Image 1 Mini."""
    import asyncio
    import base64
    from app.services.gemini_image import generate_image_sync

    b64 = await asyncio.to_thread(generate_image_sync, prompt, "1:1")
    return base64.b64decode(b64)


def post_process_image(image_bytes: bytes, platform: str, logo_url: str = None) -> bytes:
    """Подгоняет размер под площадку и добавляет логотип"""
    from PIL import Image

    SIZES = {
        "vk": (1200, 1200),
        "telegram": (1280, 720),
        "ok": (1200, 1200),
    }

    img = Image.open(BytesIO(image_bytes)).convert("RGBA")
    target = SIZES.get(platform, (1200, 1200))
    img = img.resize(target, Image.LANCZOS)

    # Добавляем логотип если есть
    if logo_url:
        try:
            import httpx
            logo_bytes = httpx.get(logo_url, timeout=10).content
            logo = Image.open(BytesIO(logo_bytes)).convert("RGBA")
            logo = logo.resize((80, 80), Image.LANCZOS)
            margin = 15
            pos = (target[0] - 80 - margin, target[1] - 80 - margin)
            img.paste(logo, pos, logo)
        except Exception:
            pass  # Если логотип недоступен — пропускаем

    output = BytesIO()
    img.convert("RGB").save(output, format="JPEG", quality=92)
    return output.getvalue()


async def upload_to_s3(image_bytes: bytes, filename: str) -> str:
    """Загружает в Yandex Object Storage, возвращает публичный URL"""
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
    )
    key = f"posts/{filename}.jpg"
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=key,
        Body=image_bytes,
        ContentType="image/jpeg",
        ACL="public-read"
    )
    return f"{settings.S3_ENDPOINT}/{settings.S3_BUCKET}/{key}"


async def generate_image(prompt: str, platform: str, business_profile: dict) -> str:
    """
    Полный пайплайн: промт → картинка → обработка → S3 → URL
    """
    # На старте используем DALL-E, потом добавим Kandinsky
    image_bytes = await generate_image_dalle(prompt)

    logo_url = business_profile.get("logo_url")
    processed = post_process_image(image_bytes, platform, logo_url)

    url = await upload_to_s3(processed, str(uuid.uuid4()))
    return url
