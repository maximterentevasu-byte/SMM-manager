import json
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

PLATFORM_SPECS = {
    "vk": {
        "ideal_length": 700,
        "emoji_style": "умеренно (2-5 на пост)",
        "hashtag_count": "5-10",
        "notes": "ВКонтакте. Читают вдумчиво. Длинный текст норм."
    },
    "telegram": {
        "ideal_length": 500,
        "emoji_style": "активно, но уместно",
        "hashtag_count": "0-3",
        "notes": "Telegram-канал. Короче и живее чем VK."
    },
    "ok": {
        "ideal_length": 400,
        "emoji_style": "минимально",
        "hashtag_count": "3-5",
        "notes": "Одноклассники. Аудитория 40+. Простой язык."
    }
}


async def generate_post_text(slot, business_profile: dict) -> dict:
    """
    Генерирует текст поста на основе:
    - слота (рубрика + идея)
    - профиля бизнеса
    """
    platform_spec = PLATFORM_SPECS.get(slot.platform, PLATFORM_SPECS["vk"])
    rubric = slot.rubric
    idea = slot.idea or {}

    prompt = f"""Ты SMM-копирайтер для бренда "{business_profile.get('business', {}).get('name', 'бизнес')}".

ПРОФИЛЬ БРЕНДА:
- Ниша: {business_profile.get('business', {}).get('niche', '')}
- Голос бренда: {business_profile.get('brand_voice', '')}
- Аудитория: {business_profile.get('audience', {}).get('primary', '')}
- Боли аудитории: {', '.join(business_profile.get('audience', {}).get('pains', []))}
- Запрещено: {', '.join(business_profile.get('content_restrictions', []))}

ПЛОЩАДКА: {platform_spec['notes']}

ЗАДАНИЕ:
- Рубрика: {rubric.get('name', '')}
- Структура рубрики: {' → '.join(rubric.get('structure', []))}
- Тональность: {rubric.get('tone', '')}
- Тема поста: {idea.get('idea', '')}
- Угол подачи: {idea.get('angle', '')}
- Начни с: "{idea.get('hook', '')}"
- Запрещено в этой рубрике: {', '.join(rubric.get('forbidden', []))}

ТЕХНИЧЕСКИЕ ТРЕБОВАНИЯ:
- Длина: около {platform_spec['ideal_length']} символов
- Эмодзи: {platform_spec['emoji_style']}
- Хэштеги: {platform_spec['hashtag_count']} штук В САМОМ КОНЦЕ через пробел

Верни ТОЛЬКО JSON без markdown:
{{"text": "полный текст поста без хэштегов", "hashtags": ["тег1", "тег2"], "char_count": 500}}"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback — возвращаем текст как есть
        return {"text": text, "hashtags": [], "char_count": len(text)}
