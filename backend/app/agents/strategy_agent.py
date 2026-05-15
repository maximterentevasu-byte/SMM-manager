import json
import re
import logging
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from app.config import settings

log = logging.getLogger(__name__)
client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

_CLAUDE_MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-5.4"


async def _gpt_strategy(messages: list, max_tokens: int) -> str:
    async with AsyncOpenAI(api_key=settings.OPENAI_API_KEY) as oai:
        resp = await oai.chat.completions.create(
            model=_GPT_MODEL,
            max_completion_tokens=max_tokens,
            messages=messages,
        )
    return resp.choices[0].message.content.strip()


def _parse_json(text: str):
    """Парсит JSON из ответа LLM, исправляя частые ошибки форматирования."""
    # Убираем markdown-блоки
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    # Убираем trailing commas перед ] или }
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    # Убираем однострочные комментарии
    text = re.sub(r"//[^\n]*", "", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Пытаемся вытащить JSON-массив из текста
    m = re.search(r"(\[[\s\S]*\])", text)
    if m:
        cleaned = re.sub(r",(\s*[}\]])", r"\1", m.group(1))
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("Не удалось извлечь JSON из ответа модели", text, 0)


async def refine_strategy(current_strategy: list, user_message: str, business_profile: dict) -> list:
    msg_content = f"""Ты SMM-стратег. Пользователь хочет изменить контент-стратегию.

Текущая стратегия:
{json.dumps(current_strategy, ensure_ascii=False, indent=2)}

Запрос пользователя: {user_message}

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False, indent=2)}

Внеси изменения согласно запросу. Верни ПОЛНУЮ обновлённую стратегию в том же JSON формате.
ВАЖНО: верни ТОЛЬКО валидный JSON-массив. Без markdown, без комментариев, без trailing commas."""

    try:
        response = await client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=16000,
            messages=[{"role": "user", "content": msg_content}],
        )
        return _parse_json(response.content[0].text)
    except Exception as e:
        log.error("[Claude refine_strategy] failed, falling back to GPT: %s", e)

    text = await _gpt_strategy([{"role": "user", "content": msg_content}], 16000)
    return _parse_json(text)


async def generate_strategy(business_profile: dict) -> list[dict]:
    """
    Генерирует полную контент-стратегию на 3 месяца
    на основе профиля бизнеса.
    """
    platforms = business_profile.get("platforms", ["vk"])

    msg_content = f"""Ты ведущий SMM-стратег с опытом работы с малым бизнесом в России.

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

Верни JSON-массив для всех площадок. ТОЛЬКО валидный JSON, без markdown, без комментариев, без trailing commas.

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False, indent=2)}"""

    try:
        response = await client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=16000,
            messages=[{"role": "user", "content": msg_content}],
        )
        return _parse_json(response.content[0].text)
    except Exception as e:
        log.error("[Claude generate_strategy] failed, falling back to GPT: %s", e)

    text = await _gpt_strategy([{"role": "user", "content": msg_content}], 16000)
    return _parse_json(text)
