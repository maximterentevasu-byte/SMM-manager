from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "smm_platform",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.workers.strategy_tasks",
        "app.workers.content_tasks",
        "app.workers.posting_tasks",
        "app.workers.analytics_tasks",
        "app.workers.notification_tasks",
        "app.workers.image_tasks",
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
        "app.workers.image_tasks.*":    {"queue": "generation"},
    },
    beat_schedule={
        "check-publish-queue": {
            "task": "app.workers.posting_tasks.check_publish_queue",
            "schedule": 60.0,
        },
        # Сбор аналитики каждый понедельник в 06:00 МСК
        "collect-analytics-weekly": {
            "task": "app.workers.analytics_tasks.collect_all_analytics_task",
            "schedule": crontab(hour=6, minute=0, day_of_week=1),
        },
        # Уведомления в TG за 3 дня до публикации — с 10:00 МСК, каждые 3 часа
        "notify-pending-posts": {
            "task": "app.workers.notification_tasks.notify_pending_posts",
            "schedule": crontab(hour="10,13,16,19,22", minute=0),
        },
        # Согласование постов через TG — за 3 дня до публикации, каждые 3 часа
        "notify-pending-approvals": {
            "task": "app.workers.notification_tasks.notify_pending_approvals",
            "schedule": crontab(hour="10,13,16,19,22", minute=0),
        },
        # Опрос Telegram на наличие ответов от владельца — каждую минуту
        "check-telegram-replies": {
            "task": "app.workers.notification_tasks.check_telegram_replies",
            "schedule": 60.0,
        },
    }
)
