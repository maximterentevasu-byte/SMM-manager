from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text
from app.database import engine, Base
from app.api import auth, businesses, onboarding, content, platforms, subscriptions, analytics, post_creator

# Колонки для миграций без Alembic — добавляются через ADD COLUMN IF NOT EXISTS
_MIGRATIONS = [
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS tg_api_id VARCHAR(50)",
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS tg_api_hash VARCHAR(255)",
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS tg_session_encrypted TEXT",
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS vk_user_token_encrypted TEXT",
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS admin_chat_id VARCHAR(255)",
    "ALTER TABLE content_slots ADD COLUMN IF NOT EXISTS image_base64 TEXT",
    "ALTER TABLE content_slots ADD COLUMN IF NOT EXISTS images JSON",
    "ALTER TABLE content_slots ADD COLUMN IF NOT EXISTS needs_info_for JSON",
    # Новые значения enum (PostgreSQL 12+: может выполняться внутри транзакции)
    "ALTER TYPE planstatus ADD VALUE IF NOT EXISTS 'pending_approval'",
    "ALTER TYPE planstatus ADD VALUE IF NOT EXISTS 'needs_info'",
    "ALTER TABLE platform_connections ADD COLUMN IF NOT EXISTS tg_update_offset INTEGER",
    "ALTER TABLE content_slots ADD COLUMN IF NOT EXISTS tg_approval_rejected BOOLEAN DEFAULT FALSE",
    "ALTER TABLE slot_notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) DEFAULT 'needs_info'",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for migration in _MIGRATIONS:
            await conn.execute(text(migration))
    yield


app = FastAPI(
    title="SMM Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["auth"])
app.include_router(businesses.router,    prefix="/api/businesses",    tags=["businesses"])
app.include_router(onboarding.router,    prefix="/api/onboarding",    tags=["onboarding"])
app.include_router(content.router,       prefix="/api/content",       tags=["content"])
app.include_router(platforms.router,     prefix="/api/platforms",     tags=["platforms"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])
app.include_router(analytics.router,      prefix="/api/analytics",      tags=["analytics"])
app.include_router(post_creator.router,   prefix="/api/post-creator",   tags=["post-creator"])


@app.get("/")
async def root():
    return {"message": "SMM Platform API работает ✓", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.api_route("/api/debug/trigger-notifications", methods=["GET", "POST"])
async def debug_trigger_notifications():
    """Ручной запуск уведомлений needs_info (для тестирования)."""
    from app.workers.notification_tasks import notify_pending_posts
    notify_pending_posts.delay()
    return {"status": "triggered", "message": "Задача уведомлений поставлена в очередь Celery"}


@app.api_route("/api/debug/trigger-replies-check", methods=["GET", "POST"])
async def debug_trigger_replies_check():
    """Ручной запуск опроса Telegram на ответы."""
    from app.workers.notification_tasks import check_telegram_replies
    check_telegram_replies.delay()
    return {"status": "triggered", "message": "Задача проверки ответов поставлена в очередь Celery"}


@app.api_route("/api/debug/trigger-approvals", methods=["GET", "POST"])
async def debug_trigger_approvals():
    """Ручной запуск уведомлений о согласовании (для тестирования)."""
    from app.workers.notification_tasks import notify_pending_approvals
    notify_pending_approvals.delay()
    return {"status": "triggered", "message": "Задача согласования поставлена в очередь Celery"}


@app.get("/api/debug/notifications-status")
async def debug_notifications_status():
    """Статус системы уведомлений: слоты, подключения, последние уведомления."""
    from sqlalchemy import text
    from app.database import AsyncSessionLocal
    from datetime import datetime, timedelta

    async with AsyncSessionLocal() as db:
        now = datetime.utcnow()
        deadline = now + timedelta(days=3)

        slots_result = await db.execute(text(
            "SELECT id, platform, scheduled_at, status, needs_info_for FROM content_slots "
            "WHERE status = 'needs_info' AND scheduled_at >= :now AND scheduled_at <= :deadline "
            "ORDER BY scheduled_at"
        ), {"now": now, "deadline": deadline})
        slots = [dict(r._mapping) for r in slots_result]

        approval_result = await db.execute(text(
            "SELECT id, platform, scheduled_at, status, tg_approval_rejected FROM content_slots "
            "WHERE status = 'pending_approval' AND scheduled_at >= :now AND scheduled_at <= :deadline "
            "ORDER BY scheduled_at"
        ), {"now": now, "deadline": deadline})
        approval_slots = [dict(r._mapping) for r in approval_result]

        conns_result = await db.execute(text(
            "SELECT id, platform, admin_chat_id, tg_update_offset FROM platform_connections "
            "WHERE platform = 'telegram' AND is_active = true"
        ))
        conns = [dict(r._mapping) for r in conns_result]

        try:
            notifs_result = await db.execute(text(
                "SELECT slot_id, tg_message_id, notification_type, sent_at FROM slot_notifications "
                "ORDER BY sent_at DESC LIMIT 10"
            ))
            notifs = [dict(r._mapping) for r in notifs_result]
            table_exists = True
        except Exception as e:
            notifs = []
            table_exists = False

    return {
        "now_utc": now.isoformat(),
        "now_msk": (now + timedelta(hours=3)).isoformat(),
        "needs_info_slots_in_3_days": len(slots),
        "needs_info_slots": [{"id": str(s["id"]), "platform": s["platform"],
                              "scheduled_at": str(s["scheduled_at"]),
                              "has_questions": bool(s["needs_info_for"])} for s in slots],
        "pending_approval_slots_in_3_days": len(approval_slots),
        "pending_approval_slots": [{"id": str(s["id"]), "platform": s["platform"],
                                    "scheduled_at": str(s["scheduled_at"]),
                                    "tg_approval_rejected": bool(s.get("tg_approval_rejected"))} for s in approval_slots],
        "telegram_connections_with_admin_chat": len([c for c in conns if c["admin_chat_id"]]),
        "connections": [{"id": str(c["id"]), "has_admin_chat": bool(c["admin_chat_id"]),
                         "tg_update_offset": c["tg_update_offset"]} for c in conns],
        "slot_notifications_table_exists": table_exists,
        "recent_notifications": [{"slot_id": str(n["slot_id"]), "type": n.get("notification_type", "?"),
                                   "sent_at": str(n["sent_at"])} for n in notifs],
    }


@app.get("/api/debug/gemini-models")
async def debug_gemini_models():
    """Список моделей Gemini доступных по текущему API-ключу."""
    from app.config import settings
    import asyncio

    def _list():
        try:
            from google import genai
            gc = genai.Client(api_key=settings.GEMINI_API_KEY)
            models = []
            for m in gc.models.list():
                name = getattr(m, "name", "")
                display = getattr(m, "display_name", "")
                methods = getattr(m, "supported_generation_methods", [])
                models.append({"name": name, "display_name": display, "methods": list(methods)})
            return {"sdk": "google-genai", "count": len(models), "models": models}
        except ImportError:
            return {"error": "google-genai не установлен — пересоберите Docker-образ"}
        except Exception as e:
            return {"error": str(e)}

    result = await asyncio.to_thread(_list)
    return result