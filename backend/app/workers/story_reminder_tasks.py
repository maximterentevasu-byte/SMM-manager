"""
Ежедневный напоминатель: если до 12:00 ЕКБ в канале нет ни одной сторис,
каждые 20 минут бот пишет активным пользователям "ОПУБЛИКУЙ СТОРИС".
Напоминания продолжаются пока сторис не появится (до 23:00 ЕКБ).
"""
import asyncio
import logging
import aiohttp
from datetime import datetime, timezone, timedelta

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import StoryBotSession, PlatformConnection
from app.config import settings
from app.services.publishers import decrypt_token
from sqlalchemy import select

log = logging.getLogger(__name__)

EKB = timezone(timedelta(hours=5))   # UTC+5
BOT_TOKEN = settings.STORY_BOT_TOKEN
_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


@celery_app.task(name="app.workers.story_reminder_tasks.check_story_reminders")
def check_story_reminders():
    asyncio.run(_check())


async def _check():
    if not BOT_TOKEN:
        return

    now_ekb = datetime.now(EKB)

    # Работаем только с 12:00 до 23:00 ЕКБ
    if now_ekb.hour < 12 or now_ekb.hour >= 23:
        return

    async with get_worker_db() as db:
        # Берём все активные сессии
        result = await db.execute(
            select(StoryBotSession).where(StoryBotSession.state == "active")
        )
        sessions = result.scalars().all()

        if not sessions:
            return

        # Собираем connection_id → session
        conn_ids = [s.connection_id for s in sessions if s.connection_id]
        if not conn_ids:
            return

        conn_result = await db.execute(
            select(PlatformConnection).where(PlatformConnection.id.in_(conn_ids))
        )
        connections = {str(c.id): c for c in conn_result.scalars().all()}

        for sess in sessions:
            conn = connections.get(sess.connection_id)
            if not conn or not conn.tg_session_encrypted:
                continue

            try:
                has_story = await _has_story_today(conn)
            except Exception as e:
                log.warning("story check failed for session %s: %s", sess.id, e)
                continue

            if not has_story:
                await _send_reminder(sess.tg_user_id)
                log.info("Reminder sent to tg_user_id=%s (channel=%s)", sess.tg_user_id, conn.external_page_id)


async def _has_story_today(conn: PlatformConnection) -> bool:
    """Проверяет есть ли хотя бы одна сторис в канале, опубликованная сегодня (ЕКБ)."""
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.stories import GetPeerStoriesRequest

    session_str = decrypt_token(conn.tg_session_encrypted)
    api_id = int(conn.tg_api_id)
    api_hash = conn.tg_api_hash
    # external_page_id может быть @username или числовым ID — Telethon принимает оба
    channel_ref = conn.external_page_id

    today_ekb = datetime.now(EKB).date()

    async with TelegramClient(StringSession(session_str), api_id, api_hash) as client:
        entity = await client.get_input_entity(channel_ref)
        result = await client(GetPeerStoriesRequest(peer=entity))
        stories = getattr(result.stories, "stories", [])
        for story in stories:
            story_date = story.date
            # Telegram возвращает UTC timestamp
            if not story_date.tzinfo:
                story_date = story_date.replace(tzinfo=timezone.utc)
            if story_date.astimezone(EKB).date() == today_ekb:
                return True

    return False


async def _send_reminder(tg_user_id: int):
    async with aiohttp.ClientSession() as s:
        await s.post(
            f"{_BASE}/sendMessage",
            json={
                "chat_id": tg_user_id,
                "text": "🔔 <b>ОПУБЛИКУЙ СТОРИС</b>",
                "parse_mode": "HTML",
                "reply_markup": {
                    "keyboard": [[{"text": "📤 Отправить пост в сторис"}]],
                    "resize_keyboard": True,
                },
            },
        )
