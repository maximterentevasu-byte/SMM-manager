import logging
import anthropic
import json
import uuid
from datetime import datetime
from calendar import monthrange
from openai import OpenAI as _OpenAI

from app.config import settings

log = logging.getLogger(__name__)
MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-5.4"

RU_HOLIDAYS = {
    "01-01": "Новый год", "01-07": "Рождество",
    "02-23": "День защитника отечества",
    "03-08": "Международный женский день",
    "05-01": "Праздник весны и труда",
    "05-09": "День Победы", "06-12": "День России",
    "11-04": "День народного единства",
}


def get_post_days(year: int, month: int, posts_per_week: int) -> list:
    _, days_in_month = monthrange(year, month)
    all_days = [datetime(year, month, d) for d in range(1, days_in_month + 1)]
    selected = []
    week_days = []

    for day in all_days:
        week_days.append(day)
        if day.weekday() == 6 or day == all_days[-1]:
            if week_days:
                step = max(1, len(week_days) // max(posts_per_week, 1))
                for i in range(min(posts_per_week, len(week_days))):
                    idx = min(i * step, len(week_days) - 1)
                    selected.append(week_days[idx])
            week_days = []

    return selected


def build_content_plan(strategy: list, business_profile: dict, year: int, month: int) -> list:
    slots = []
    holidays = {k: v for k, v in RU_HOLIDAYS.items() if k.startswith(f"{month:02d}-")}

    for platform_strategy in strategy:
        platform = platform_strategy["platform"]
        posts_per_week = platform_strategy.get("posts_per_week", 3)
        best_times = platform_strategy.get("best_posting_times", ["12:00", "18:00"])
        rubrics = platform_strategy.get("rubrics", [])

        if not rubrics:
            continue

        post_days = get_post_days(year, month, posts_per_week)
        rubric_idx = 0
        last_type = None

        for i, day in enumerate(post_days):
            time_str = best_times[i % len(best_times)]
            hour, minute = map(int, time_str.split(":"))
            scheduled_at = day.replace(hour=hour, minute=minute)

            rubric = rubrics[rubric_idx % len(rubrics)]
            attempts = 0
            while rubric.get("type") == "sales" and last_type == "sales" and attempts < len(rubrics):
                rubric_idx += 1
                rubric = rubrics[rubric_idx % len(rubrics)]
                attempts += 1

            date_key = day.strftime("%m-%d")
            slot = {
                "slot_id": str(uuid.uuid4()),
                "platform": platform,
                "scheduled_at": scheduled_at.isoformat(),
                "rubric": rubric,
                "holiday": holidays.get(date_key),
                "status": "planned",
            }
            slots.append(slot)
            last_type = rubric.get("type")
            rubric_idx += 1

    return sorted(slots, key=lambda x: x["scheduled_at"])


async def generate_ideas_for_slots(slots_meta: list, business_profile: dict) -> list:
    if not slots_meta:
        return []

    # Отправляем пакетом — не более 15 слотов за раз
    all_ideas = []
    batch_size = 15

    for i in range(0, len(slots_meta), batch_size):
        batch = slots_meta[i:i + batch_size]
        batch_simple = [
            {
                "slot_id": s["slot_id"],
                "platform": s["platform"],
                "rubric_name": s["rubric"]["name"],
                "rubric_goal": s["rubric"].get("goal", ""),
                "date": s["scheduled_at"][:10],
                "holiday": s.get("holiday"),
            }
            for s in batch
        ]

        products_list = business_profile.get('products', [])
        products_str = ", ".join(products_list) if products_list else "не указан"
        address = business_profile.get('address', '')
        contact_info = business_profile.get('contact_info', '')
        active_promotions = business_profile.get('active_promotions', '')
        usp = business_profile.get('usp', '')

        prompt = f"""Ты SMM-стратег. Придумай конкретные идеи постов для каждого слота и классифицируй их.

ПРОФИЛЬ БИЗНЕСА:
- Название: {business_profile.get('name', '')}
- Ниша: {business_profile.get('niche', '')}
- УТП: {usp}
- Голос бренда: {business_profile.get('brand_voice', '')}
- Аудитория: {business_profile.get('audience_primary', '')}
- Адрес: {address if address else 'не указан'}
- Контакты: {contact_info if contact_info else 'не указаны'}

ВАЖНЫЙ КОНТЕКСТ:
Онбординг не предоставил список конкретных товаров/услуг, цен, акций, ивентов и дат —
это "чувствительная информация", которой владеет только хозяин бизнеса.
AI не может её выдумывать. Поэтому любой пост, требующий такой конкретики, ОБЯЗАН
получить статус is_sensitive = true, а вопросы к владельцу — обязательны.

КЛАССИФИКАЦИЯ ПОСТОВ — обязательно для каждого:

is_sensitive = false (Категория 1 — AI пишет самостоятельно):
Только посты, где конкретика от владельца НЕ нужна:
- Образовательный / полезный контент по теме ниши (топ-5, лайфхаки, гиды)
- Лайфстайл и вдохновение БЕЗ привязки к конкретному товару или услуге
- Общие советы, тренды, интересные факты о нише
- Брендовые ценности и философия без упоминания конкретных продуктов
→ AI СГЕНЕРИРУЕТ ТЕКСТ САМОСТОЯТЕЛЬНО, не упоминая конкретный ассортимент

is_sensitive = true (Категория 2 — нужно спросить у владельца):
ЛЮБОЙ пост, где необходимо что-либо из списка ниже:
- Конкретный товар или услуга из ассортимента (название, описание, цена, фото)
- Конкретный сотрудник (имя, история, должность, фото)
- Рецепт, обзор или демонстрация конкретного продукта
- Акция, скидка, спецпредложение — любое с условиями
- Ивент, мероприятие, дегустация — с датой или деталями
- Анонс новинки, поступления, расширения ассортимента
- Фото магазина, зала, кухни, товара, команды, процесса
- Конкурс, опрос, розыгрыш с конкретными условиями
- Бонусная программа: конкретные условия, кэшбэк, пороги
→ НУЖНО СПРОСИТЬ У ВЛАДЕЛЬЦА — без его данных пост будет недостоверным

ПРАВИЛО: при малейшем сомнении — ставь is_sensitive = true. Лучше спросить у владельца,
чем AI выдумает несуществующий товар, акцию или дату.

Если is_sensitive = true: сгенерируй info_questions (2-4 конкретных вопроса к владельцу бизнеса, на русском языке, заканчиваются на "?").

Слоты:
{json.dumps(batch_simple, ensure_ascii=False, indent=2)}

Для каждого слота верни объект:
{{
  "slot_id": "...",
  "idea": "конкретная тема поста одним предложением",
  "angle": "угол подачи",
  "hook": "первое цепляющее предложение",
  "visual_concept": "что изобразить на картинке",
  "is_sensitive": false,
  "info_questions": []
}}

Верни JSON-массив. Без markdown, без пояснений."""

        messages = [{"role": "user", "content": prompt}]
        raw = None
        try:
            cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            resp = cl.messages.create(model=MODEL, max_tokens=8000, messages=messages)
            raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        except Exception as e:
            log.error("[Claude generate_ideas_for_slots] batch %d failed, falling back to GPT: %s", i // batch_size, e)
            try:
                oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
                gpt_resp = oai.chat.completions.create(model=_GPT_MODEL, max_completion_tokens=8000, messages=messages)
                raw = gpt_resp.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
            except Exception as e2:
                log.error("[GPT generate_ideas_for_slots] batch %d also failed: %s", i // batch_size, e2)

        if raw:
            try:
                ideas = json.loads(raw)
                all_ideas.extend(ideas)
                continue
            except json.JSONDecodeError as e:
                print(f"✗ JSON parse error in ideas batch {i//batch_size}: {e}")

        fallback_ideas = await _generate_ideas_simple(batch, batch_simple, business_profile)
        all_ideas.extend(fallback_ideas)

    return all_ideas


async def _generate_ideas_simple(batch, batch_simple, business_profile: dict) -> list:
    """Fallback: генерирует идеи в простом формате без классификации."""
    prompt = f"""Ты SMM-стратег. Придумай идеи постов.

Бизнес: {business_profile.get('name', '')}, ниша: {business_profile.get('niche', '')}

Слоты:
{json.dumps(batch_simple, ensure_ascii=False, indent=2)}

Для каждого слота верни:
{{"slot_id":"...","idea":"тема поста","angle":"угол","hook":"первое предложение","visual_concept":"картинка","is_sensitive":false,"info_questions":[]}}

Верни JSON-массив. Без markdown."""

    messages = [{"role": "user", "content": prompt}]
    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(model=MODEL, max_tokens=4000, messages=messages)
        raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        log.error("[Claude _generate_ideas_simple] failed, trying GPT: %s", e)
    try:
        oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
        gpt_resp = oai.chat.completions.create(model=_GPT_MODEL, max_completion_tokens=4000, messages=messages)
        raw = gpt_resp.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e2:
        print(f"✗ GPT fallback ideas also failed: {e2}")
        return []