import asyncio
import uuid
from datetime import datetime

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import Business, PlatformConnection, TGWeeklyStats, VKWeeklyStats
from app.config import settings
from app.services.publishers import decrypt_token
from sqlalchemy import select, delete


@celery_app.task(name="app.workers.analytics_tasks.collect_analytics_task")
def collect_analytics_task(business_id: str):
    asyncio.run(_collect(business_id))


@celery_app.task(name="app.workers.analytics_tasks.collect_all_analytics_task")
def collect_all_analytics_task():
    """Еженедельный сбор для всех бизнесов."""
    asyncio.run(_collect_all())


async def _collect_all():
    async with get_worker_db() as db:
        result = await db.execute(select(Business))
        businesses = result.scalars().all()
    for biz in businesses:
        try:
            await _collect(str(biz.id))
        except Exception as e:
            print(f"[analytics] Ошибка для {biz.id}: {e}")


async def _collect(business_id: str):
    async with get_worker_db() as db:
        result = await db.execute(select(Business).where(Business.id == business_id))
        business = result.scalar_one_or_none()
        if not business:
            print(f"[analytics] Бизнес {business_id} не найден")
            return

        # ── TG ───────────────────────────────────────────────────────────────
        if settings.TG_API_ID and settings.TG_STRING_SESSION:
            tg_conn = await db.execute(
                select(PlatformConnection).where(
                    PlatformConnection.business_id == business_id,
                    PlatformConnection.platform == "telegram",
                    PlatformConnection.is_active == True,
                )
            )
            tg = tg_conn.scalar_one_or_none()
            if tg:
                try:
                    from app.services.analytics_tg import collect_tg_weekly
                    weekly, posts = collect_tg_weekly(
                        settings.TG_API_ID,
                        settings.TG_API_HASH,
                        settings.TG_STRING_SESSION,
                        tg.external_page_id,
                    )
                    # Удаляем старые данные для этого канала и перезаписываем
                    await db.execute(
                        delete(TGWeeklyStats).where(
                            TGWeeklyStats.business_id == business_id,
                            TGWeeklyStats.channel_id == tg.external_page_id,
                        )
                    )
                    # Группируем посты по неделям для хранения
                    posts_by_week: dict = {}
                    for p in posts:
                        wk = p["date"][:10]  # "YYYY-MM-DD"
                        posts_by_week.setdefault(wk, []).append(p)

                    for w in weekly:
                        ws_date = datetime.fromisoformat(w["week_start"])
                        we_date = datetime.fromisoformat(w["week_end"])
                        week_posts = [p for p in posts if w["week_start"] <= p["date"][:10] <= w["week_end"]]
                        row = TGWeeklyStats(
                            id=uuid.uuid4(),
                            business_id=uuid.UUID(business_id),
                            channel_id=tg.external_page_id,
                            channel_name=w.get("channel_name", tg.page_name),
                            week_start=ws_date,
                            week_end=we_date,
                            stats={k: v for k, v in w.items()
                                   if k not in ("channel_id", "channel_name", "week_start", "week_end")},
                            posts=week_posts,
                        )
                        db.add(row)
                    await db.commit()
                    print(f"[analytics] TG собрана для {business.name}: {len(weekly)} недель")
                except Exception as e:
                    print(f"[analytics] TG ошибка для {business.name}: {e}")

        # ── VK ───────────────────────────────────────────────────────────────
        vk_conn = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.business_id == business_id,
                PlatformConnection.platform == "vk",
                PlatformConnection.is_active == True,
            )
        )
        vk = vk_conn.scalar_one_or_none()
        if vk:
            try:
                from app.services.analytics_vk import collect_vk_weekly
                token = decrypt_token(vk.token_encrypted)
                weekly, posts = collect_vk_weekly(vk.external_page_id, token)

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
                    row = VKWeeklyStats(
                        id=uuid.uuid4(),
                        business_id=uuid.UUID(business_id),
                        group_id=w["group_id"],
                        group_name=w["group_name"],
                        week_start=ws_date,
                        week_end=we_date,
                        stats={k: v for k, v in w.items()
                               if k not in ("group_id", "group_name", "week_start", "week_end")},
                        posts=week_posts,
                    )
                    db.add(row)
                await db.commit()
                print(f"[analytics] VK собрана для {business.name}: {len(weekly)} недель")
            except Exception as e:
                print(f"[analytics] VK ошибка для {business.name}: {e}")
