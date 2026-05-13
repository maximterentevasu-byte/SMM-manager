import json
from anthropic import AsyncAnthropic
from app.config import settings

client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def refine_strategy(current_strategy: list, user_message: str, business_profile: dict) -> list:
    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8000,
        messages=[{"role": "user", "content": f"""Ты SMM-стратег. Пользователь хочет изменить контент-стратегию.

Текущая стратегия:
{json.dumps(current_strategy, ensure_ascii=False, indent=2)}

Запрос пользователя: {user_message}

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False, indent=2)}

Внеси изменения согласно запросу. Верни ПОЛНУЮ обновлённую стратегию в том же JSON формате.
Только JSON, без markdown и пояснений."""}]
    )
    text = response.content[0].text.strip().replace("```json", "").replace("```", "").strip()
    return json.loads(text)


async def generate_strategy(business_profile: dict) -> list[dict]:
    """
    Генерирует полную контент-стратегию на 3 месяца
    на основе профиля бизнеса.
    """
    platforms = business_profile.get("platforms", ["vk"])

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=8000,
        messages=[{
            "role": "user",
            "content": f"""Ты ведущий SMM-стратег с опытом работы с малым бизнесом в России.

Тебе передан профиль бизнеса. Создай контент-стратегию для следующих площадок: {', '.join(platforms)}

Для КАЖДОЙ площадки верни объект:
{{
  "platform": "vk" | "telegram" | "ok",
  "goal": "описание основной цели присутствия на площадке",
  "target_audience": "кто именно читает эту площадку у данного бизнеса",
  "tone": "тональность общения (может отличаться от общего brand_voice)",
  "posts_per_week": 3,
  "best_posting_times": ["09:00", "18:00", "20:00"],
  "content_mix": {{
    "sales": 20,
    "educational": 40,
    "entertainment": 30,
    "ugc_triggers": 10
  }},
  "content_pillars": ["тема1", "тема2", "тема3"],
  "rubrics": [
    {{
      "name": "название рубрики",
      "goal": "что даёт эта рубрика",
      "format": "текст | карточки | фото | видео",
      "tone": "тональность рубрики",
      "structure": ["элемент1", "элемент2", "элемент3"],
      "example_topics": ["конкретная тема1", "конкретная тема2"],
      "forbidden": ["что нельзя в этой рубрике"],
      "frequency": "2 раза в неделю",
      "type": "sales | educational | entertainment"
    }}
  ]
}}

Требования к рубрикам:
- 6-8 рубрик на каждую площадку
- Рубрики должны быть конкретными, не шаблонными
- Учитывай специфику бизнеса и аудитории
- Соотношение типов должно соответствовать content_mix

Верни JSON-массив для всех площадок. Только JSON, без markdown и пояснений.

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False, indent=2)}"""
        }]
    )

    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Не удалось распарсить стратегию: {e}\nОтвет модели: {text[:500]}")
