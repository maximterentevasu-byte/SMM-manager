import asyncio
from datetime import datetime

from app.workers.celery_app import celery_app
from app.agents.strategy_agent import generate_strategy
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

        try:
            strategy = await generate_strategy(business.profile)
            business.strategy = strategy
            await db.commit()
            print(f"✓ Стратегия сгенерирована для бизнеса {business.name}")
        except Exception as e:
            print(f"✗ Ошибка генерации стратегии: {e}")
            raise

    # Автоматически запускаем контент-план после стратегии
    try:
        from app.workers.content_tasks import generate_content_plan_task
        now = datetime.utcnow()
        generate_content_plan_task.delay(business_id, now.year, now.month)
        print(f"→ Запущена генерация контент-плана для {business_id}")
    except Exception as e:
        print(f"✗ Ошибка запуска контент-плана: {e}")