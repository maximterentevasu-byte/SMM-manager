from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from app.database import get_db
from app.models.models import (
    User, Business, ContentSlot, PlanStatus,
    TGWeeklyStats, VKWeeklyStats, TelegramPost,
)
from app.api.auth import get_current_user

router = APIRouter()

METRIC_ALIASES: dict = {
    "Охваты / Показы":    "Охваты/Показы",
    "ER вовлеченность ЦА": "ER вовлечённость ЦА",
    "Вирусность контента": "Виральность",
    "ER по просмотрам":   None,
}

SMM_METRIC_CONFIG: dict = {
    "Подписчики":            {"vk": "members",              "tg": "subscribers",      "agg": "latest", "fmt": "int",   "icon": "👥", "label": "Подписчики"},
    "Охваты/Показы":         {"vk": "total_views",          "tg": "total_views",      "agg": "avg",    "fmt": "int",   "icon": "👁",  "label": "Ср. охват/нед"},
    "ER вовлечённость ЦА":   {"vk": "er_subscribers_pct",  "tg": "er_activity_pct",  "agg": "avg",    "fmt": "pct",   "icon": "💡", "label": "ER"},
    "Комментарии":           {"vk": "avg_comments",         "tg": "avg_comments",     "agg": "avg",    "fmt": "float", "icon": "💬", "label": "Комм./пост"},
    "Лайки/Реакции":         {"vk": "avg_likes",            "tg": "avg_reactions",    "agg": "avg",    "fmt": "float", "icon": "❤️", "label": "Лайки/пост"},
    "Репосты":               {"vk": "avg_reposts",          "tg": "avg_reposts",      "agg": "avg",    "fmt": "float", "icon": "🔄", "label": "Репосты/пост"},
    "Количество постов":     {"vk": "posts_count",          "tg": "posts_count",      "agg": "avg",    "fmt": "float", "icon": "📝", "label": "Постов/нед"},
    "Виральность":           {"vk": "virality_pct",         "tg": "virality_pct",     "agg": "avg",    "fmt": "pct",   "icon": "🚀", "label": "Виральность"},
}

PERIOD_WEEKS = {"1m": 4, "3m": 13, "6m": 26, "all": 9999}

CHANGE_METRICS = {
    "total_views":        "Охваты",
    "avg_views":          "Средний охват",
    "avg_likes":          "Лайки",
    "avg_reactions":      "Реакции",
    "avg_comments":       "Комментарии",
    "avg_reposts":        "Репосты",
    "er_subscribers_pct": "ER (подписчики)",
    "er_activity_pct":    "ER (активность)",
    "er_views_pct":       "ER (охват)",
    "virality_pct":       "Виральность",
    "engagement_per_post":"Вовлечённость/пост",
}


def _agg(weeks_stats: list[dict], field: str, agg: str):
    values = [s[field] for s in weeks_stats if isinstance(s.get(field), (int, float))]
    if not values:
        return None
    if agg == "latest":
        return values[0]
    if agg == "sum":
        return sum(values)
    return round(sum(values) / len(values), 2)


def _combine(vk_val, tg_val, agg: str):
    vals = [v for v in [vk_val, tg_val] if v is not None]
    if not vals:
        return None
    if agg == "latest":
        return vals[0]
    if agg == "sum":
        return sum(vals)
    return round(sum(vals) / len(vals), 2)


def _compute_kpi(smm_metrics: list, vk_stats: list[dict], tg_stats: list[dict]) -> dict:
    result: dict = {}
    for period, n in PERIOD_WEEKS.items():
        kpi_list = []
        vk_curr = vk_stats[:n]
        vk_prev = vk_stats[n: n * 2]
        tg_curr = tg_stats[:n]
        tg_prev = tg_stats[n: n * 2]

        for metric_name in smm_metrics:
            cfg = SMM_METRIC_CONFIG.get(metric_name)
            if not cfg:
                continue

            vk_c = _agg(vk_curr, cfg["vk"], cfg["agg"])
            tg_c = _agg(tg_curr, cfg["tg"], cfg["agg"])
            combined = _combine(vk_c, tg_c, cfg["agg"])

            vk_p = _agg(vk_prev, cfg["vk"], cfg["agg"])
            tg_p = _agg(tg_prev, cfg["tg"], cfg["agg"])
            prev = _combine(vk_p, tg_p, cfg["agg"])

            delta_pct = None
            if combined is not None and prev and prev != 0:
                delta_pct = round((combined - prev) / abs(prev) * 100, 1)

            kpi_list.append({
                "name": metric_name,
                "label": cfg["label"],
                "icon": cfg["icon"],
                "fmt": cfg["fmt"],
                "value": combined,
                "delta_pct": delta_pct,
            })

        result[period] = kpi_list
    return result


def _compute_changes(vk_weeks, tg_weeks) -> tuple[list, list]:
    changes = []
    for platform, weeks in [("vk", vk_weeks), ("tg", tg_weeks)]:
        if len(weeks) < 2:
            continue
        curr = weeks[0].stats or {}
        prev = weeks[1].stats or {}
        for key, label in CHANGE_METRICS.items():
            c = curr.get(key)
            p = prev.get(key)
            if c is None or p is None or not isinstance(c, (int, float)) or not isinstance(p, (int, float)) or p == 0:
                continue
            change_pct = round((c - p) / abs(p) * 100, 1)
            changes.append({
                "metric": label,
                "platform": platform,
                "value": round(c, 2),
                "prev": round(p, 2),
                "change_pct": change_pct,
            })

    changes.sort(key=lambda x: x["change_pct"], reverse=True)
    growing = [x for x in changes if x["change_pct"] > 0][:5]
    falling = sorted([x for x in changes if x["change_pct"] < 0], key=lambda x: x["change_pct"])[:5]
    return growing, falling


def _top_posts_from_analytics(vk_weeks: list, tg_posts: list, since: datetime | None, limit: int = 5) -> list:
    all_posts = []

    # VK: collect from weekly stats posts arrays
    for w in vk_weeks:
        for p in w.posts or []:
            try:
                pub = datetime.fromisoformat(p["date"]) if "date" in p else None
            except Exception:
                pub = None
            if since and pub and pub < since:
                continue
            all_posts.append({
                "platform": "vk",
                "date": p.get("date", ""),
                "views": int(p.get("views", 0)),
                "likes": int(p.get("likes", 0)),
                "comments": int(p.get("comments", 0)),
                "reposts": int(p.get("reposts", 0)),
                "text": (p.get("text") or "")[:200],
                "channel_name": w.group_name,
            })

    # TG: from TelegramPost table (pre-fetched as list of dicts)
    for p in tg_posts:
        if since and p["published_at"] < since:
            continue
        all_posts.append({
            "platform": "tg",
            "date": p["published_at"].isoformat(),
            "views": p["views"],
            "likes": p["reactions"],
            "comments": p["comments"],
            "reposts": p["reposts"],
            "text": (p["text"] or "")[:200],
            "channel_name": p["channel_name"],
        })

    all_posts.sort(key=lambda x: x["views"], reverse=True)
    return all_posts[:limit]


@router.get("/{business_id}")
async def get_home_dashboard(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.utcnow()

    biz_result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    biz = biz_result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")

    profile = biz.profile or {}
    raw_metrics = profile.get("smm_metrics") or []
    smm_metrics = [METRIC_ALIASES.get(m, m) for m in raw_metrics]
    smm_metrics = [m for m in smm_metrics if m and m in SMM_METRIC_CONFIG]
    if not smm_metrics:
        smm_metrics = list(SMM_METRIC_CONFIG.keys())

    # Weekly analytics
    vk_result = await db.execute(
        select(VKWeeklyStats)
        .where(VKWeeklyStats.business_id == business_id)
        .order_by(VKWeeklyStats.week_start.desc())
    )
    vk_weeks = list(vk_result.scalars().all())

    tg_result = await db.execute(
        select(TGWeeklyStats)
        .where(TGWeeklyStats.business_id == business_id)
        .order_by(TGWeeklyStats.week_start.desc())
    )
    tg_weeks = list(tg_result.scalars().all())

    # TelegramPost rows for top content — отдельный запрос на каждый период,
    # чтобы старые вирусные посты не вытесняли свежие из лимита.
    async def _fetch_tg_posts(since_dt):
        q = select(TelegramPost).where(TelegramPost.business_id == business_id)
        if since_dt:
            q = q.where(TelegramPost.published_at >= since_dt)
        q = q.order_by(TelegramPost.views.desc()).limit(50)
        res = await db.execute(q)
        return [
            {
                "published_at": p.published_at,
                "views": p.views,
                "reactions": p.reactions,
                "comments": p.comments,
                "reposts": p.reposts,
                "text": p.text,
                "channel_name": p.channel_name,
            }
            for p in res.scalars().all()
        ]

    tg_posts_1m = await _fetch_tg_posts(now - timedelta(days=30))
    tg_posts_3m = await _fetch_tg_posts(now - timedelta(days=90))
    tg_posts_all = await _fetch_tg_posts(None)

    # KPI
    vk_stats = [w.stats for w in vk_weeks if w.stats]
    tg_stats = [w.stats for w in tg_weeks if w.stats]
    kpi = _compute_kpi(smm_metrics, vk_stats, tg_stats)

    # Growing / falling
    growing, falling = _compute_changes(vk_weeks, tg_weeks)

    # AI summary from latest week
    ai_summary = None
    if vk_weeks and vk_weeks[0].stats:
        ai_summary = vk_weeks[0].stats.get("ai_status")
    if not ai_summary and tg_weeks and tg_weeks[0].stats:
        ai_summary = tg_weeks[0].stats.get("ai_status")

    # Scheduled next 5 days (non-published — need attention)
    ATTENTION_STATUSES = [PlanStatus.planned, PlanStatus.idea_ready, PlanStatus.needs_info, PlanStatus.pending_approval]
    slots_5d_result = await db.execute(
        select(ContentSlot)
        .where(
            ContentSlot.business_id == business_id,
            ContentSlot.scheduled_at >= now,
            ContentSlot.scheduled_at <= now + timedelta(days=5),
            ContentSlot.status.in_(ATTENTION_STATUSES),
        )
        .order_by(ContentSlot.scheduled_at)
        .limit(25)
    )
    slots_5d = slots_5d_result.scalars().all()

    # Upcoming 7 days (all statuses)
    slots_7d_result = await db.execute(
        select(ContentSlot)
        .where(
            ContentSlot.business_id == business_id,
            ContentSlot.scheduled_at >= now,
            ContentSlot.scheduled_at <= now + timedelta(days=7),
        )
        .order_by(ContentSlot.scheduled_at)
        .limit(30)
    )
    slots_7d = slots_7d_result.scalars().all()

    # Top content from analytics
    top_1m = _top_posts_from_analytics(vk_weeks, tg_posts_1m, now - timedelta(days=30))
    top_3m = _top_posts_from_analytics(vk_weeks, tg_posts_3m, now - timedelta(days=90))
    top_all = _top_posts_from_analytics(vk_weeks, tg_posts_all, None)

    STATUS_LABELS = {
        "planned":         "Нет контента",
        "idea_ready":      "Нужна информация",
        "needs_info":      "Нужна информация",
        "pending_approval":"Согласование",
        "content_ready":   "Готово",
        "published":       "Опубликовано",
        "failed":          "Ошибка",
    }

    return {
        "business_name": profile.get("name") or biz.name or "",
        "smm_metrics": smm_metrics,
        "kpi": kpi,
        "analytics": {
            "growing": growing,
            "falling": falling,
            "ai_summary": ai_summary,
            "has_data": bool(vk_weeks or tg_weeks),
        },
        "scheduled_5d": [
            {
                "id": str(s.id),
                "platform": s.platform.value,
                "scheduled_at": s.scheduled_at.isoformat(),
                "status": s.status.value,
                "status_label": STATUS_LABELS.get(s.status.value, s.status.value),
                "rubric_name": (s.rubric or {}).get("name", ""),
                "post_text": (s.post_text or "")[:120],
                "needs_info_for": s.needs_info_for or [],
            }
            for s in slots_5d
        ],
        "upcoming_7d": [
            {
                "id": str(s.id),
                "platform": s.platform.value,
                "scheduled_at": s.scheduled_at.isoformat(),
                "status": s.status.value,
                "rubric_name": (s.rubric or {}).get("name", ""),
                "post_text": (s.post_text or "")[:200],
                "has_image": bool(s.image_base64 or s.image_url),
                "image_url": s.image_url,
            }
            for s in slots_7d
        ],
        "top_content": {
            "1m": top_1m,
            "3m": top_3m,
            "all": top_all,
        },
    }
