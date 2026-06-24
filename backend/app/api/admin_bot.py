"""
Webhook для @smmplatformb_bot (SHARED_TG_BOT_TOKEN).
При любом сообщении сохраняет username → chat_id в Redis (TTL 90 дней).
Нужно для настройки уведомлений по @username.
"""
import logging
import aiohttp
import redis.asyncio as aioredis

from fastapi import APIRouter, Request
from app.config import settings

router = APIRouter()
log = logging.getLogger(__name__)

_TOKEN = settings.SHARED_TG_BOT_TOKEN
_BASE = f"https://api.telegram.org/bot{_TOKEN}"
_TTL = 90 * 24 * 3600  # 90 дней


def _redis() -> aioredis.Redis:
    return aioredis.from_url(settings.REDIS_URL, decode_responses=True)


@router.post("/webhook")
async def admin_bot_webhook(request: Request):
    try:
        update = await request.json()
    except Exception:
        return {"ok": True}

    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"ok": True}

    chat_id = msg["chat"]["id"]
    username = (msg["chat"].get("username") or "").lower().strip()
    text = (msg.get("text") or "").strip()
    first_name = msg["chat"].get("first_name") or ""

    # Сохраняем username → chat_id в Redis
    if username:
        try:
            async with _redis() as r:
                await r.set(f"tg_username:{username}", str(chat_id), ex=_TTL)
        except Exception as e:
            log.warning("Redis write failed: %s", e)

    # Отвечаем на /start или /id
    if text in ("/start", "/id"):
        reply = (
            f"Привет{', ' + first_name if first_name else ''}! 👋\n\n"
            f"Ваш Telegram ID: <code>{chat_id}</code>\n\n"
            "Скопируйте этот ID и вставьте в настройки уведомлений в SMM Platform "
            "(Платформы → Уведомления администратора).\n\n"
            f"Или просто введите <code>@{username}</code> — платформа найдёт вас автоматически."
            if username else
            f"Привет{', ' + first_name if first_name else ''}! 👋\n\n"
            f"Ваш Telegram ID: <code>{chat_id}</code>\n\n"
            "Скопируйте этот ID и вставьте в настройки уведомлений в SMM Platform."
        )
        async with aiohttp.ClientSession() as s:
            await s.post(f"{_BASE}/sendMessage", json={
                "chat_id": chat_id,
                "text": reply,
                "parse_mode": "HTML",
            })

    return {"ok": True}
