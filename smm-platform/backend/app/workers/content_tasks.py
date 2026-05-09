import asyncio
import uuid
from datetime import datetime
from calendar import monthrange
from itertools import cycle

from app.workers.celery_app import celery_app
from app.agents.copywriter_agent import generate_post_text
from app.agents.image_agent import generate_image_prompt, generate_image
from app.database import AsyncSessionLocal
from app.models.models import Business, ContentSlot, PlanStatus
from app.config import settings
from sqlalchemy import select
from anthropic import Anthropic
import json

client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# Праздники РФ в формате "MM-DD"
RU_HOLIDAYS = {
    "01-01": "Новый год", "01-07": "Рождество",
    "02-23": "День защитника отечества",
    "03-08": "Международный женский день",
    "05-01": "Праздник весны и труда",
    "05-09": "День Победы",
    "06-12": "День России",
    "11-04": "День народного единства",
}


def get_post_days(year: int, month: int, posts_per_week: int) -> list[datetime]:
    """Выбирает дни для публикаций в месяце"""
    _, days_in_month = monthrange(year, month)
    all_days = [datetime(year, month, d) for d in range(1, days_in_month + 1)]
    selected = []
    week_days = []

    for day in all_days:
        week_days.append(day)
        if day.weekday() == 6 or day == all_days[-1]:
            step = max(1, len(week_days) // max(posts_per_week, 1))
            for i in range(min(posts_per_week, len(week_days))):
                idx = min(i * step, len(week_days) - 1)
                selected.append(week_days[idx])
            week_days = []

    return selected


async def generate_ideas_batch(slots_meta: list[dict], business_profile: dict) -> list[dict]:
    """Генерирует идеи для пакета слотов одним запросом к AI"""
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[{
            "role": "user",
            "content": f"""Ты SMM-стратег. Сгенерируй конкретные идеи постов для каждого слота.

Профиль бизнеса:
{json.dumps(business_profile, ensure_ascii=False)}

Слоты:
{json.dumps(slots_meta, ensure_ascii=False, indent=2)}

Для каждого слота:
{{
  "slot_id": "...",
  "idea": "конкретная тема одним предложением",
  "angle": "угол подачи",
  "hook": "первое предложение-хук (цепляющее)",
  "visual_concept": "что должно быть на картинке (конкретно)"
}}

Идеи должны быть конкретными и разными!
Верни JSON-массив без markdown."""
        }]
    )
    text = response.content[0].text.strip()
    text = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except Exception:
        return []


@celery_app.task(name="app.workers.content_tasks.generate_content_plan_task")
def generate_content_plan_task(business_id: str, year: int, month: int):
    """Строит контент-план на месяц и запускает генерацию контента"""
    asyncio.run(_build_plan(business_id, year, month))


async def _build_plan(business_id: str, year: int, month: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Business).where(Business.id == business_id))
        business = result.scalar_one_or_none()
        if not business or not business.strategy:
            print(f"✗ Нет стратегии для {business_id}")
            return

        holidays = {k: v for k, v in RU_HOLIDAYS.items()}
        slots_meta = []

        for platform_strategy in business.strategy:
            platform = platform_strategy["platform"]
            posts_per_week = platform_strategy.get("posts_per_week", 3)
            best_times = platform_strategy.get("best_posting_times", ["10:00", "18:00"])
            rubrics = platform_strategy.get("rubrics", [])
            if not rubrics:
                continue

            post_days = get_post_days(year, month, posts_per_week)
            rubric_cycle = cycle(rubrics)
            last_type = None

            for i, day in enumerate(post_days):
                time_str = best_times[i % len(best_times)]
                hour, minute = map(int, time_str.split(":"))
                scheduled_at = day.replace(hour=hour, minute=minute)

                rubric = next(rubric_cycle)
                # Не ставим продающий пост дважды подряд
                attempts = 0
                while rubric.get("type") == "sales" and last_type == "sales" and attempts < len(rubrics):
                    rubric = next(rubric_cycle)
                    attempts += 1

                date_key = day.strftime("%m-%d")
                slot_id = str(uuid.uuid4())
                slots_meta.append({
                    "slot_id": slot_id,
                    "platform": platform,
                    "scheduled_at": scheduled_at.isoformat(),
                    "rubric": rubric,
                    "holiday": holidays.get(date_key),
                })
                last_type = rubric.get("type")

        # Генерируем идеи пакетом
        ideas = await generate_ideas_batch(slots_meta, business.profile)
        ideas_map = {i["slot_id"]: i for i in ideas}

        # Сохраняем слоты в БД
        for s in slots_meta:
            idea = ideas_map.get(s["slot_id"])
            slot = ContentSlot(
                id=uuid.UUID(s["slot_id"]),
                business_id=business.id,
                platform=s["platform"],
                scheduled_at=datetime.fromisoformat(s["scheduled_at"]),
                rubric=s["rubric"],
                idea=idea,
                status=PlanStatus.idea_ready if idea else PlanStatus.planned
            )
            db.add(slot)

        await db.commit()
        print(f"✓ Контент-план создан: {len(slots_meta)} слотов")

        # Запускаем генерацию контента для каждого слота
        for s in slots_meta:
            generate_post_content_task.delay(s["slot_id"])


@celery_app.task(
    name="app.workers.content_tasks.generate_post_content_task",
    max_retries=2,
    default_retry_delay=60
)
def generate_post_content_task(slot_id: str):
    """Генерирует текст + картинку для одного слота"""
    asyncio.run(_generate_content(slot_id))


async def _generate_content(slot_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ContentSlot).where(ContentSlot.id == slot_id))
        slot = result.scalar_one_or_none()
        if not slot or not slot.idea:
            return

        biz = await db.execute(select(Business).where(Business.id == slot.business_id))
        business = biz.scalar_one_or_none()
        if not business:
            return

        try:
            # 1. Текст поста
            post_data = await generate_post_text(slot, business.profile)
            slot.post_text = post_data.get("text", "")
            slot.hashtags = post_data.get("hashtags", [])

            # 2. Промт для картинки
            img_prompt = await generate_image_prompt(slot, business.profile)
            slot.image_prompt = img_prompt

            # 3. Генерация картинки (только если настроен S3 и OpenAI)
            if settings.OPENAI_API_KEY and settings.S3_ACCESS_KEY:
                image_url = await generate_image(img_prompt, slot.platform, business.profile)
                slot.image_url = image_url

            slot.status = PlanStatus.content_ready
            print(f"✓ Контент готов для слота {slot_id}")

        except Exception as e:
            slot.status = PlanStatus.failed
            slot.error_message = str(e)
            print(f"✗ Ошибка генерации контента: {e}")

        await db.commit()
