import logging
import anthropic
import json
import uuid
from datetime import datetime, timedelta
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

PLAN_WEEKS = 5


def get_plan_days(start_date: datetime, posts_per_week: int, weeks: int = PLAN_WEEKS) -> list[datetime]:
    """
    Возвращает РОВНО weeks * posts_per_week дат публикаций.
    Период: [start_date, start_date + weeks*7) — ровно weeks полных недель.
    Неполные первая/последняя недели (Пн–Вс) получают постов пропорционально;
    последний кусок берёт оставшийся остаток, чтобы сумма была точной.
    """
    start = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=weeks * 7)   # ровно 35 дней, не включительно
    total_posts = posts_per_week * weeks       # целевой итог (напр. 25)

    # Разбиваем период на куски по неделям Пн–Вс
    chunks: list[tuple[datetime, datetime, int]] = []  # (chunk_start, chunk_end, days)
    cur = start
    while cur < end:
        dow = cur.weekday()                                  # 0=Пн, 6=Вс
        week_sun = cur + timedelta(days=(6 - dow))
        chunk_end = min(week_sun, end - timedelta(days=1))
        days_in_chunk = (chunk_end - cur).days + 1
        chunks.append((cur, chunk_end, days_in_chunk))
        cur = chunk_end + timedelta(days=1)

    # Распределяем total_posts по кускам пропорционально
    # Последний кусок берёт остаток, чтобы суммарно вышло ровно total_posts
    remaining = total_posts
    posts_per_chunk: list[int] = []
    for i, (_, _, d) in enumerate(chunks):
        if i == len(chunks) - 1:
            n = remaining                             # остаток → точная сумма
        else:
            n = round(posts_per_week * d / 7)
        posts_per_chunk.append(n)
        remaining -= n

    # Генерируем даты равномерно внутри каждого куска
    result: list[datetime] = []
    for (cs, _, d), n in zip(chunks, posts_per_chunk):
        n = max(0, min(n, d))
        if n == 0:
            continue
        available = [cs + timedelta(days=i) for i in range(d)]
        if n >= d:
            selected = available
        elif n == 1:
            selected = [available[d // 2]]
        else:
            step = d / n
            selected = [available[int(i * step)] for i in range(n)]
        result.extend(selected)

    return result


def build_content_plan(
    strategy: list,
    business_profile: dict,
    start_date: datetime | None = None,
    # backward-compat параметры (игнорируются)
    year: int | None = None,
    month: int | None = None,
) -> list:
    if start_date is None:
        start_date = (datetime.utcnow() + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

    slots = []

    for platform_strategy in strategy:
        platform = platform_strategy["platform"]
        posts_per_week = platform_strategy.get("posts_per_week", 3)
        best_times = platform_strategy.get("best_posting_times", ["12:00", "18:00"])
        rubrics = platform_strategy.get("rubrics", [])

        if not rubrics:
            continue

        post_days = get_plan_days(start_date, posts_per_week)
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
                "holiday": RU_HOLIDAYS.get(date_key),
                "status": "planned",
            }
            slots.append(slot)
            last_type = rubric.get("type")
            rubric_idx += 1

    return sorted(slots, key=lambda x: x["scheduled_at"])


async def generate_ideas_for_slots(
    slots_meta: list,
    business_profile: dict,
    analytics_context: str = "",
    market_insights: str = "",
) -> list:
    if not slots_meta:
        return []

    extra_context = ""
    if analytics_context:
        extra_context += f"\n{analytics_context}\n"
    if market_insights:
        extra_context += f"\n{market_insights}\n"

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
{extra_context}
ПРОФИЛЬ БИЗНЕСА:
- Название: {business_profile.get('name', '')}
- Ниша: {business_profile.get('niche', '')}
- УТП: {usp}
- Голос бренда: {business_profile.get('brand_voice', '')}
- Аудитория: {business_profile.get('audience_primary', '')}
- Адрес: {address if address else 'не указан'}
- Контакты: {contact_info if contact_info else 'не указаны'}

ВАЖНЫЙ КОНТЕКСТ:
Если выше переданы данные аналитики компании — ориентируйся на стиль и темы постов с высоким ER,
избегай форматов худших постов. Если есть рыночные инсайты — используй вирусные форматы и хуки.
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

Если is_sensitive = true: сгенерируй info_questions — 2-3 директивных запроса к владельцу на русском языке.

ПРАВИЛА для info_questions (строго):
- Повелительное наклонение, глагол в начале: "Напиши...", "Укажи...", "Пришли фото...", "Дай...", "Перечисли..."
- НЕ дублируй: если два запроса касаются одного (товар + его характеристика) — объедини в ОДИН
- Для фото/видео: "Пришли фото ..." или "Загрузи видео ..."
- Максимум 3 запроса, только необходимые именно для этого поста
- НЕ используй вопросительную форму ("Есть ли...", "Какой...", "Что такое...")

ПРИМЕР ПЛОХОГО (дублирование — ЗАПРЕЩЕНО):
["Какой товар самый острый?", "Как называется товар и каков уровень остроты?"]
ПРИМЕР ХОРОШЕГО (объединено в один):
["Напиши название самого острого товара и его уровень остроты по шкале", "Пришли фото товара в высоком качестве"]

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
                gpt_resp = oai.responses.create(model=_GPT_MODEL, input=messages, max_output_tokens=8000)
                raw = gpt_resp.output_text.strip().replace("```json", "").replace("```", "").strip()
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
        gpt_resp = oai.responses.create(model=_GPT_MODEL, input=messages, max_output_tokens=4000)
        raw = gpt_resp.output_text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e2:
        print(f"✗ GPT fallback ideas also failed: {e2}")
        return []