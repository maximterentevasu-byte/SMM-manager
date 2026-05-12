from io import BytesIO
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.database import get_db
from app.models.models import User, Business, PlatformConnection, TGWeeklyStats, VKWeeklyStats
from app.api.auth import get_current_user

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


# ─── Trigger collection ──────────────────────────────────────────────────────

@router.post("/{business_id}/collect")
async def collect_analytics(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_business(business_id, current_user, db)
    from app.workers.analytics_tasks import collect_analytics_task
    collect_analytics_task.delay(business_id)
    return {"status": "started"}


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

    # Posts sheet
    ws2 = wb.create_sheet("TG_Посты")
    P_HEADERS = ["Канал", "Дата (EKB)", "ID", "Просмотры", "Реакции", "Комм.", "Репосты", "Текст"]
    for col, h in enumerate(P_HEADERS, 1):
        c = ws2.cell(1, col, h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = hdr_fill
    for ri2, row in enumerate(rows, 0):
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
