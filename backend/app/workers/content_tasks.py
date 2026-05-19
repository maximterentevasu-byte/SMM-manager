import asyncio
import uuid
from datetime import datetime, timedelta, date as date_type

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import Business, ContentSlot, PlanStatus
from app.agents.planner_agent import build_content_plan, generate_ideas_for_slots
from app.agents.analytics_context import get_company_analytics_context, format_analytics_for_prompt
from app.agents.market_research import get_market_insights, format_market_insights_for_prompt
from app.config import settings
from sqlalchemy import select

import logging
import anthropic
import json
from openai import OpenAI as _OpenAI


log = logging.getLogger(__name__)
MODEL = "claude-sonnet-4-6"
_GPT_MODEL = "gpt-5.4"


def _gpt_sync(messages: list, max_tokens: int) -> str:
    oai = _OpenAI(api_key=settings.OPENAI_API_KEY)
    resp = oai.chat.completions.create(
        model=_GPT_MODEL,
        max_completion_tokens=max_tokens,
        messages=messages,
    )
    return resp.choices[0].message.content.strip()


@celery_app.task(name="app.workers.content_tasks.generate_content_plan_task")
def generate_content_plan_task(business_id: str, year: int = None, month: int = None):
    asyncio.run(_generate_plan(business_id))


async def _generate_plan(business_id: str):
    start_date = (datetime.utcnow() + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    async with get_worker_db() as db:
        result = await db.execute(select(Business).where(Business.id == business_id))
        business = result.scalar_one_or_none()

        if not business or not business.strategy:
            print(f"✗ Бизнес {business_id} не найден или нет стратегии")
            return

        # Существующие будущие слоты
        existing_result = await db.execute(
            select(ContentSlot).where(
                ContentSlot.business_id == business_id,
                ContentSlot.scheduled_at >= start_date,
            )
        )
        existing_slots = existing_result.scalars().all()

        # Для каждой пары (платформа, понедельник_недели) считаем занятые даты
        def _week_monday(d: date_type) -> date_type:
            return d - timedelta(days=d.weekday())

        # existing_by_week: (platform, week_monday) -> set[date]
        existing_by_week: dict[tuple, set] = {}
        for s in existing_slots:
            d = s.scheduled_at.date()
            key = (s.platform.value, _week_monday(d))
            existing_by_week.setdefault(key, set()).add(d)

        # Целевое кол-во постов в неделю для каждой платформы из стратегии
        target_ppw: dict[str, int] = {
            ps["platform"]: ps.get("posts_per_week", 3)
            for ps in (business.strategy or [])
            if ps.get("platform")
        }

        all_slots_meta = build_content_plan(business.strategy, business.profile, start_date=start_date)

        # Группируем новые слоты по (platform, week_monday)
        new_by_week: dict[tuple, list] = {}
        for slot in all_slots_meta:
            slot_date = datetime.fromisoformat(slot["scheduled_at"]).date()
            key = (slot["platform"], _week_monday(slot_date))
            new_by_week.setdefault(key, []).append(slot)

        # Для каждой недели добавляем только дефицит (target - existing)
        slots_meta: list = []
        for key, new_week_slots in new_by_week.items():
            platform, _ = key
            existing_dates = set(existing_by_week.get(key, set()))
            existing_count = len(existing_dates)
            target = target_ppw.get(platform, 3)
            deficit = target - existing_count
            if deficit <= 0:
                continue
            added = 0
            for slot in new_week_slots:
                if added >= deficit:
                    break
                slot_date = datetime.fromisoformat(slot["scheduled_at"]).date()
                if slot_date not in existing_dates:
                    slots_meta.append(slot)
                    existing_dates.add(slot_date)
                    added += 1

        print(f"→ Новых слотов: {len(slots_meta)} для {business.name}")

        if not slots_meta:
            print("✓ Контент-план актуален, ничего не добавляем")
            return

        # Аналитика компании и рыночные инсайты для улучшения идей
        analytics_ctx = await get_company_analytics_context(business_id, db)
        analytics_text = format_analytics_for_prompt(analytics_ctx)
        market_raw = await get_market_insights(business.profile)
        market_text = format_market_insights_for_prompt(market_raw)

        try:
            ideas = await generate_ideas_for_slots(
                slots_meta,
                business.profile,
                analytics_context=analytics_text,
                market_insights=market_text,
            )
        except Exception as e:
            print(f"✗ Ошибка генерации идей: {e} — слоты создадутся без идей")
            ideas = []
        ideas_map = {i["slot_id"]: i for i in ideas}

        slot_ids = []
        for slot_meta in slots_meta:
            idea = ideas_map.get(slot_meta["slot_id"])
            slot = ContentSlot(
                id=uuid.UUID(slot_meta["slot_id"]),
                business_id=business.id,
                platform=slot_meta["platform"],
                scheduled_at=datetime.fromisoformat(slot_meta["scheduled_at"]),
                rubric=slot_meta["rubric"],
                idea=idea,
                status=PlanStatus.idea_ready if idea else PlanStatus.planned,
            )
            db.add(slot)
            slot_ids.append(slot_meta["slot_id"])

        await db.commit()
        print(f"✓ Слоты сохранены в БД: {len(slot_ids)} шт.")

    for sid in slot_ids:
        generate_post_content_task.delay(sid)


@celery_app.task(name="app.workers.content_tasks.generate_post_content_task")
def generate_post_content_task(slot_id: str):
    asyncio.run(_generate_content(slot_id))


async def _generate_content(slot_id: str):
    async with get_worker_db() as db:
        result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
        slot = result.scalar_one_or_none()
        if not slot or not slot.idea:
            return

        biz_result = await db.execute(select(Business).where(Business.id == slot.business_id))
        business = biz_result.scalar_one_or_none()
        if not business:
            return

        is_sensitive = slot.idea.get("is_sensitive", False) if slot.idea else False

        if is_sensitive:
            questions = slot.idea.get("info_questions") or []
            slot.needs_info_for = questions if questions else ["Уточните детали для этого поста"]
            slot.status = PlanStatus.needs_info
            print(f"✓ Пост требует информации: {slot_id[:8]}... ({slot.platform})")
        else:
            analytics_ctx = await get_company_analytics_context(str(slot.business_id), db)
            analytics_text = format_analytics_for_prompt(analytics_ctx)
            try:
                post_data = await _generate_post_text(slot, business.profile, analytics_context=analytics_text)
                slot.post_text = post_data["text"]
                slot.hashtags = post_data["hashtags"]

                slot.image_prompt = await _generate_image_prompt(slot, business.profile)

                slot.status = PlanStatus.pending_approval
                print(f"✓ Контент готов (ждёт согласования): {slot_id[:8]}... ({slot.platform})")

            except Exception as e:
                slot.status = PlanStatus.failed
                slot.error_message = str(e)
                print(f"✗ Ошибка генерации контента: {e}")

        await db.commit()


PLATFORM_SPECS = {
    "vk":       {"ideal_length": 700,  "emoji": "умеренно (2-5)", "hashtags": "5-10", "note": "ВКонтакте, читают вдумчиво"},
    "telegram": {"ideal_length": 500,  "emoji": "активно",         "hashtags": "0-3",  "note": "Telegram-канал, живой тон"},
    "ok":       {"ideal_length": 500,  "emoji": "минимально",      "hashtags": "3-5",  "note": "Одноклассники, аудитория 40+"},
}


async def _generate_post_text(slot, profile: dict, analytics_context: str = "") -> dict:
    spec = PLATFORM_SPECS.get(slot.platform, PLATFORM_SPECS["vk"])
    rubric = slot.rubric
    idea = slot.idea

    address = profile.get('address', '')
    contact_info = profile.get('contact_info', '')
    analytics_block = f"\n{analytics_context}\n" if analytics_context else ""

    prompt = f"""Ты SMM-копирайтер для бренда "{profile.get('name', '')}".
Голос бренда: {profile.get('brand_voice', 'дружелюбный')}
Площадка: {spec['note']}
Аудитория: {profile.get('audience', {}).get('primary', profile.get('audience_primary', ''))}
УТП бизнеса: {profile.get('usp', '')}
{f"Адрес: {address}" if address else ""}
{f"Контакты: {contact_info}" if contact_info else ""}{analytics_block}
Рубрика: {rubric['name']}
Структура: {' → '.join(rubric.get('structure', []))}
Тема поста: {idea['idea']}
Угол подачи: {idea.get('angle', '')}
Хук (первое предложение): начни с "{idea.get('hook', '')}"

⛔ СТРОГИЕ ЗАПРЕТЫ (этот пост классифицирован как обезличенный — конкретики нет):
- НЕ упоминай конкретные товары, блюда, услуги — только нишу в целом
- НЕ придумывай акции, скидки, условия, механики призов
- НЕ придумывай даты, ивенты, мероприятия
- НЕ придумывай имена сотрудников, клиентов, партнёров
- НЕ указывай конкретные цены и цифры которых нет в профиле
- НЕ призывай к действию со ссылкой на акцию или конкретный продукт
- Если адрес указан — используй его, НЕ придумывай другой

Длина: {spec['ideal_length']} символов ±20%
Эмодзи: {spec['emoji']}
Хэштеги: {spec['hashtags']} штук в конце

Верни ТОЛЬКО JSON без markdown:
{{"text": "текст поста", "hashtags": ["тег1", "тег2"], "char_count": 500}}"""

    messages = [{"role": "user", "content": prompt}]
    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(model=MODEL, max_tokens=2000, messages=messages)
        raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        log.error("[Claude _generate_post_text] failed, falling back to GPT: %s", e)
    raw = _gpt_sync(messages, 2000).replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


async def _generate_image_prompt(slot, profile: dict) -> str:
    idea = slot.idea or {}
    post_text = slot.post_text or ""
    visual_concept = idea.get("visual_concept", "")
    niche = profile.get("niche", "")
    brand_voice = profile.get("brand_voice", "")
    biz_name = profile.get("name", "")
    usp = profile.get("usp", "")
    audience = profile.get("audience", {}).get("primary", profile.get("audience_primary", ""))
    address = profile.get("address", "")

    content_source = post_text if post_text.strip() else (idea.get("idea", "") + ". " + visual_concept).strip()

    img_prompt_content = f"""Create a professional image generation prompt for a social media post.

POST TEXT (primary basis for the visual):
{content_source}

BUSINESS CONTEXT:
- Business: "{biz_name}"
- Niche: {niche}
- Brand voice: {brand_voice}
- USP: {usp}
- Target audience: {audience}
{f"- Location: {address}" if address else ""}

VISUAL REQUIREMENTS:
- The image MUST visually represent what the post text is about, not the brand in general
- Style, lighting, colors and atmosphere MUST match the actual niche ({niche}) precisely — never borrow food/café/restaurant aesthetics unless this IS a food business
- Professional commercial photography appropriate for {niche}
- Composition: close-up hero shot OR lifestyle scene, rule of thirds, shallow depth of field

ABSOLUTE TEXT PROHIBITION — this is critical:
- ZERO letters, words, digits, numbers anywhere in the image
- ZERO signs, labels, price tags, banners, captions, titles
- ZERO speech bubbles, thought bubbles, arrows with text
- ZERO watermarks, logos, icons, UI elements, overlays of any kind
- ZERO infographic elements, charts, callouts
- The scene must be pure photography with no graphic design elements whatsoever

Output: 100-130 words. Start directly with the scene description. English only. No preamble."""

    messages = [{"role": "user", "content": img_prompt_content}]
    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(model=MODEL, max_tokens=400, messages=messages)
        return resp.content[0].text.strip()
    except Exception as e:
        log.error("[Claude _generate_image_prompt] failed, falling back to GPT: %s", e)
    return _gpt_sync(messages, 400)


async def _generate_post_text_with_info(slot, profile: dict, answers: list[dict]) -> dict:
    """Генерирует текст поста с учётом ответов владельца бизнеса на вопросы."""
    spec = PLATFORM_SPECS.get(slot.platform, PLATFORM_SPECS["vk"])
    rubric = slot.rubric
    idea = slot.idea

    answers_text = "\n".join(
        f"- {a.get('question', '')}: {a.get('answer', '')}"
        for a in answers if a.get("answer", "").strip()
    )

    address = profile.get('address', '')
    contact_info = profile.get('contact_info', '')

    prompt = f"""Ты SMM-копирайтер для бренда "{profile.get('name', '')}".
Голос бренда: {profile.get('brand_voice', 'дружелюбный')}
Площадка: {spec['note']}
Аудитория: {profile.get('audience', {}).get('primary', profile.get('audience_primary', ''))}
УТП бизнеса: {profile.get('usp', '')}
{f"Адрес: {address}" if address else ""}
{f"Контакты: {contact_info}" if contact_info else ""}

Рубрика: {rubric['name']}
Структура: {' → '.join(rubric.get('structure', []))}
Тема поста: {idea['idea']}
Хук (первое предложение): начни с "{idea.get('hook', '')}"

ИНФОРМАЦИЯ ОТ ВЛАДЕЛЬЦА (обязательно использовать в посте):
{answers_text}

- Если адрес указан — используй его в посте
Длина: {spec['ideal_length']} символов ±20%
Эмодзи: {spec['emoji']}
Хэштеги: {spec['hashtags']} штук в конце

Верни ТОЛЬКО JSON без markdown:
{{"text": "текст поста", "hashtags": ["тег1", "тег2"], "char_count": 500}}"""

    messages = [{"role": "user", "content": prompt}]
    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(model=MODEL, max_tokens=2000, messages=messages)
        raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        log.error("[Claude _generate_post_text_with_info] failed, falling back to GPT: %s", e)
    raw = _gpt_sync(messages, 2000).replace("```json", "").replace("```", "").strip()
    return json.loads(raw)


async def _regenerate_info_questions(slot, profile: dict) -> list[str]:
    idea = slot.idea or {}
    idea_text = idea.get("idea", "")
    rubric_name = slot.rubric.get("name", "") if slot.rubric else ""
    niche = profile.get("niche", "")
    biz_name = profile.get("name", "")

    prompt = f"""Ты SMM-стратег. Составь список запросов к владельцу бизнеса для подготовки поста.

ПОСТ:
- Идея: {idea_text}
- Рубрика: {rubric_name}
- Платформа: {slot.platform}

БИЗНЕС: {biz_name}, ниша: {niche}

СТРОГИЕ ПРАВИЛА:
1. Максимум 3 запроса — только самое необходимое для этого конкретного поста
2. Повелительное наклонение, глагол в начале: "Напиши...", "Укажи...", "Пришли фото...", "Дай...", "Перечисли..."
3. ЗАПРЕЩЕНО дублировать — если два запроса касаются одного (товар + его характеристика) → объедини в ОДИН
4. Для фото/видео: начинай с "Пришли фото ..." или "Загрузи видео ..."
5. Каждый запрос даёт ПРИНЦИПИАЛЬНО разную информацию
6. НЕ используй вопросительную форму ("Есть ли...", "Какой...", "Что такое...")

ПРИМЕР ПЛОХОГО (дублирование):
- "Какой товар самый острый из ассортимента?"
- "Как называется этот товар и каков уровень остроты?"
→ ЭТО ОДИН ЗАПРОС

ПРИМЕР ХОРОШЕГО:
- "Напиши название самого острого товара и его уровень остроты по шкале"
- "Пришли фото этого товара в высоком качестве"

Верни JSON-массив строк (без markdown, без пояснений):
["запрос 1", "запрос 2"]"""

    messages = [{"role": "user", "content": prompt}]
    try:
        cl = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = cl.messages.create(model=MODEL, max_tokens=600, messages=messages)
        raw = resp.content[0].text.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(raw)
    except Exception as e:
        log.error("[Claude _regenerate_info_questions] failed, falling back to GPT: %s", e)
    raw = _gpt_sync(messages, 600).replace("```json", "").replace("```", "").strip()
    return json.loads(raw)