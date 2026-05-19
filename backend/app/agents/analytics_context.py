"""
Сборщик аналитического контекста компании для AI-промптов.
Читает реальные данные из БД (TG/VK посты, ER, паттерны времени) и
форматирует их в текст, который передаётся в стратегию, планировщик и копирайтер.
"""
import logging
from collections import Counter
from sqlalchemy import select, desc
from app.models.models import TGWeeklyStats, VKWeeklyStats

log = logging.getLogger(__name__)


async def get_company_analytics_context(business_id, db) -> dict:
    """
    Возвращает структурированный аналитический контекст бизнеса.
    Безопасен: при ошибках возвращает пустой контекст без исключений.
    """
    ctx = {"has_data": False, "tg": None, "vk": None}

    # ── Telegram ──────────────────────────────────────────────────────────
    try:
        res = await db.execute(
            select(TGWeeklyStats)
            .where(TGWeeklyStats.business_id == business_id)
            .order_by(desc(TGWeeklyStats.week_start))
            .limit(16)
        )
        tg_weeks = res.scalars().all()

        if tg_weeks:
            # Собираем все посты из weekly stats (поле posts — список по неделе)
            all_posts = []
            for w in tg_weeks:
                for p in (w.posts or []):
                    if isinstance(p, dict) and p.get("text"):
                        all_posts.append(p)

            top = sorted(all_posts, key=lambda p: p.get("er_pct", 0) or 0, reverse=True)[:5]
            worst = sorted(all_posts, key=lambda p: p.get("er_pct", 0) or 0)[:3]

            avg_er = (
                sum((w.stats or {}).get("er_activity_pct", 0) or 0 for w in tg_weeks)
                / len(tg_weeks)
            )
            best_days = [w.stats.get("best_day") for w in tg_weeks if w.stats and w.stats.get("best_day")]
            best_hours = [w.stats.get("best_hour") for w in tg_weeks if w.stats and w.stats.get("best_hour")]

            ctx["tg"] = {
                "weeks_count": len(tg_weeks),
                "avg_er": round(avg_er, 2),
                "best_day": Counter(best_days).most_common(1)[0][0] if best_days else None,
                "best_hour": Counter(best_hours).most_common(1)[0][0] if best_hours else None,
                "top_posts": [
                    {
                        "text": (p.get("text") or "")[:200].replace("\n", " "),
                        "er_pct": round(p.get("er_pct", 0) or 0, 2),
                        "views": p.get("views", 0) or 0,
                        "reactions": p.get("reactions", 0) or 0,
                    }
                    for p in top
                ],
                "worst_posts": [
                    {
                        "text": (p.get("text") or "")[:120].replace("\n", " "),
                        "er_pct": round(p.get("er_pct", 0) or 0, 2),
                    }
                    for p in worst if (p.get("text") or "").strip()
                ],
            }
            ctx["has_data"] = True
    except Exception as e:
        log.warning("[analytics_context] TG fetch error: %s", e)

    # ── ВКонтакте ─────────────────────────────────────────────────────────
    try:
        res = await db.execute(
            select(VKWeeklyStats)
            .where(VKWeeklyStats.business_id == business_id)
            .order_by(desc(VKWeeklyStats.week_start))
            .limit(16)
        )
        vk_weeks = res.scalars().all()

        if vk_weeks:
            all_posts = []
            for w in vk_weeks:
                for p in (w.posts or []):
                    if isinstance(p, dict) and p.get("text"):
                        all_posts.append(p)

            # Для VK сортируем по вовлечённости (лайки + репосты)
            top = sorted(
                all_posts,
                key=lambda p: (p.get("likes", 0) or 0) + (p.get("reposts", 0) or 0) * 3,
                reverse=True,
            )[:5]
            worst = sorted(
                all_posts,
                key=lambda p: (p.get("likes", 0) or 0) + (p.get("reposts", 0) or 0),
            )[:3]

            avg_er = (
                sum((w.stats or {}).get("er_subscribers_pct", 0) or 0 for w in vk_weeks)
                / len(vk_weeks)
            )
            best_days = [w.stats.get("best_day") for w in vk_weeks if w.stats and w.stats.get("best_day")]
            best_hours = [w.stats.get("best_hour") for w in vk_weeks if w.stats and w.stats.get("best_hour")]

            ctx["vk"] = {
                "weeks_count": len(vk_weeks),
                "avg_er": round(avg_er, 2),
                "best_day": Counter(best_days).most_common(1)[0][0] if best_days else None,
                "best_hour": Counter(best_hours).most_common(1)[0][0] if best_hours else None,
                "top_posts": [
                    {
                        "text": (p.get("text") or "")[:200].replace("\n", " "),
                        "views": p.get("views", 0) or 0,
                        "likes": p.get("likes", 0) or 0,
                        "reposts": p.get("reposts", 0) or 0,
                        "comments": p.get("comments", 0) or 0,
                    }
                    for p in top
                ],
                "worst_posts": [
                    {
                        "text": (p.get("text") or "")[:120].replace("\n", " "),
                        "likes": p.get("likes", 0) or 0,
                    }
                    for p in worst if (p.get("text") or "").strip()
                ],
            }
            ctx["has_data"] = True
    except Exception as e:
        log.warning("[analytics_context] VK fetch error: %s", e)

    return ctx


def format_analytics_for_prompt(ctx: dict) -> str:
    """
    Форматирует аналитический контекст в компактный текст для промпта.
    Возвращает пустую строку если данных нет.
    """
    if not ctx.get("has_data"):
        return ""

    lines = [
        "═══ АНАЛИТИКА КОМПАНИИ (реальные данные — используй для настройки контента) ═══"
    ]

    tg = ctx.get("tg")
    if tg:
        lines.append(f"\nTELEGRAM | {tg['weeks_count']} нед. данных | Средний ER: {tg['avg_er']}%")
        if tg.get("best_day"):
            lines.append(f"  Лучший день публикации: {tg['best_day']}, лучший час: {tg.get('best_hour', '?')}")
        if tg.get("top_posts"):
            lines.append("  Посты с лучшим откликом — учитывай стиль, формат, длину:")
            for i, p in enumerate(tg["top_posts"][:4], 1):
                lines.append(f"    {i}. ER {p['er_pct']}% · {p['views']} просм. — «{p['text'][:150]}»")
        if tg.get("worst_posts"):
            lines.append("  Посты с низким откликом — избегай такой подачи:")
            for p in tg["worst_posts"][:2]:
                if p["text"]:
                    lines.append(f"    ✗ ER {p['er_pct']}% — «{p['text'][:100]}»")

    vk = ctx.get("vk")
    if vk:
        lines.append(f"\nВКОНТАКТЕ | {vk['weeks_count']} нед. данных | Средний ER: {vk['avg_er']}%")
        if vk.get("best_day"):
            lines.append(f"  Лучший день публикации: {vk['best_day']}, лучший час: {vk.get('best_hour', '?')}")
        if vk.get("top_posts"):
            lines.append("  Посты с лучшим откликом:")
            for i, p in enumerate(vk["top_posts"][:4], 1):
                lines.append(
                    f"    {i}. {p['views']} просм. · {p['likes']} лайков · {p['reposts']} репостов"
                    f" — «{p['text'][:150]}»"
                )
        if vk.get("worst_posts"):
            lines.append("  Посты с низким откликом:")
            for p in vk["worst_posts"][:2]:
                if p["text"]:
                    lines.append(f"    ✗ {p['likes']} лайков — «{p['text'][:100]}»")

    lines.append("═══════════════════════════════════════════════════════════════════════")
    return "\n".join(lines)
