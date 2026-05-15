import asyncio
import uuid
from datetime import datetime

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import Business, ContentSlot, PlanStatus
from app.agents.planner_agent import build_content_plan, generate_ideas_for_slots
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
def generate_content_plan_task(business_id: str, year: int, month: int):
    asyncio.run(_generate_plan(business_id, year, month))


async def _generate_plan(business_id: str, year: int, month: int):
    async with get_worker_db() as db:
        result = await db.execute(select(Business).where(Business.id == business_id))
        business = result.scalar_one_or_none()

        if not business or not business.strategy:
            print(f"✗ Бизнес {business_id} не найден или нет стратегии")
            return

        slots_meta = build_content_plan(business.strategy, business.profile, year, month)
        print(f"→ Создано {len(slots_meta)} слотов для {business.name}")

        try:
            ideas = await generate_ideas_for_slots(slots_meta, business.profile)
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
            try:
                post_data = await _generate_post_text(slot, business.profile)
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


async def _generate_post_text(slot, profile: dict) -> dict:
    spec = PLATFORM_SPECS.get(slot.platform, PLATFORM_SPECS["vk"])
    rubric = slot.rubric
    idea = slot.idea

    prompt = f"""Ты SMM-копирайтер для бренда "{profile.get('name', '')}".
Голос бренда: {profile.get('brand_voice', 'дружелюбный')}
Площадка: {spec['note']}
Аудитория: {profile.get('audience', {}).get('primary', profile.get('audience_primary', ''))}
УТП бизнеса: {profile.get('usp', '')}

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
- Если адрес не указан — не упоминай его

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
    idea = slot.idea
    visual_concept = idea.get("visual_concept", "")
    niche = profile.get("niche", "restaurant")

    img_prompt_content = f"""Write a detailed DALL-E 3 image generation prompt for a social media post.

Business niche: {niche}
Post topic: {idea.get('idea', '')}
Visual concept: {visual_concept}

STRICT RULES — follow every one:
- Style: professional commercial food photography, shot on Canon 5D Mark IV, 85mm f/1.8 lens
- Lighting: warm soft natural light from the side, gentle shadows, golden hour mood
- Composition: close-up hero shot OR flat lay, rule of thirds, shallow depth of field with creamy bokeh
- Colors: rich warm palette — deep burgundy, cream, terracotta, golden brown — appetizing and cinematic
- Texture: visible steam, melted cheese pull, glistening sauce, fresh herbs scattered, rustic wooden or marble surface
- Atmosphere: authentic Italian trattoria feel, linen napkins, aged wood, warm candlelight ambiance
- ABSOLUTELY NO text, letters, words, signs, labels, or numbers anywhere in the scene
- ABSOLUTELY NO watermarks, logos, UI elements, borders, or overlays
- The image must look indistinguishable from a real Michelin-star restaurant photograph
- Every element should be photorealistic, tactile, and crave-inducing

Return ONLY the image prompt in English, 100-130 words. Start directly with the scene description. No preamble."""

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

    prompt = f"""Ты SMM-копирайтер для бренда "{profile.get('name', '')}".
Голос бренда: {profile.get('brand_voice', 'дружелюбный')}
Площадка: {spec['note']}
Аудитория: {profile.get('audience', {}).get('primary', profile.get('audience_primary', ''))}

Рубрика: {rubric['name']}
Структура: {' → '.join(rubric.get('structure', []))}
Тема поста: {idea['idea']}
Хук (первое предложение): начни с "{idea.get('hook', '')}"

ИНФОРМАЦИЯ ОТ ВЛАДЕЛЬЦА (обязательно использовать в посте):
{answers_text}

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