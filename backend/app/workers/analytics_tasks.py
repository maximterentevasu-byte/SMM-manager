import asyncio
import uuid
from datetime import datetime

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import Business, PlatformConnection, TGWeeklyStats, VKWeeklyStats, TelegramStory
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
        tg_conn = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.business_id == business_id,
                PlatformConnection.platform == "telegram",
                PlatformConnection.is_active == True,
            )
        )
        tg = tg_conn.scalar_one_or_none()
        if tg:
            # Credentials из БД (введены пользователем), иначе fallback на .env
            api_id = int(tg.tg_api_id) if tg.tg_api_id else settings.TG_API_ID
            api_hash = tg.tg_api_hash if tg.tg_api_hash else settings.TG_API_HASH
            session = (
                decrypt_token(tg.tg_session_encrypted)
                if tg.tg_session_encrypted
                else settings.TG_STRING_SESSION
            )

            if api_id and session:
                try:
                    from app.services.analytics_tg import collect_tg_weekly
                    weekly, posts = collect_tg_weekly(
                        api_id, api_hash, session, tg.external_page_id,
                    )
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
            else:
                print(f"[analytics] TG: нет credentials для {business.name}")

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
        else:
            print(f"[analytics] VK: нет активного подключения для {business.name}")


@celery_app.task(name="app.workers.analytics_tasks.collect_stories_daily_task")
def collect_stories_daily_task():
    """Ежедневный сбор историй Telegram для всех бизнесов в 10:00 ЕКБ (05:00 UTC)."""
    asyncio.run(_collect_all_stories())


async def _collect_all_stories():
    async with get_worker_db() as db:
        result = await db.execute(select(Business))
        businesses = result.scalars().all()
    for biz in businesses:
        try:
            await _collect_stories(str(biz.id))
        except Exception as e:
            print(f"[stories] Ошибка для {biz.id}: {e}")


async def _collect_stories(business_id: str):
    async with get_worker_db() as db:
        tg_res = await db.execute(
            select(PlatformConnection).where(
                PlatformConnection.business_id == business_id,
                PlatformConnection.platform == "telegram",
                PlatformConnection.is_active == True,
            )
        )
        tg = tg_res.scalar_one_or_none()
        if not tg or not tg.tg_session_encrypted:
            return

        api_id = int(settings.TG_API_ID) if settings.TG_API_ID else 0
        api_hash = settings.TG_API_HASH or ""
        if not api_id:
            return

        session_str = decrypt_token(tg.tg_session_encrypted)
        channel = tg.external_page_id or ""
        if not channel:
            return

        try:
            from app.api.analytics import _collect_stories_sync, _upsert_stories
            stories = await asyncio.get_event_loop().run_in_executor(
                None, _collect_stories_sync, api_id, api_hash, session_str, channel, 0
            )
            count = await _upsert_stories(business_id, stories, db)
            print(f"[stories] Собрано {count} историй для business_id={business_id}")
        except Exception as e:
            print(f"[stories] Ошибка сбора для {business_id}: {e}")
