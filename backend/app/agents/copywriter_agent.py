import json
import logging
from anthropic import Anthropic
from openai import OpenAI as _OpenAI
from app.config import settings

log = logging.getLogger(__name__)
client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

_CLAUDE_MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-5.4"

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

    products_list = business_profile.get('products', [])
    products_str = ", ".join(products_list) if products_list else "не указан"
    address = business_profile.get('address', '')
    contact_info = business_profile.get('contact_info', '')
    active_promotions = business_profile.get('active_promotions', '')

    prompt = f"""Ты SMM-копирайтер для бренда "{business_profile.get('name', business_profile.get('business', {}).get('name', 'бизнес'))}".

ФАКТЫ О БИЗНЕСЕ (используй ТОЛЬКО их — ничего не придумывай):
- Ниша: {business_profile.get('niche', business_profile.get('business', {}).get('niche', ''))}
- Голос бренда: {business_profile.get('brand_voice', '')}
- Аудитория: {business_profile.get('audience_primary', business_profile.get('audience', {}).get('primary', ''))}
- Боли аудитории: {', '.join(business_profile.get('audience_pains', business_profile.get('audience', {}).get('pains', [])))}
- Товары/услуги: {products_str}
- Адрес: {address if address else 'не указан — не упоминай адрес'}
- Контакты: {contact_info if contact_info else 'не указаны — не упоминай контакты'}
- Текущие акции: {active_promotions if active_promotions else 'нет активных акций — не придумывай'}
- Запрещено: {', '.join(business_profile.get('content_restrictions', []))}

⛔ СТРОГИЕ ЗАПРЕТЫ:
- НЕ придумывай адреса, улицы, метро, ориентиры
- НЕ придумывай акции, скидки, конкурсы, механики призов
- НЕ придумывай товары, которых нет в списке выше
- НЕ придумывай имена сотрудников, клиентов, блогеров
- НЕ указывай конкретные даты, которых нет в профиле
- Если факта нет — пиши обобщённо или обойди эту деталь

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

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        log.error("[Claude copywriter] failed, falling back to GPT: %s", e)

    oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = oai.chat.completions.create(
        model=_GPT_MODEL,
        max_completion_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"text": raw, "hashtags": [], "char_count": len(raw)}
