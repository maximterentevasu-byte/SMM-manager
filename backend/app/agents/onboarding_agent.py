import json
import logging
from anthropic import Anthropic
from openai import OpenAI as _OpenAI
from app.config import settings

log = logging.getLogger(__name__)
client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

_CLAUDE_MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-5.4"


async def clarify_business_profile(profile: dict) -> list[dict]:
    """
    Агент анализирует анкету и задаёт уточняющие вопросы.
    Возвращает список вопросов в формате JSON.
    """
    prompt = f"""Ты онбординг-агент SMM-платформы для малого бизнеса в России.

Тебе передан черновик анкеты бизнеса. Твоя задача — найти 3-5 мест где информация:
- неполная или слишком общая
- противоречивая
- важная для создания точного контента

Задай ТОЛЬКО уточняющие вопросы на русском языке.
НЕ задавай вопросы на которые уже есть чёткие ответы в анкете.

Примеры хороших уточнений:
- "Вы указали 'средний сегмент' — какой средний чек в рублях?"
- "Чем конкретно вы лучше конкурента X — одним предложением?"

Верни ТОЛЬКО валидный JSON массив без markdown-обёрток:
[
  {{"question": "вопрос на русском", "field": "название_поля", "why_important": "зачем это нужно"}}
]

Анкета бизнеса:
{json.dumps(profile, ensure_ascii=False, indent=2)}"""

    def _parse(text: str) -> list:
        text = text.strip().replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return []

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse(response.content[0].text)
    except Exception as e:
        log.error("[Claude clarify_business_profile] failed, falling back to GPT: %s", e)

    oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = oai.chat.completions.create(
        model=_GPT_MODEL,
        max_completion_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse(resp.choices[0].message.content)


async def parse_clarification_answer(question: str, answer: str, profile: dict) -> dict:
    """
    Обновляет профиль бизнеса на основе ответа пользователя.
    """
    prompt = f"""Тебе передан профиль бизнеса и ответ пользователя на уточняющий вопрос.
Обнови соответствующее поле в профиле согласно ответу.

Вопрос был: "{question}"
Ответ пользователя: "{answer}"

Текущий профиль:
{json.dumps(profile, ensure_ascii=False, indent=2)}

Верни ТОЛЬКО обновлённый JSON профиля без markdown-обёрток."""

    def _parse(text: str) -> dict:
        text = text.strip().replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return profile

    try:
        response = client.messages.create(
            model=_CLAUDE_MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse(response.content[0].text)
    except Exception as e:
        log.error("[Claude parse_clarification_answer] failed, falling back to GPT: %s", e)

    oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = oai.chat.completions.create(
        model=_GPT_MODEL,
        max_completion_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse(resp.choices[0].message.content)
