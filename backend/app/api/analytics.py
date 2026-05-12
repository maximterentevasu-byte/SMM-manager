import asyncio
import uuid
from io import BytesIO
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models.models import (
    User, Business, PlatformConnection,
    TGWeeklyStats, VKWeeklyStats, ContentSlot, PlanStatus, Platform,
)
from app.api.auth import get_current_user
from app.services.publishers import decrypt_token

router = APIRouter()


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
    token = decrypt_token(vk.token_encrypted)
    weekly, posts = await asyncio.to_thread(collect_vk_weekly, vk.external_page_id, token)
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
        from app.services.analytics_tg import collect_tg_weekly
        weekly, posts = await asyncio.to_thread(
            collect_tg_weekly, api_id, api_hash, session, tg.external_page_id
        )
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
