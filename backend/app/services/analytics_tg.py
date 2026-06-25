"""
Сбор аналитики Telegram-канала через MTProto (telethon).
Требует TG_API_ID, TG_API_HASH, TG_STRING_SESSION в .env
"""
import asyncio
from datetime import datetime, date, timedelta
from collections import defaultdict

EKB_HOURS = 5  # UTC+5 (Екатеринбург)

DAY_RU = {
    "Monday": "Пн", "Tuesday": "Вт", "Wednesday": "Ср",
    "Thursday": "Чт", "Friday": "Пт", "Saturday": "Сб", "Sunday": "Вс",
}

_TG_CONNECTION_ERRORS = (ConnectionError, EOFError, OSError, asyncio.IncompleteReadError)

# Ошибки авторизации — не ретраим, сессия невалидна
_TG_AUTH_KEYWORDS = ("auth_key", "unauthorized", "session_expired", "user_deactivated", "auth key")


def _to_ekb(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) + timedelta(hours=EKB_HOURS)


def _week_bounds(dt: datetime) -> tuple[date, date]:
    ekb = _to_ekb(dt)
    start = (ekb - timedelta(days=ekb.weekday())).date()
    return start, start + timedelta(days=6)


def _parse_channel_id(chat_id: str):
    """
    Возвращает числовой ID (int) или @username (str) для Telethon get_entity.
    Принимает: '@username', '1003916447124', '-1001003916447124'
    """
    s = str(chat_id).strip()
    # @username — Telethon принимает напрямую
    if s.startswith("@") or not s.lstrip("-").isdigit():
        return s if s.startswith("@") else f"@{s}"
    s_num = s.lstrip("-")
    if s_num.startswith("100") and len(s_num) > 12:
        s_num = s_num[3:]
    return int(s_num)


async def _fetch_channel(api_id: int, api_hash: str, session_str: str, chat_id: str) -> tuple[int, str, list]:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.functions.channels import GetFullChannelRequest

    parsed = _parse_channel_id(chat_id)
    # Для числового ID строим -100XXXX, для @username передаём напрямую
    full_id = int(f"-100{parsed}") if isinstance(parsed, int) else parsed

    last_exc: Exception = RuntimeError("no attempts")
    for attempt in range(3):
        if attempt > 0:
            await asyncio.sleep(3 * attempt)
        try:
            async with TelegramClient(StringSession(session_str), api_id, api_hash) as client:
                try:
                    entity = await client.get_entity(full_id)
                except Exception:
                    await client.get_dialogs(limit=50)
                    entity = await client.get_entity(full_id)

                full = await client(GetFullChannelRequest(entity))
                subscribers = full.full_chat.participants_count
                channel_name = getattr(entity, "title", str(chat_id))

                posts = []
                async for msg in client.iter_messages(entity, limit=None):
                    if msg.views is None:
                        continue
                    reactions = 0
                    if msg.reactions:
                        reactions = sum(r.count for r in msg.reactions.results)
                    posts.append({
                        "id": msg.id,
                        "date": msg.date,
                        "views": msg.views or 0,
                        "reactions": reactions,
                        "comments": msg.replies.replies if msg.replies else 0,
                        "reposts": msg.forwards or 0,
                        "text": (msg.message or "")[:160],
                    })

            return subscribers, channel_name, posts

        except _TG_CONNECTION_ERRORS as e:
            last_exc = e
            continue
        except Exception as e:
            if any(k in str(e).lower() for k in _TG_AUTH_KEYWORDS):
                raise
            last_exc = e
            continue

    raise last_exc


def _build_weekly(channel_id: str, subscribers: int, channel_name: str, posts: list) -> list[dict]:
    week_posts: dict = defaultdict(list)
    today = date.today()

    for p in posts:
        ws, we = _week_bounds(p["date"])
        if we < today:  # только завершённые недели
            week_posts[(ws, we)].append(p)

    sorted_weeks = sorted(week_posts.items())
    results = []
    for (ws, we), week in sorted_weeks:
        n = len(week)
        if n == 0:
            continue

        views = [p["views"] for p in week if p["views"] > 0]
        r_list = [p["reactions"] for p in week]
        c_list = [p["comments"] for p in week]
        f_list = [p["reposts"] for p in week]

        total_views = sum(views)
        total_reactions = sum(r_list)
        total_comments = sum(c_list)
        total_reposts = sum(f_list)
        total_eng = total_reactions + total_comments + total_reposts

        avg_views = total_views / len(views) if views else 0
        median_views = sorted(views)[len(views) // 2] if views else 0

        # ER (активности)%: вовлечённость на пост / средний просмотр * 100
        engagement_per_post = total_eng / n if n > 0 else 0
        er_activity_pct = engagement_per_post / avg_views * 100 if avg_views > 0 else 0

        # Виральность: репосты / просмотры * 100
        virality_pct = total_reposts / total_views * 100 if total_views > 0 else 0

        # Лучший и худший пост по просмотрам
        best_post_views = max(views) if views else 0
        worst_post_views = min(views) if views else 0

        day_s: dict = defaultdict(lambda: {"v": 0, "n": 0})
        hour_s: dict = defaultdict(lambda: {"v": 0, "n": 0})
        for p in week:
            ekb = _to_ekb(p["date"])
            day_s[ekb.strftime("%A")]["v"] += p["views"]
            day_s[ekb.strftime("%A")]["n"] += 1
            hour_s[ekb.hour]["v"] += p["views"]
            hour_s[ekb.hour]["n"] += 1

        best_day_en = max(day_s, key=lambda d: day_s[d]["v"] / max(day_s[d]["n"], 1)) if day_s else ""
        best_hour = max(hour_s, key=lambda h: hour_s[h]["v"] / max(hour_s[h]["n"], 1)) if hour_s else 0

        results.append({
            "channel_id": channel_id,
            "channel_name": channel_name,
            "week_start": ws.isoformat(),
            "week_end": we.isoformat(),
            # Telegram хранит только текущее число подписчиков.
            # Присваиваем его только последней (самой свежей) неделе.
            # Для всех остальных ставим None — фронт покажет «—».
            "subscribers": None,
            "posts_count": n,
            "total_views": total_views,
            "avg_views": round(avg_views, 1),
            "median_views": median_views,
            "avg_reactions": round(total_reactions / n, 1),
            "avg_comments": round(total_comments / n, 1),
            "avg_reposts": round(total_reposts / n, 1),
            # ER по просмотрам считаем только для последней недели (там есть subscribers)
            "er_reach_pct": None,
            "er_activity_pct": round(er_activity_pct, 2),
            "engagement_per_post": round(engagement_per_post, 1),
            "virality_pct": round(virality_pct, 3),
            "best_post_views": best_post_views,
            "worst_post_views": worst_post_views,
            "best_day": DAY_RU.get(best_day_en, best_day_en),
            "best_hour": f"{best_hour:02d}:00",
        })

    # Последняя (самая свежая завершённая) неделя получает актуальное число подписчиков
    if results and subscribers:
        last = results[-1]
        last["subscribers"] = subscribers
        avg_views = last["avg_views"] or 0
        if avg_views > 0:
            last["er_reach_pct"] = round(avg_views / subscribers * 100, 2)

    return results


def collect_tg_weekly(api_id: int, api_hash: str, session_str: str, chat_id: str) -> tuple[list[dict], list[dict]]:
    """
    Возвращает (weekly_stats, all_posts).
    Создаёт собственный event loop — безопасно вызывать из asyncio.to_thread.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        subscribers, channel_name, posts = loop.run_until_complete(
            _fetch_channel(api_id, api_hash, session_str, chat_id)
        )
    finally:
        loop.close()
        asyncio.set_event_loop(None)

    weekly = _build_weekly(chat_id, subscribers, channel_name, posts)

    all_posts = [
        {
            "id": p["id"],
            "date": p["date"].isoformat(),
            "views": p["views"],
            "reactions": p["reactions"],
            "comments": p["comments"],
            "reposts": p["reposts"],
            "text": p["text"],
            "channel_id": chat_id,
            "channel_name": channel_name,
        }
        for p in posts
    ]
    return weekly, all_posts
