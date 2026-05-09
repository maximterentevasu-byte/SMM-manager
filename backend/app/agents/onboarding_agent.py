import json
from anthropic import Anthropic
from app.config import settings

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)


async def clarify_business_profile(profile: dict) -> list[dict]:
    """
    Агент анализирует анкету и задаёт уточняющие вопросы.
    Возвращает список вопросов в формате JSON.
    """
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": f"""Ты онбординг-агент SMM-платформы для малого бизнеса в России.

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
        }]
    )

    text = response.content[0].text.strip()
    # Убираем markdown если Claude добавил
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Если не удалось распарсить — возвращаем пустой список
        return []


async def parse_clarification_answer(question: str, answer: str, profile: dict) -> dict:
    """
    Обновляет профиль бизнеса на основе ответа пользователя.
    """
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": f"""Тебе передан профиль бизнеса и ответ пользователя на уточняющий вопрос.
Обнови соответствующее поле в профиле согласно ответу.

Вопрос был: "{question}"
Ответ пользователя: "{answer}"

Текущий профиль:
{json.dumps(profile, ensure_ascii=False, indent=2)}

Верни ТОЛЬКО обновлённый JSON профиля без markdown-обёрток."""
        }]
    )

    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return profile  # Если ошибка — возвращаем исходный профиль
