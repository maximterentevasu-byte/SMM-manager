"""
Telegram Stories Bot — обработчик webhook и эндпоинты для веб-панели согласования.

Состояния сессии:
  waiting_channel   → пользователь не указал канал
  waiting_confirm   → бот нашёл канал, ждёт согласия на отправку запроса
  pending_approval  → запрос ожидает одобрения в веб-панели
  active            → одобрен, может постить сторис
  rejected          → отклонён
"""
import io
import logging
import random
import aiohttp
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.models import StoryBotSession, PlatformConnection
from app.config import settings
from app.services.publishers import decrypt_token
from app.api.auth import get_current_user
from app.models.models import User

log = logging.getLogger(__name__)
router = APIRouter()

BOT_TOKEN = settings.STORY_BOT_TOKEN
_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


# ── Telegram helpers ───────────────────────────────────────────────────────────

async def _tg(method: str, **kwargs):
    async with aiohttp.ClientSession() as s:
        r = await s.post(f"{_BASE}/{method}", json=kwargs)
        return await r.json()


async def _send(chat_id: int, text: str, reply_markup=None, parse_mode="HTML"):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    await _tg("sendMessage", **payload)


async def _get_chat(username: str) -> dict | None:
    async with aiohttp.ClientSession() as s:
        r = await s.get(f"{_BASE}/getChat", params={"chat_id": username})
        d = await r.json()
        return d["result"] if d.get("ok") else None


async def _download_photo(file_id: str) -> bytes:
    async with aiohttp.ClientSession() as s:
        r = await s.get(f"{_BASE}/getFile", params={"file_id": file_id})
        path = (await r.json())["result"]["file_path"]
        r2 = await s.get(f"https://api.telegram.org/file/bot{BOT_TOKEN}/{path}")
        return await r2.read()


# ── Webhook ────────────────────────────────────────────────────────────────────

@router.post("/webhook")
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    if not BOT_TOKEN:
        return {"ok": True}

    data = await request.json()

    # Callback (inline-кнопки)
    if "callback_query" in data:
        cq = data["callback_query"]
        await _tg("answerCallbackQuery", callback_query_id=cq["id"])
        uid = cq["from"]["id"]
        cq_data = cq.get("data", "")

        res = await db.execute(select(StoryBotSession).where(StoryBotSession.tg_user_id == uid))
        sess = res.scalar_one_or_none()
        if not sess:
            return {"ok": True}

        if cq_data == "send_request":
            sess.state = "pending_approval"
            await db.commit()
            await _send(
                uid,
                "⏳ <b>Запрос отправлен!</b>\n\nОжидай подтверждения от администратора платформы.\n"
                "Как только запрос будет одобрен — сможешь публиковать сторис.",
            )

        elif cq_data == "cancel":
            sess.state = "waiting_channel"
            sess.connection_id = None
            sess.channel_title = None
            await db.commit()
            await _send(uid, "Отменено. Укажи @username канала:")

        return {"ok": True}

    if "message" not in data:
        return {"ok": True}

    msg = data["message"]
    user = msg["from"]
    uid = user["id"]
    chat_id = msg["chat"]["id"]
    tg_username = user.get("username", "")
    tg_first_name = user.get("first_name", "")
    text = msg.get("text", "")

    # Получаем или создаём сессию
    res = await db.execute(select(StoryBotSession).where(StoryBotSession.tg_user_id == uid))
    sess = res.scalar_one_or_none()

    # /start
    if text == "/start":
        if not sess:
            sess = StoryBotSession(
                tg_user_id=uid,
                tg_username=tg_username,
                tg_first_name=tg_first_name,
                state="waiting_channel",
            )
            db.add(sess)
        else:
            sess.state = "waiting_channel"
            sess.connection_id = None
            sess.channel_title = None
            sess.tg_username = tg_username
            sess.tg_first_name = tg_first_name
        await db.commit()
        await _send(
            chat_id,
            "👋 <b>Привет!</b>\n\nЯ помогу публиковать сторис в твой Telegram-канал.\n\n"
            "Укажи <b>@username</b> канала публикации:",
        )
        return {"ok": True}

    if not sess:
        await _send(chat_id, "Напиши /start чтобы начать.")
        return {"ok": True}

    # ── Ожидаем канал ──────────────────────────────────────────────────────────
    if sess.state == "waiting_channel":
        if not text:
            await _send(chat_id, "Пришли @username канала текстом.")
            return {"ok": True}

        ch_input = text.strip()
        if not ch_input.startswith("@"):
            ch_input = "@" + ch_input

        chat_info = await _get_chat(ch_input)
        if not chat_info:
            await _send(chat_id, "❌ Канал не найден. Проверь username и попробуй снова.")
            return {"ok": True}

        numeric_id = str(chat_info["id"])
        channel_title = chat_info.get("title", ch_input)

        conn_res = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.external_page_id == numeric_id,
                PlatformConnection.is_active == True,
            )
        )
        connection = conn_res.scalar_one_or_none()

        if not connection:
            await _send(
                chat_id,
                f"❌ Канал <b>{channel_title}</b> не зарегистрирован на платформе.\n\n"
                "Сначала подключи его через smmplatform.pro → Платформы.",
            )
            return {"ok": True}

        sess.state = "waiting_confirm"
        sess.connection_id = str(connection.id)
        sess.channel_title = channel_title
        await db.commit()

        user_display = f"@{tg_username}" if tg_username else tg_first_name
        await _send(
            chat_id,
            f"✅ Канал найден: <b>{channel_title}</b>\n\n"
            f"Будет отправлен запрос на подключение:\n"
            f"👤 {user_display} — {tg_first_name}\n\n"
            f"Подтвердить отправку запроса?",
            reply_markup={
                "inline_keyboard": [[
                    {"text": "✅ Отправить запрос", "callback_data": "send_request"},
                    {"text": "❌ Отмена", "callback_data": "cancel"},
                ]]
            },
        )
        return {"ok": True}

    # ── Ожидаем ответа на confirm ──────────────────────────────────────────────
    if sess.state == "waiting_confirm":
        await _send(chat_id, "Нажми кнопку выше чтобы отправить запрос или /start чтобы начать заново.")
        return {"ok": True}

    if sess.state == "pending_approval":
        await _send(chat_id, "⏳ Твой запрос ещё рассматривается. Ожидай подтверждения.")
        return {"ok": True}

    if sess.state == "rejected":
        await _send(chat_id, "❌ Твой запрос был отклонён. Напиши /start чтобы попробовать снова.")
        return {"ok": True}

    # ── Активная сессия — постим сторис ───────────────────────────────────────
    if sess.state == "active":
        if text == "📤 Отправить пост в сторис":
            await _send(chat_id, "📸 Пришли фото для публикации в сторис:")
            return {"ok": True}

        if "photo" in msg:
            photo = max(msg["photo"], key=lambda p: p.get("file_size", 0))
            try:
                photo_bytes = await _download_photo(photo["file_id"])
            except Exception as e:
                await _send(chat_id, f"❌ Не удалось скачать фото: {e}")
                return {"ok": True}

            conn_res = await db.execute(
                select(PlatformConnection).where(PlatformConnection.id == sess.connection_id)
            )
            connection = conn_res.scalar_one_or_none()

            if not connection or not connection.tg_session_encrypted:
                await _send(chat_id, "❌ Сессия не найдена. Обратись к администратору платформы.")
                return {"ok": True}

            try:
                await _post_story(connection, photo_bytes)
                await _send(
                    chat_id,
                    "✅ <b>История опубликована!</b>",
                    reply_markup={
                        "keyboard": [[{"text": "📤 Отправить пост в сторис"}]],
                        "resize_keyboard": True,
                    },
                )
            except Exception as e:
                log.error("Story post error: %s", e)
                await _send(chat_id, f"❌ Ошибка публикации: {str(e)[:200]}")

            return {"ok": True}

        # Всё остальное
        await _send(
            chat_id,
            "Нажми кнопку или пришли фото.",
            reply_markup={
                "keyboard": [[{"text": "📤 Отправить пост в сторис"}]],
                "resize_keyboard": True,
            },
        )

    return {"ok": True}


# ── Story posting via Telethon ─────────────────────────────────────────────────

async def _post_story(connection: PlatformConnection, photo_bytes: bytes):
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.stories import SendStoryRequest
    from telethon.tl.types import InputPrivacyValueAllowAll, InputMediaUploadedPhoto
    from PIL import Image

    session_str = decrypt_token(connection.tg_session_encrypted)
    api_id = int(connection.tg_api_id)
    api_hash = connection.tg_api_hash
    channel_id = int(connection.external_page_id)

    # Конвертируем в 9:16 (1080×1920)
    img = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
    scale = min(1080 / img.width, 1920 / img.height)
    nw, nh = int(img.width * scale), int(img.height * scale)
    img_r = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (1080, 1920), (20, 20, 20))
    canvas.paste(img_r, ((1080 - nw) // 2, (1920 - nh) // 2))

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=92)
    buf.seek(0)

    async with TelegramClient(StringSession(session_str), api_id, api_hash) as client:
        entity = await client.get_input_entity(channel_id)
        uploaded = await client.upload_file(buf, file_name="story.jpg")
        await client(SendStoryRequest(
            peer=entity,
            media=InputMediaUploadedPhoto(file=uploaded),
            privacy_rules=[InputPrivacyValueAllowAll()],
            period=86400,
            random_id=random.randint(1, 2 ** 31),
        ))


# ── Веб-панель: эндпоинты для раздела "Сторис" ────────────────────────────────

@router.get("/info")
async def bot_info():
    """Возвращает username бота (кэшируется браузером)."""
    if not BOT_TOKEN:
        return {"username": None, "configured": False}
    async with aiohttp.ClientSession() as s:
        r = await s.get(f"{_BASE}/getMe")
        d = await r.json()
    if d.get("ok"):
        return {"username": d["result"].get("username"), "configured": True}
    return {"username": None, "configured": False}


@router.get("/sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Все сессии по каналам текущего пользователя."""
    # Берём connection_id всех platform_connections бизнесов пользователя
    from app.models.models import Business
    biz_res = await db.execute(
        select(Business).where(Business.user_id == current_user.id)
    )
    businesses = biz_res.scalars().all()
    biz_ids = [str(b.id) for b in businesses]

    if not biz_ids:
        return []

    conn_res = await db.execute(
        select(PlatformConnection).where(PlatformConnection.business_id.in_(biz_ids))
    )
    connections = conn_res.scalars().all()
    conn_ids = {str(c.id): c for c in connections}

    if not conn_ids:
        return []

    sess_res = await db.execute(
        select(StoryBotSession).where(StoryBotSession.connection_id.in_(list(conn_ids.keys())))
    )
    sessions = sess_res.scalars().all()

    return [
        {
            "id": str(s.id),
            "tg_user_id": s.tg_user_id,
            "tg_username": s.tg_username,
            "tg_first_name": s.tg_first_name,
            "channel_title": s.channel_title,
            "state": s.state,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@router.post("/approve/{session_id}")
async def approve_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_owned_session(session_id, current_user, db)
    sess.state = "active"
    await db.commit()

    # Уведомляем пользователя в боте
    if BOT_TOKEN:
        await _send(
            sess.tg_user_id,
            "✅ <b>Запрос одобрен!</b>\n\nТеперь ты можешь публиковать сторис в канале.",
            reply_markup={
                "keyboard": [[{"text": "📤 Отправить пост в сторис"}]],
                "resize_keyboard": True,
            },
        )
    return {"status": "approved"}


@router.post("/reject/{session_id}")
async def reject_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_owned_session(session_id, current_user, db)
    sess.state = "rejected"
    await db.commit()

    if BOT_TOKEN:
        await _send(sess.tg_user_id, "❌ Твой запрос на подключение был отклонён.")
    return {"status": "rejected"}


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sess = await _get_owned_session(session_id, current_user, db)
    await db.delete(sess)
    await db.commit()
    return {"status": "deleted"}


async def _get_owned_session(session_id: str, current_user: User, db: AsyncSession) -> StoryBotSession:
    """Проверяет что сессия принадлежит бизнесу текущего пользователя."""
    from app.models.models import Business

    sess_res = await db.execute(select(StoryBotSession).where(StoryBotSession.id == session_id))
    sess = sess_res.scalar_one_or_none()
    if not sess:
        raise HTTPException(404, "Session not found")

    biz_res = await db.execute(select(Business).where(Business.user_id == current_user.id))
    biz_ids = [str(b.id) for b in biz_res.scalars().all()]

    conn_res = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.id == sess.connection_id,
            PlatformConnection.business_id.in_(biz_ids),
        )
    )
    if not conn_res.scalar_one_or_none():
        raise HTTPException(403, "Forbidden")

    return sess
