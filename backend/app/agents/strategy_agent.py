import json
import re
import logging
from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from app.config import settings

log = logging.getLogger(__name__)
client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

_CLAUDE_MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-4o"


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
    platforms_list = ", ".join(ps.get("platform", "") for ps in current_strategy)
    msg_content = f"""Ты SMM-стратег. Пользователь хочет изменить контент-стратегию.

Текущая стратегия:
{json.dumps(current_strategy, ensure_ascii=False, indent=2)}

Запрос пользователя: {user_message}

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False, indent=2)}

Внеси изменения согласно запросу. Верни ПОЛНУЮ обновлённую стратегию в том же JSON формате.
КРИТИЧЕСКИ ВАЖНО: стратегия должна содержать объекты ДЛЯ КАЖДОЙ из {len(current_strategy)} платформ: {platforms_list}.
Не удаляй и не пропускай ни одну платформу — даже если запрос касается только одной.
Верни ТОЛЬКО валидный JSON-массив. Без markdown, без комментариев, без trailing commas."""

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


def _extract_chat_response(raw: str) -> str:
    """Извлекает текст ответа из JSON или возвращает raw-текст если JSON не распарсился."""
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip()
    # Пробуем найти JSON-объект в тексте
    m = re.search(r'\{[^{}]*"response"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}', cleaned)
    if m:
        return m.group(1).replace('\\"', '"').replace("\\n", "\n")
    try:
        data = json.loads(cleaned)
        if isinstance(data, dict) and "response" in data:
            return data["response"]
    except json.JSONDecodeError:
        pass
    # Если Claude вернул просто текст без JSON — используем как есть
    return cleaned if cleaned else ""


async def strategy_chat(user_message: str, strategy: list | None, profile: dict) -> dict:
    """Разговорный AI-чат по стратегии. Работает с профилем и без стратегии."""
    has_strategy = bool(strategy)

    # --- Строим контекст ---
    ctx: list[str] = []

    if profile:
        name = profile.get("name", "")
        niche = profile.get("niche", "")
        audience = profile.get("target_audience", "")
        voice = profile.get("brand_voice", "")
        ctx.append(f"Бизнес: «{name}», ниша: {niche or 'не указана'}")
        if audience:
            ctx.append(f"Целевая аудитория: {audience}")
        if voice:
            ctx.append(f"Тональность бренда: {voice}")
    else:
        ctx.append("Профиль бизнеса: не заполнен")

    if has_strategy:
        for ps in strategy:
            platform = ps.get("platform", "?").upper()
            rubrics = ps.get("rubrics", [])
            goal = ps.get("goal", "")
            lines = [f"\nПлатформа {platform}" + (f" (цель: {goal})" if goal else "") + ":"]
            for r in rubrics:
                rname = r.get("name", "")
                rtype = r.get("type", "")
                rfreq = r.get("frequency", "")
                lines.append(f"  • [{rtype}] {rname}" + (f" — {rfreq}" if rfreq else ""))
            ctx.append("\n".join(lines))
    else:
        ctx.append("Стратегия: ещё не создана")

    context = "\n".join(ctx)

    system = """Ты АИСТ — AI-помощник SMM-платформы smmplatform. Помогаешь с контент-стратегией.

Типы рубрик в системе:
• sales — продающий контент (акции, товары, цены, кейсы)
• educational — обучающий (советы, инструкции, FAQ, лайфхаки)
• entertainment — развлекательный (юмор, истории, мемы, тренды)
• ugc_triggers — провокации к UGC: конкурсы, опросы, «покажи как ты используешь», просьбы поделиться опытом, марафоны, челленджи

Правила ответа:
— Если просят добавить рубрику определённого типа — предложи 2-3 конкретных варианта с названием, форматом и примером темы. Учитывай нишу бизнеса.
— Если просят изменить стратегию — кратко (1-2 предложения) опиши что именно изменишь, затем добавь: «Нажми "Применить изменение" под этим сообщением — и стратегия обновится.»
— Если задают вопрос по SMM — отвечай кратко и конкретно.
— Если стратегии нет — объясни: нужно заполнить профиль бизнеса и пройти онбординг.

Отвечай только на русском. Максимум 5 предложений. Без воды.
Верни ТОЛЬКО валидный JSON: {"response": "текст ответа"}"""

    full_msg = f"{context}\n\nЗапрос пользователя: {user_message}"
    messages = [{"role": "user", "content": full_msg}]

    try:
        resp = await client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=800,
            system=system,
            messages=messages,
        )
        text = _extract_chat_response(resp.content[0].text)
        if text:
            return {"response": text}
    except Exception as e:
        log.error("[Claude strategy_chat] failed: %s", e)

    try:
        gpt_messages = [{"role": "system", "content": system}] + messages
        text = await _gpt_strategy(gpt_messages, 800)
        extracted = _extract_chat_response(text)
        if extracted:
            return {"response": extracted}
    except Exception as e:
        log.error("[GPT strategy_chat] fallback failed: %s", e)

    if not has_strategy:
        return {"response": "Стратегия ещё не создана. Заполните профиль бизнеса и пройдите онбординг — после этого здесь появятся рубрики, которые можно корректировать."}
    return {"response": "Не удалось получить ответ. Попробуйте ещё раз."}


async def generate_strategy(
    business_profile: dict,
    analytics_context: str = "",
    market_insights: str = "",
) -> list[dict]:
    """
    Генерирует полную контент-стратегию на 3 месяца
    на основе профиля бизнеса, аналитики и рыночных инсайтов.
    """
    platforms = business_profile.get("platforms", ["vk"])

    extra_context = ""
    if analytics_context:
        extra_context += f"\n\n{analytics_context}"
    if market_insights:
        extra_context += f"\n\n{market_insights}"

    msg_content = f"""Ты ведущий SMM-стратег с опытом работы с малым бизнесом в России.

Тебе передан профиль бизнеса. Создай контент-стратегию для следующих площадок: {', '.join(platforms)}
{extra_context}

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
- Если есть данные аналитики компании — скорректируй best_posting_times под реальные best_day/best_hour
- Если есть рыночные инсайты — используй вирусные форматы и темы при создании рубрик и example_topics

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
