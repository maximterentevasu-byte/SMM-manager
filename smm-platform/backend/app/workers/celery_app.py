from celery import Celery
from app.config import settings

celery_app = Celery(
    "smm_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.strategy_tasks",
        "app.workers.content_tasks",
        "app.workers.posting_tasks",
    ]
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Moscow",
    enable_utc=True,
    task_routes={
        "app.workers.strategy_tasks.*": {"queue": "default"},
        "app.workers.content_tasks.*":  {"queue": "generation"},
        "app.workers.posting_tasks.*":  {"queue": "posting"},
    },
    beat_schedule={
        # Проверяем очередь публикаций каждую минуту
        "check-publish-queue": {
            "task": "app.workers.posting_tasks.check_publish_queue",
            "schedule": 60.0,
        },
    }
)
