import json
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
MODEL = "claude-haiku-4-5-20251001"


async def clarify_business_profile(profile: dict) -> list[dict]:
    """Агент генерирует уточняющие вопросы к анкете"""
    prompt = f"""Ты онбординг-агент SMM-платформы для малого бизнеса.
Тебе передан черновик профиля бизнеса, заполненный пользователем.
Найди 3-5 мест где информация неполная, противоречивая или слишком общая.
Задай ТОЛЬКО уточняющие вопросы на русском языке.
НЕ задавай вопросы на которые уже есть чёткие ответы.

Профиль бизнеса:
{json.dumps(profile, ensure_ascii=False, indent=2)}

Верни ТОЛЬКО валидный JSON без markdown:
[{{"question": "...", "field": "usp", "why_important": "..."}}]"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}]
    )
    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except Exception:
        return []


async def parse_clarification_answer(question: str, answer: str, profile: dict) -> dict:
    """Обновляем профиль на основе ответа пользователя"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": f"""Вопрос был: "{question}"
Ответ пользователя: "{answer}"
Текущий профиль: {json.dumps(profile, ensure_ascii=False)}

Обнови поле в профиле согласно ответу.
Верни ТОЛЬКО обновлённый JSON профиля без markdown."""}]
    )
    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except Exception:
        return profile