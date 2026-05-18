"""
Сбор аналитики VK-сообщества.

wall.get  — вызывается с user_token (VK user access token).
            Community token (group auth) не поддерживает wall.get (code 27).
stats.get — вызывается с community_token (разрешение «Статистика сообщества»).
groups.getById — community_token или user_token, любой.
"""
import httpx
import time
from datetime import datetime, date, timedelta
from collections import defaultdict

VK_API = "https://api.vk.com/method"
EKB_HOURS = 5

DAY_RU = {
    "Monday": "Пн", "Tuesday": "Вт", "Wednesday": "Ср",
    "Thursday": "Чт", "Friday": "Пт", "Saturday": "Сб", "Sunday": "Вс",
}


def _req(method: str, params: dict, timeout: int = 20) -> dict:
    for attempt in range(4):
        try:
            r = httpx.get(f"{VK_API}/{method}", params={**params, "v": "5.131"}, timeout=timeout)
            data = r.json()
            if "error" in data:
                code = data["error"]["error_code"]
                if code in (6, 9) and attempt < 3:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise ValueError(f"VK API {method}: {data['error']['error_msg']} (code {code})")
            return data.get("response", {})
        except httpx.RequestError:
            if attempt < 3:
                time.sleep(1)
            else:
                raise
    return {}


def _get_group_info(group_id: str, token: str) -> dict:
    try:
        resp = _req("groups.getById", {
            "group_id": group_id, "fields": "members_count", "access_token": token,
        })
    except ValueError:
        resp = _req("groups.getById", {"group_id": group_id, "fields": "members_count"})

    if isinstance(resp, list):
        groups = resp
    elif isinstance(resp, dict):
        groups = resp.get("groups", [])
    else:
        groups = []
    return groups[0] if groups else {}


def _get_posts(group_id: str, user_token: str) -> list[dict]:
    """
    Читает посты через user token. Community token не работает с wall.get (code 27).
    """
    posts = []
    offset = 0
    owner_id = f"-{group_id}"
    while True:
        resp = _req("wall.get", {
            "owner_id": owner_id,
            "count": 100,
            "offset": offset,
            "access_token": user_token,
        })
        items = resp.get("items", []) if isinstance(resp, dict) else []
        for p in items:
            if p.get("is_pinned") or p.get("marked_as_ads"):
                continue
            posts.append({
                "id": p["id"],
                "date": datetime.utcfromtimestamp(p["date"]),
                "views": (p.get("views") or {}).get("count", 0),
                "likes": (p.get("likes") or {}).get("count", 0),
                "comments": (p.get("comments") or {}).get("count", 0),
                "reposts": (p.get("reposts") or {}).get("count", 0),
                "text": (p.get("text") or "")[:200],
            })
        if len(items) < 100:
            break
        offset += 100
        time.sleep(0.35)
    return posts


def _get_stats(group_id: str, community_token: str, date_from: str, date_to: str) -> dict:
    try:
        resp = _req("stats.get", {
            "group_id": group_id,
            "date_from": date_from,
            "date_to": date_to,
            "interval": "week",
            "intervals_count": 52,
            "extended": 0,
            "access_token": community_token,
        })
        if isinstance(resp, list):
            return {item.get("period_from", ""): item for item in resp}
    except ValueError:
        pass
    return {}


def collect_vk_weekly(
    group_id: str,
    community_token: str,
    user_token: str,
) -> tuple[list[dict], list[dict]]:
    """Возвращает (weekly_stats, all_posts)."""
    group_id = group_id.lstrip("-")

    group_info = _get_group_info(group_id, community_token)
    group_name = group_info.get("name", group_id)
    members = group_info.get("members_count", 0)

    posts = _get_posts(group_id, user_token)
    if not posts:
        return [], []

    week_posts: dict = defaultdict(list)
    today = date.today()
    for p in posts:
        ekb = p["date"] + timedelta(hours=EKB_HOURS)
        wd = ekb.weekday()
        ws = (ekb - timedelta(days=wd)).date()
        we = ws + timedelta(days=6)
        if we < today:
            week_posts[(ws, we)].append(p)

    if week_posts:
        all_dates = sorted(week_posts.keys())
        stats_map = _get_stats(group_id, community_token, all_dates[0][0].isoformat(), today.isoformat())
    else:
        stats_map = {}

    weekly = []
    for (ws, we), week in sorted(week_posts.items()):
        n = len(week)
        if n == 0:
            continue

        views_list = [p["views"] for p in week if p["views"] > 0]
        l_list = [p["likes"] for p in week]
        c_list = [p["comments"] for p in week]
        r_list = [p["reposts"] for p in week]

        total_views = sum(views_list)
        total_eng = sum(l_list) + sum(c_list) + sum(r_list)
        avg_views = total_views / len(views_list) if views_list else 0
        median_views = sorted(views_list)[len(views_list) // 2] if views_list else 0

        er_subs = total_eng / (members * n) * 100 if members > 0 else 0
        er_views = total_eng / total_views * 100 if total_views > 0 else 0
        virality = sum(r_list) / total_views * 100 if total_views > 0 else 0
        eng_idx = (sum(l_list) + 2 * sum(c_list) + 3 * sum(r_list)) / total_views * 100 if total_views > 0 else 0

        subscribed = None
        unsubscribed = None
        net_growth = None
        stat = stats_map.get(ws.isoformat())
        if stat:
            subscribed = int(stat.get("subscribed") or 0)
            unsubscribed = int(stat.get("unsubscribed") or 0)
            net_growth = subscribed - unsubscribed

        day_s: dict = defaultdict(lambda: {"v": 0, "n": 0})
        hour_s: dict = defaultdict(lambda: {"v": 0, "n": 0})
        for p in week:
            ekb = p["date"] + timedelta(hours=EKB_HOURS)
            day_s[ekb.strftime("%A")]["v"] += p["views"]
            day_s[ekb.strftime("%A")]["n"] += 1
            hour_s[ekb.hour]["v"] += p["views"]
            hour_s[ekb.hour]["n"] += 1

        best_day_en = max(day_s, key=lambda d: day_s[d]["v"] / max(day_s[d]["n"], 1)) if day_s else ""
        best_hour = max(hour_s, key=lambda h: hour_s[h]["v"] / max(hour_s[h]["n"], 1)) if hour_s else 0

        avg_likes = round(sum(l_list) / n, 1)
        avg_comments = round(sum(c_list) / n, 1)
        avg_reposts = round(sum(r_list) / n, 1)

        weekly.append({
            "group_id": group_id,
            "group_name": group_name,
            "week_start": ws.isoformat(),
            "week_end": we.isoformat(),
            "members": members,
            "posts_count": n,
            "total_views": total_views,
            "avg_views": round(avg_views, 1),
            "median_views": median_views,
            "avg_likes": avg_likes,
            "avg_comments": avg_comments,
            "avg_reposts": avg_reposts,
            "engagement_per_post": round(avg_likes + avg_comments + avg_reposts, 1),
            "er_subscribers_pct": round(er_subs, 2),
            "er_views_pct": round(er_views, 2),
            "virality_pct": round(virality, 3),
            "engagement_index": round(eng_idx, 2),
            "subscribed": subscribed,
            "unsubscribed": unsubscribed,
            "net_growth": net_growth,
            "best_day": DAY_RU.get(best_day_en, best_day_en),
            "best_hour": f"{best_hour:02d}:00",
            "best_post_views": max(views_list) if views_list else 0,
            "worst_post_views": min(views_list) if views_list else 0,
        })

    all_posts = [
        {
            "id": p["id"],
            "date": p["date"].isoformat(),
            "views": p["views"],
            "likes": p["likes"],
            "comments": p["comments"],
            "reposts": p["reposts"],
            "text": p["text"],
            "group_id": group_id,
            "group_name": group_name,
        }
        for p in posts
    ]
    return weekly, all_posts
