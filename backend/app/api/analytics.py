import asyncio
import uuid
from io import BytesIO
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func

from app.database import get_db
from app.models.models import (
    User, Business, PlatformConnection,
    TGWeeklyStats, VKWeeklyStats, ContentSlot, PlanStatus, Platform,
    TelegramPost, TelegramStory,
)
from app.api.auth import get_current_user
from app.services.publishers import decrypt_token, encrypt_token

router = APIRouter()

# Хранит api_id/api_hash между send-code → sign-in (только примитивы, не клиенты)
_pending_tg_meta: dict = {}


# ─── helpers ────────────────────────────────────────────────────────────────

async def _get_business(business_id: str, user: User, db: AsyncSession) -> Business:
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == user.id)
    )
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    return biz


async def _get_connection(business_id: str, platform: str, db: AsyncSession) -> PlatformConnection | None:
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.platform == platform,
            PlatformConnection.is_active == True,
        )
    )
    return result.scalar_one_or_none()


# ─── GET data ────────────────────────────────────────────────────────────────

@router.get("/{business_id}/tg")
async def get_tg_analytics(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(TGWeeklyStats)
        .where(TGWeeklyStats.business_id == business_id)
        .order_by(TGWeeklyStats.week_start.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "channel_id": r.channel_id,
            "channel_name": r.channel_name,
            "week_start": r.week_start.date().isoformat(),
            "week_end": r.week_end.date().isoformat(),
            "collected_at": r.collected_at.isoformat(),
            **r.stats,
        }
        for r in rows
    ]


@router.get("/{business_id}/vk")
async def get_vk_analytics(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(VKWeeklyStats)
        .where(VKWeeklyStats.business_id == business_id)
        .order_by(VKWeeklyStats.week_start.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "group_id": r.group_id,
            "group_name": r.group_name,
            "week_start": r.week_start.date().isoformat(),
            "week_end": r.week_end.date().isoformat(),
            "collected_at": r.collected_at.isoformat(),
            **r.stats,
        }
        for r in rows
    ]


# ─── TG credentials ──────────────────────────────────────────────────────────

class TGCredentialsIn(BaseModel):
    api_id: int
    api_hash: str
    session: str


@router.get("/{business_id}/tg-credentials")
async def get_tg_credentials_status(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn:
        return {"configured": False, "has_connection": False}
    return {
        "configured": bool(conn.tg_api_id and conn.tg_session_encrypted),
        "has_connection": True,
        "channel_name": conn.page_name,
    }


@router.get("/{business_id}/vk-credentials")
async def get_vk_credentials_status(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "vk", db)
    if not conn:
        return {"configured": False, "has_connection": False}
    return {
        "configured": bool(conn.vk_user_token_encrypted),
        "has_connection": True,
        "group_name": conn.page_name,
    }


class VKCredentialsIn(BaseModel):
    user_token: str


class TGPhoneIn(BaseModel):
    phone: str


class TGCodeIn(BaseModel):
    phone: str
    code: str
    phone_code_hash: str


def _tg_send_code_sync(api_id: int, api_hash: str, phone: str) -> tuple[str, str]:
    """Отправляет код, возвращает (phone_code_hash, session_str).
    Сессию нужно передать в sign_in — иначе Telegram отклонит хэш как невалидный."""
    import asyncio as _aio
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    loop = _aio.new_event_loop()
    _aio.set_event_loop(loop)

    async def _do():
        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.connect()
        sent = await client.send_code_request(phone)
        session_str = client.session.save()
        await client.disconnect()
        return sent.phone_code_hash, session_str

    return loop.run_until_complete(_do())


def _tg_sign_in_sync(api_id: int, api_hash: str, phone: str, code: str, phone_code_hash: str, session_str: str = "") -> str:
    """Выполняет sign_in, переиспользуя сессию от send_code (тот же auth_key)."""
    import asyncio as _aio
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    loop = _aio.new_event_loop()
    _aio.set_event_loop(loop)

    async def _do():
        client = TelegramClient(StringSession(session_str or None), api_id, api_hash)
        await client.connect()
        await client.sign_in(phone, code, phone_code_hash=phone_code_hash)
        new_session = client.session.save()
        await client.disconnect()
        return new_session

    return loop.run_until_complete(_do())


@router.post("/{business_id}/tg-send-code")
async def tg_send_code(
    business_id: str,
    req: TGPhoneIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn:
        raise HTTPException(400, "Telegram-канал не подключён. Сначала подключи в разделе Платформы.")
    from app.config import settings
    api_id = int(settings.TG_API_ID) if settings.TG_API_ID else 0
    api_hash = settings.TG_API_HASH or ""
    if not api_id or not api_hash:
        raise HTTPException(
            400,
            "На сервере не настроен TG_API_ID / TG_API_HASH. "
            "Добавь переменные окружения в Railway (получить на my.telegram.org → API development tools)."
        )
    try:
        phone_code_hash, temp_session = await asyncio.to_thread(
            _tg_send_code_sync, api_id, api_hash, req.phone
        )
        _pending_tg_meta[business_id] = {"api_id": api_id, "api_hash": api_hash, "session": temp_session}
        return {"phone_code_hash": phone_code_hash, "status": "code_sent"}
    except Exception as e:
        raise HTTPException(400, f"Ошибка отправки кода: {str(e)}")


@router.post("/{business_id}/tg-sign-in")
async def tg_sign_in(
    business_id: str,
    req: TGCodeIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn:
        raise HTTPException(400, "Telegram-канал не подключён.")
    from app.config import settings
    api_id = int(settings.TG_API_ID) if settings.TG_API_ID else 0
    api_hash = settings.TG_API_HASH or ""
    if not api_id or not api_hash:
        raise HTTPException(400, "TG_API_ID / TG_API_HASH не настроены на сервере.")
    temp_session = (_pending_tg_meta.get(business_id) or {}).get("session", "")
    try:
        session_str = await asyncio.to_thread(
            _tg_sign_in_sync, api_id, api_hash, req.phone, req.code, req.phone_code_hash, temp_session
        )
        _pending_tg_meta.pop(business_id, None)
        conn.tg_api_id = str(api_id)
        conn.tg_api_hash = api_hash
        conn.tg_session_encrypted = encrypt_token(session_str)
        await db.commit()
        return {"status": "connected"}
    except Exception as e:
        raise HTTPException(400, f"Ошибка входа: {str(e)}")


@router.post("/{business_id}/vk-credentials")
async def save_vk_credentials(
    business_id: str,
    req: VKCredentialsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "vk", db)
    if not conn:
        raise HTTPException(400, "VK-сообщество не подключено. Сначала подключи в разделе Платформы.")
    conn.vk_user_token_encrypted = encrypt_token(req.user_token)
    await db.commit()
    return {"status": "saved"}


@router.post("/{business_id}/tg-credentials")
async def save_tg_credentials(
    business_id: str,
    req: TGCredentialsIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn:
        raise HTTPException(400, "Telegram-канал не подключён. Сначала подключи в разделе Платформы.")
    from app.services.publishers import encrypt_token
    conn.tg_api_id = str(req.api_id)
    conn.tg_api_hash = req.api_hash
    conn.tg_session_encrypted = encrypt_token(req.session)
    await db.commit()
    return {"status": "saved"}


# ─── Collect: прямой вызов в рамках запроса через asyncio.to_thread ───────────

async def _save_vk(db: AsyncSession, business_id: str, vk: PlatformConnection) -> dict:
    """Собирает VK-аналитику и сохраняет в БД. Возвращает статус."""
    from app.services.analytics_vk import collect_vk_weekly

    community_token = decrypt_token(vk.token_encrypted)
    user_token = decrypt_token(vk.vk_user_token_encrypted) if vk.vk_user_token_encrypted else None

    if not user_token:
        return {
            "weeks": 0,
            "error": "Нужен VK user token для чтения стены. Добавь его в настройках аналитики.",
        }

    weekly, posts = await asyncio.to_thread(
        collect_vk_weekly, vk.external_page_id, community_token, user_token
    )
    if not weekly:
        return {"weeks": 0, "error": "Постов не найдено или VK API не вернул данных"}

    await db.execute(
        delete(VKWeeklyStats).where(
            VKWeeklyStats.business_id == business_id,
            VKWeeklyStats.group_id == vk.external_page_id.lstrip("-"),
        )
    )
    for w in weekly:
        ws_date = datetime.fromisoformat(w["week_start"])
        we_date = datetime.fromisoformat(w["week_end"])
        week_posts = [p for p in posts if w["week_start"] <= p["date"][:10] <= w["week_end"]]
        db.add(VKWeeklyStats(
            id=uuid.uuid4(),
            business_id=uuid.UUID(business_id),
            group_id=w["group_id"],
            group_name=w["group_name"],
            week_start=ws_date,
            week_end=we_date,
            stats={k: v for k, v in w.items()
                   if k not in ("group_id", "group_name", "week_start", "week_end")},
            posts=week_posts,
        ))
    await db.commit()
    return {"weeks": len(weekly)}


async def _save_tg_via_bot(db: AsyncSession, business_id: str, tg: PlatformConnection) -> dict:
    """
    Базовый сбор TG через бот-токен (без MTProto).
    Даёт: количество подписчиков + посты из ContentSlots за последние 12 недель.
    """
    import aiohttp
    from datetime import date, timedelta, datetime as dt

    bot_token = decrypt_token(tg.token_encrypted)

    async with aiohttp.ClientSession() as s:
        r1 = await s.get(
            f"https://api.telegram.org/bot{bot_token}/getChat",
            params={"chat_id": tg.external_page_id},
        )
        chat_resp = await r1.json()
        r2 = await s.get(
            f"https://api.telegram.org/bot{bot_token}/getChatMemberCount",
            params={"chat_id": tg.external_page_id},
        )
        members_resp = await r2.json()

    if not chat_resp.get("ok"):
        return {"weeks": 0, "error": chat_resp.get("description", "Bot API ошибка")}

    channel_name = chat_resp["result"].get("title", tg.page_name)
    subscribers = members_resp.get("result", 0) if members_resp.get("ok") else 0

    # Последние 12 завершённых недель из ContentSlots
    today = date.today()
    monday_this = today - timedelta(days=today.weekday())
    weeks_data = []
    for i in range(1, 13):
        ws = monday_this - timedelta(weeks=i)
        we = ws + timedelta(days=6)
        ws_dt = dt(ws.year, ws.month, ws.day, 0, 0, 0)
        we_dt = dt(we.year, we.month, we.day, 23, 59, 59)

        slots_res = await db.execute(
            select(ContentSlot).where(
                ContentSlot.business_id == business_id,
                ContentSlot.platform == Platform.telegram,
                ContentSlot.status == PlanStatus.published,
                ContentSlot.published_at >= ws_dt,
                ContentSlot.published_at <= we_dt,
            )
        )
        slots = slots_res.scalars().all()
        weeks_data.append({
            "week_start": ws.isoformat(),
            "week_end": we.isoformat(),
            "posts_count": len(slots),
        })

    # Всегда сохраняем хотя бы последнюю неделю (с subscriber count)
    save_weeks = [w for w in weeks_data if w["posts_count"] > 0] or [weeks_data[0]]

    await db.execute(
        delete(TGWeeklyStats).where(TGWeeklyStats.business_id == business_id)
    )
    for w in save_weeks:
        db.add(TGWeeklyStats(
            id=uuid.uuid4(),
            business_id=uuid.UUID(business_id),
            channel_id=tg.external_page_id,
            channel_name=channel_name,
            week_start=datetime.fromisoformat(w["week_start"]),
            week_end=datetime.fromisoformat(w["week_end"]),
            stats={
                "subscribers": subscribers,
                "posts_count": w["posts_count"],
                "total_views": None,
                "avg_views": None,
                "er_views_pct": None,
                "er_activity_pct": None,
                "quality_index": None,
                "_mode": "basic",
            },
            posts=[],
        ))
    await db.commit()
    return {"weeks": len(save_weeks), "mode": "basic", "subscribers": subscribers}


async def _save_tg(db: AsyncSession, business_id: str, tg: PlatformConnection) -> dict:
    """Собирает TG-аналитику. MTProto если настроен, иначе базовый Bot API режим."""
    from app.config import settings

    api_id = int(tg.tg_api_id) if tg.tg_api_id else settings.TG_API_ID
    api_hash = tg.tg_api_hash if tg.tg_api_hash else settings.TG_API_HASH
    session = (
        decrypt_token(tg.tg_session_encrypted)
        if tg.tg_session_encrypted
        else settings.TG_STRING_SESSION
    )

    if api_id and session:
        from app.services.analytics_tg import collect_tg_weekly, _TG_AUTH_KEYWORDS
        try:
            weekly, posts = await asyncio.to_thread(
                collect_tg_weekly, api_id, api_hash, session, tg.external_page_id
            )
        except Exception as e:
            err_lower = str(e).lower()
            # Auth error: session expired — clear from DB so user knows to re-auth
            if any(k in err_lower for k in _TG_AUTH_KEYWORDS):
                tg.tg_session_encrypted = None
                await db.commit()
                return {
                    "weeks": 0,
                    "error": f"Сессия Telegram устарела — переподключите аккаунт в настройках аналитики. ({e})",
                }
            # Connection error: EOF / network reset — fall back to Bot API
            if any(k in err_lower for k in ("eof", "connection", "reset", "broken pipe", "timed out", "incomplete")):
                fallback = await _save_tg_via_bot(db, business_id, tg)
                fallback["warning"] = f"MTProto временно недоступен (ошибка соединения), данные собраны через Bot API. ({e})"
                return fallback
            return {"weeks": 0, "error": str(e)}

        if not weekly:
            return {"weeks": 0, "error": "MTProto: постов не найдено"}
        await db.execute(
            delete(TGWeeklyStats).where(
                TGWeeklyStats.business_id == business_id,
                TGWeeklyStats.channel_id == tg.external_page_id,
            )
        )
        for w in weekly:
            ws_date = datetime.fromisoformat(w["week_start"])
            we_date = datetime.fromisoformat(w["week_end"])
            week_posts = [p for p in posts if w["week_start"] <= p["date"][:10] <= w["week_end"]]
            db.add(TGWeeklyStats(
                id=uuid.uuid4(),
                business_id=uuid.UUID(business_id),
                channel_id=tg.external_page_id,
                channel_name=w.get("channel_name", tg.page_name),
                week_start=ws_date,
                week_end=we_date,
                stats={k: v for k, v in w.items()
                       if k not in ("channel_id", "channel_name", "week_start", "week_end")},
                posts=week_posts,
            ))
        await db.commit()
        return {"weeks": len(weekly), "mode": "full"}

    # Fallback: базовый режим через бот-токен
    return await _save_tg_via_bot(db, business_id, tg)


@router.post("/{business_id}/collect")
async def collect_analytics(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result: dict = {}

    vk = await _get_connection(business_id, "vk", db)
    if vk:
        try:
            result["vk"] = await _save_vk(db, business_id, vk)
        except Exception as e:
            result["vk"] = {"weeks": 0, "error": str(e)}

    tg = await _get_connection(business_id, "telegram", db)
    if tg:
        try:
            result["tg"] = await _save_tg(db, business_id, tg)
        except Exception as e:
            result["tg"] = {"weeks": 0, "error": str(e)}

    if not vk and not tg:
        return {"status": "no_connections", "detail": "Нет подключённых платформ"}

    return {"status": "done", **result}


# ─── Excel export ────────────────────────────────────────────────────────────

def _make_excel_tg(rows: list) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "TG_Недели"

    HEADERS = [
        "Неделя", "Канал", "Подписчики", "Постов",
        "Всего просмотров", "Ср. охват", "Медиана охвата",
        "Ср. реакции", "Ср. комм.", "Ср. репосты",
        "ER просмотры %", "ER активность %",
        "Вирусность %", "Вовлечённость /1000", "Индекс качества",
        "Лучший день", "Лучший час",
    ]

    hdr_fill = PatternFill("solid", fgColor="1A1A1A")
    for col, h in enumerate(HEADERS, 1):
        c = ws.cell(1, col, h)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = hdr_fill
        c.alignment = Alignment(horizontal="center")

    for ri, row in enumerate(rows, 2):
        fill = PatternFill("solid", fgColor="F8F7F4" if ri % 2 == 0 else "FFFFFF")
        vals = [
            f"{row.get('week_start','')} — {row.get('week_end','')}",
            row.get("channel_name", ""),
            row.get("subscribers", ""),
            row.get("posts_count", ""),
            row.get("total_views", ""),
            row.get("avg_views", ""),
            row.get("median_views", ""),
            row.get("avg_reactions", ""),
            row.get("avg_comments", ""),
            row.get("avg_reposts", ""),
            row.get("er_views_pct", ""),
            row.get("er_activity_pct", ""),
            row.get("virality_pct", ""),
            row.get("engagement_per_1000", ""),
            row.get("quality_index", ""),
            row.get("best_day", ""),
            row.get("best_hour", ""),
        ]
        for col, val in enumerate(vals, 1):
            c = ws.cell(ri, col, val)
            c.fill = fill

    for col in range(1, len(HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 22

    ws2 = wb.create_sheet("TG_Посты")
    P_HEADERS = ["Канал", "Дата (EKB)", "ID", "Просмотры", "Реакции", "Комм.", "Репосты", "Текст"]
    for col, h in enumerate(P_HEADERS, 1):
        c = ws2.cell(1, col, h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = hdr_fill
    for row in rows:
        for post in (row.get("posts") or []):
            ws2.append([
                row.get("channel_name", ""),
                post.get("date", ""),
                post.get("id", ""),
                post.get("views", 0),
                post.get("reactions", 0),
                post.get("comments", 0),
                post.get("reposts", 0),
                post.get("text", ""),
            ])
    ws2.column_dimensions["H"].width = 60

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _make_excel_vk(rows: list) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "VK_Недели"

    HEADERS = [
        "Неделя", "Сообщество", "Участников", "Постов",
        "Всего просмотров", "Ср. охват", "Медиана охвата",
        "Ср. лайки", "Ср. комм.", "Ср. репосты",
        "ER подписчики %", "ER просмотры %",
        "Вирусность %", "Индекс вовлечённости",
        "Прирост подписчиков", "Лучший день", "Лучший час",
    ]

    hdr_fill = PatternFill("solid", fgColor="1A1A1A")
    for col, h in enumerate(HEADERS, 1):
        c = ws.cell(1, col, h)
        c.font = Font(bold=True, color="FFFFFF", size=10)
        c.fill = hdr_fill
        c.alignment = Alignment(horizontal="center")

    for ri, row in enumerate(rows, 2):
        fill = PatternFill("solid", fgColor="F8F7F4" if ri % 2 == 0 else "FFFFFF")
        vals = [
            f"{row.get('week_start','')} — {row.get('week_end','')}",
            row.get("group_name", ""),
            row.get("members", ""),
            row.get("posts_count", ""),
            row.get("total_views", ""),
            row.get("avg_views", ""),
            row.get("median_views", ""),
            row.get("avg_likes", ""),
            row.get("avg_comments", ""),
            row.get("avg_reposts", ""),
            row.get("er_subscribers_pct", ""),
            row.get("er_views_pct", ""),
            row.get("virality_pct", ""),
            row.get("engagement_index", ""),
            row.get("net_growth", "н/д"),
            row.get("best_day", ""),
            row.get("best_hour", ""),
        ]
        for col, val in enumerate(vals, 1):
            c = ws.cell(ri, col, val)
            c.fill = fill

    for col in range(1, len(HEADERS) + 1):
        ws.column_dimensions[get_column_letter(col)].width = 18
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 22

    ws2 = wb.create_sheet("VK_Посты")
    P_HEADERS = ["Сообщество", "Дата (EKB)", "ID", "Просмотры", "Лайки", "Комм.", "Репосты", "Текст"]
    for col, h in enumerate(P_HEADERS, 1):
        c = ws2.cell(1, col, h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = hdr_fill
    for row in rows:
        for post in (row.get("posts") or []):
            ws2.append([
                row.get("group_name", ""),
                post.get("date", ""),
                post.get("id", ""),
                post.get("views", 0),
                post.get("likes", 0),
                post.get("comments", 0),
                post.get("reposts", 0),
                post.get("text", ""),
            ])
    ws2.column_dimensions["H"].width = 60

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


@router.get("/{business_id}/tg/export")
async def export_tg_excel(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(TGWeeklyStats)
        .where(TGWeeklyStats.business_id == business_id)
        .order_by(TGWeeklyStats.week_start.asc())
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, "Нет данных для экспорта")

    data = [{**r.stats, "posts": r.posts, "channel_name": r.channel_name,
             "week_start": r.week_start.date().isoformat(),
             "week_end": r.week_end.date().isoformat()} for r in rows]

    file_bytes = _make_excel_tg(data)
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=tg_analytics.xlsx"},
    )


@router.get("/{business_id}/vk/export")
async def export_vk_excel(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(VKWeeklyStats)
        .where(VKWeeklyStats.business_id == business_id)
        .order_by(VKWeeklyStats.week_start.asc())
    )
    rows = result.scalars().all()
    if not rows:
        raise HTTPException(404, "Нет данных для экспорта")

    data = [{**r.stats, "posts": r.posts, "group_name": r.group_name,
             "week_start": r.week_start.date().isoformat(),
             "week_end": r.week_end.date().isoformat()} for r in rows]

    file_bytes = _make_excel_vk(data)
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=vk_analytics.xlsx"},
    )


# ─── TG POSTS (per-post analytics) ───────────────────────────────────────────

def _collect_posts_sync(api_id: int, api_hash: str, session_str: str,
                        channel: str, max_id: int = 0) -> list[dict]:
    """Собирает посты из Telegram-канала. max_id=0 → последние 500; max_id>0 → старше max_id."""
    import asyncio as _aio
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from app.services.analytics_tg import _parse_channel_id

    loop = _aio.new_event_loop()
    _aio.set_event_loop(loop)

    async def _do():
        client = TelegramClient(StringSession(session_str or None), api_id, api_hash)
        await client.connect()
        posts = []
        try:
            # Нормализуем ID так же как _fetch_channel в analytics_tg.py
            numeric_id = _parse_channel_id(channel)
            full_id = int(f"-100{numeric_id}")

            try:
                entity = await client.get_entity(full_id)
            except Exception:
                await client.get_dialogs(limit=50)
                entity = await client.get_entity(full_id)
            subscribers = getattr(entity, "participants_count", 0) or 0
            ch_name = getattr(entity, "username", "") or getattr(entity, "title", "") or ""

            kwargs: dict = {"limit": 500}
            if max_id > 0:
                kwargs["max_id"] = max_id  # уходим глубже в историю

            async for msg in client.iter_messages(entity, **kwargs):
                if not msg or getattr(msg, "service", False):
                    continue

                views = msg.views or 0
                reacts = 0
                if msg.reactions:
                    reacts = sum(r.count for r in msg.reactions.results)
                reposts = msg.forwards or 0
                comments = (msg.replies.replies if msg.replies else 0)

                er = ((reacts + comments + reposts) / views * 100) if views > 0 else 0.0
                viral = (reposts / views * 100) if views > 0 else 0.0

                text = msg.text or ""
                mtype = "none"
                if msg.photo:
                    mtype = "photo"
                elif getattr(msg, "video", None) or getattr(msg, "video_note", None):
                    mtype = "video"
                elif getattr(msg, "voice", None):
                    mtype = "voice"
                elif msg.document:
                    mtype = "document"

                posts.append({
                    "post_id": msg.id,
                    "published_at": msg.date.replace(tzinfo=None),
                    "text": text,
                    "views": views,
                    "reactions": reacts,
                    "comments": comments,
                    "reposts": reposts,
                    "has_media": mtype != "none",
                    "media_type": mtype,
                    "er_pct": round(er, 2),
                    "virality_pct": round(viral, 4),
                    "has_question": "?" in text,
                    "subscribers": subscribers,
                    "channel_name": ch_name,
                })
        finally:
            await client.disconnect()
        return posts

    return loop.run_until_complete(_do())


async def _upsert_posts(business_id: str, posts: list[dict], db: AsyncSession) -> int:
    """Upsert TelegramPost rows — обновляет метрики если пост уже есть."""
    if not posts:
        return 0
    biz_uuid = uuid.UUID(str(business_id))
    for pd in posts:
        res = await db.execute(
            select(TelegramPost).where(
                TelegramPost.business_id == biz_uuid,
                TelegramPost.post_id == pd["post_id"],
            )
        )
        existing = res.scalar_one_or_none()
        if existing:
            for k, v in pd.items():
                setattr(existing, k, v)
            existing.updated_at = datetime.utcnow()
        else:
            db.add(TelegramPost(id=uuid.uuid4(), business_id=biz_uuid, **pd))
    await db.commit()
    return len(posts)


@router.get("/{business_id}/tg/posts")
async def get_tg_posts(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Возвращает все сохранённые посты (из БД, не из Telegram)."""
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(TelegramPost)
        .where(TelegramPost.business_id == business_id)
        .order_by(TelegramPost.published_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "post_id": r.post_id,
            "channel_name": r.channel_name,
            "published_at": r.published_at.isoformat(),
            "text": r.text,
            "views": r.views,
            "reactions": r.reactions,
            "comments": r.comments,
            "reposts": r.reposts,
            "has_media": r.has_media,
            "media_type": r.media_type,
            "er_pct": r.er_pct,
            "virality_pct": r.virality_pct,
            "has_question": r.has_question,
            "subscribers": r.subscribers,
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/{business_id}/tg/posts/collect")
async def collect_tg_posts(
    business_id: str,
    deeper: bool = Query(False, description="True — уходим глубже в историю"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Собирает/обновляет посты из Telegram. deeper=True → продолжает с самого старого."""
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn or not conn.tg_session_encrypted:
        raise HTTPException(400, "Telegram не авторизован. Войдите через вкладку Аналитика → Telegram.")

    from app.config import settings
    api_id = int(settings.TG_API_ID) if settings.TG_API_ID else 0
    api_hash = settings.TG_API_HASH or ""
    if not api_id:
        raise HTTPException(400, "TG_API_ID / TG_API_HASH не настроены.")

    session_str = decrypt_token(conn.tg_session_encrypted)
    channel = conn.external_page_id or ""
    if not channel:
        raise HTTPException(400, "Идентификатор канала не найден. Переподключите Telegram в разделе Платформы.")

    # Определяем max_id: для deeper берём минимальный post_id из уже сохранённых
    max_id = 0
    if deeper:
        res = await db.execute(
            select(func.min(TelegramPost.post_id)).where(TelegramPost.business_id == business_id)
        )
        min_stored = res.scalar()
        if min_stored:
            max_id = min_stored - 1  # уходим глубже (older)

    try:
        posts = await asyncio.to_thread(
            _collect_posts_sync, api_id, api_hash, session_str, channel, max_id
        )
        count = await _upsert_posts(business_id, posts, db)
        return {"status": "ok", "collected": count, "deeper": deeper}
    except Exception as e:
        raise HTTPException(400, f"Ошибка сбора постов: {str(e)}")


# ─── TG STORIES ───────────────────────────────────────────────────────────────

def _collect_stories_sync(api_id: int, api_hash: str, session_str: str,
                          channel: str, offset_id: int = 0) -> list[dict]:
    """Собирает истории из Telegram-канала через архив Stories."""
    import asyncio as _aio
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from app.services.analytics_tg import _parse_channel_id

    loop = _aio.new_event_loop()
    _aio.set_event_loop(loop)

    async def _do():
        client = TelegramClient(StringSession(session_str or None), api_id, api_hash)
        await client.connect()
        stories_out = []
        try:
            numeric_id = _parse_channel_id(channel)
            full_id = int(f"-100{numeric_id}")

            try:
                entity = await client.get_entity(full_id)
            except Exception:
                await client.get_dialogs(limit=50)
                entity = await client.get_entity(full_id)

            ch_name = getattr(entity, "username", "") or getattr(entity, "title", "") or ""

            from telethon.tl.functions.stories import GetStoriesArchiveRequest
            result = await client(GetStoriesArchiveRequest(
                peer=entity,
                offset_id=offset_id,
                limit=100,
            ))

            for story in (result.stories or []):
                views_count = 0
                reactions_count = 0
                forwards_count = 0
                sv = getattr(story, "views", None)
                if sv:
                    views_count = getattr(sv, "views_count", 0) or 0
                    reactions_count = getattr(sv, "reactions_count", 0) or 0
                    forwards_count = getattr(sv, "forwards_count", 0) or 0

                has_media = False
                mtype = "none"
                media = getattr(story, "media", None)
                if media:
                    has_media = True
                    if hasattr(media, "photo") and media.photo:
                        mtype = "photo"
                    elif hasattr(media, "document") and media.document:
                        mtype = "video"

                er = ((reactions_count + forwards_count) / views_count * 100) if views_count > 0 else 0.0

                published = story.date
                if hasattr(published, "replace"):
                    published = published.replace(tzinfo=None)

                expires_raw = getattr(story, "expire_date", None)
                expires = None
                if isinstance(expires_raw, int):
                    from datetime import datetime as _dt
                    expires = _dt.utcfromtimestamp(expires_raw)
                elif expires_raw:
                    expires = expires_raw.replace(tzinfo=None) if hasattr(expires_raw, "replace") else None

                caption = getattr(story, "caption", "") or ""

                stories_out.append({
                    "story_id": story.id,
                    "channel_name": ch_name,
                    "published_at": published,
                    "expires_at": expires,
                    "caption": caption,
                    "views": views_count,
                    "reactions": reactions_count,
                    "forwards": forwards_count,
                    "has_media": has_media,
                    "media_type": mtype,
                    "er_pct": round(er, 2),
                })
        finally:
            await client.disconnect()
        return stories_out

    return loop.run_until_complete(_do())


async def _upsert_stories(business_id: str, stories: list[dict], db: AsyncSession) -> int:
    if not stories:
        return 0
    biz_uuid = uuid.UUID(str(business_id))
    # Метрики, которые могут обнуляться в Telegram после истечения истории —
    # перезаписываем только если новое значение больше уже сохранённого.
    _PRESERVABLE = ("views", "reactions", "forwards")
    for sd in stories:
        res = await db.execute(
            select(TelegramStory).where(
                TelegramStory.business_id == biz_uuid,
                TelegramStory.story_id == sd["story_id"],
            )
        )
        existing = res.scalar_one_or_none()
        if existing:
            for k, v in sd.items():
                if k in _PRESERVABLE:
                    # Сохраняем максимум: не затираем ненулевые данные нулями
                    old = getattr(existing, k, 0) or 0
                    setattr(existing, k, max(old, v or 0))
                else:
                    setattr(existing, k, v)
            # Пересчитываем ER на основе актуальных (preserved) значений
            v_views = existing.views or 0
            if v_views > 0:
                existing.er_pct = round((existing.reactions + existing.forwards) / v_views * 100, 2)
            existing.updated_at = datetime.utcnow()
        else:
            db.add(TelegramStory(id=uuid.uuid4(), business_id=biz_uuid, **sd))
    await db.commit()
    return len(stories)


@router.get("/{business_id}/tg/stories")
async def get_tg_stories(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    result = await db.execute(
        select(TelegramStory)
        .where(TelegramStory.business_id == business_id)
        .order_by(TelegramStory.published_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "story_id": r.story_id,
            "channel_name": r.channel_name,
            "published_at": r.published_at.isoformat(),
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "caption": r.caption,
            "views": r.views,
            "reactions": r.reactions,
            "forwards": r.forwards,
            "has_media": r.has_media,
            "media_type": r.media_type,
            "er_pct": r.er_pct,
            "updated_at": r.updated_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/{business_id}/tg/stories/collect")
async def collect_tg_stories(
    business_id: str,
    deeper: bool = Query(False, description="True — уходим глубже в историю"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    conn = await _get_connection(business_id, "telegram", db)
    if not conn or not conn.tg_session_encrypted:
        raise HTTPException(400, "Telegram не авторизован. Войдите через вкладку Аналитика → Telegram.")

    from app.config import settings
    api_id = int(settings.TG_API_ID) if settings.TG_API_ID else 0
    api_hash = settings.TG_API_HASH or ""
    if not api_id:
        raise HTTPException(400, "TG_API_ID / TG_API_HASH не настроены.")

    session_str = decrypt_token(conn.tg_session_encrypted)
    channel = conn.external_page_id or ""
    if not channel:
        raise HTTPException(400, "Идентификатор канала не найден. Переподключите Telegram.")

    offset_id = 0
    if deeper:
        res = await db.execute(
            select(func.min(TelegramStory.story_id)).where(TelegramStory.business_id == business_id)
        )
        min_stored = res.scalar()
        if min_stored:
            offset_id = min_stored - 1

    try:
        stories = await asyncio.to_thread(
            _collect_stories_sync, api_id, api_hash, session_str, channel, offset_id
        )
        count = await _upsert_stories(business_id, stories, db)
        return {"status": "ok", "collected": count, "deeper": deeper}
    except Exception as e:
        raise HTTPException(400, f"Ошибка сбора историй: {str(e)}")
