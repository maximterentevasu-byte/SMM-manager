import asyncio

from app.workers.celery_app import celery_app
from app.agents.strategy_agent import generate_strategy
from app.agents.analytics_context import get_company_analytics_context, format_analytics_for_prompt
from app.agents.market_research import get_market_insights, format_market_insights_for_prompt
from app.workers.db import get_worker_db
from app.models.models import Business
from sqlalchemy import select


@celery_app.task(name="app.workers.strategy_tasks.generate_strategy_task", max_retries=2)
def generate_strategy_task(business_id: str):
    asyncio.run(_run(business_id))


async def _run(business_id: str):
    async with get_worker_db() as db:
        result = await db.execute(select(Business).where(Business.id == business_id))
        business = result.scalar_one_or_none()

        if not business or not business.profile:
            print(f"✗ Бизнес {business_id} не найден или нет профиля")
            return

        # Собираем аналитику компании из БД
        analytics_ctx = await get_company_analytics_context(business_id, db)
        analytics_text = format_analytics_for_prompt(analytics_ctx)
        if analytics_text:
            print(f"→ Аналитика компании загружена: TG={bool(analytics_ctx.get('tg'))}, VK={bool(analytics_ctx.get('vk'))}")

        # Получаем рыночные инсайты по нише
        market_raw = await get_market_insights(business.profile)
        market_text = format_market_insights_for_prompt(market_raw)
        if market_text:
            print(f"→ Рыночные инсайты получены для ниши: {business.profile.get('niche', '?')}")

        try:
            strategy = await generate_strategy(
                business.profile,
                analytics_context=analytics_text,
                market_insights=market_text,
            )
            if not strategy or not isinstance(strategy, list) or len(strategy) == 0:
                print(f"✗ Стратегия пустая или невалидная — сбрасываем sentinel")
                business.strategy = None
                await db.commit()
                return
            business.strategy = strategy
            await db.commit()
            print(f"✓ Стратегия сгенерирована для бизнеса {business.name}: {len(strategy)} платформ")
        except Exception as e:
            # Сбрасываем sentinel чтобы не блокировать интерфейс
            try:
                business.strategy = None
                await db.commit()
            except Exception:
                pass
            print(f"✗ Ошибка генерации стратегии: {e}")
            raise
