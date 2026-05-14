"""
Задача: уведомление администратора бизнеса через Telegram-бот
за 2 дня до публикации постов в статусах pending_approval / needs_info.
"""
import asyncio
from datetime import datetime, timedelta

import aiohttp

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import ContentSlot, PlatformConnection, PlanStatus, Platform
from sqlalchemy import select, and_


def _platform_label(platform) -> str:
    val = platform.value if hasattr(platform, "value") else platform
    return {"telegram": "Telegram", "vk": "ВКонтакте", "ok": "Одноклассники"}.get(val, val)


@celery_app.task(name="app.workers.notification_tasks.notify_pending_posts")
def notify_pending_posts():
    asyncio.run(_notify())


async def _notify():
    async with get_worker_db() as db:
        now = datetime.utcnow()
        deadline = now + timedelta(days=2)

        result = await db.execute(
            select(ContentSlot).where(
                and_(
                    ContentSlot.status.in_([PlanStatus.pending_approval, PlanStatus.needs_info]),
                    ContentSlot.scheduled_at >= now,
                    ContentSlot.scheduled_at <= deadline,
                )
            )
        )
        slots = result.scalars().all()

        if not slots:
            return

        # Группируем слоты по business_id, чтобы слать одно сообщение за раз
        by_business: dict[str, list] = {}
        for slot in slots:
            key = str(slot.business_id)
            by_business.setdefault(key, []).append(slot)

        async with aiohttp.ClientSession() as session:
            for business_id, biz_slots in by_business.items():
                # Ищем TG-подключение с admin_chat_id
                conn_result = await db.execute(
                    select(PlatformConnection).where(
                        and_(
                            PlatformConnection.business_id == business_id,
                            PlatformConnection.platform == Platform.telegram,
                            PlatformConnection.is_active == True,
                        )
                    )
                )
                connection = conn_result.scalar_one_or_none()
                if not connection or not connection.admin_chat_id:
                    continue

                from app.services.publishers import decrypt_token
                try:
                    bot_token = decrypt_token(connection.token_encrypted)
                except Exception:
                    continue

                lines = [f"🔔 Посты требуют вашего внимания:\n"]
                for slot in biz_slots:
                    scheduled = slot.scheduled_at.strftime("%d.%m %H:%M")
                    st_icon = "⏳" if slot.status == PlanStatus.pending_approval else "📋"
                    st_label = "Ждёт согласования" if slot.status == PlanStatus.pending_approval else "Нужна информация"
                    rubric = slot.rubric.get("name", "—") if slot.rubric else "—"
                    platform = _platform_label(slot.platform)

                    lines.append(f"{st_icon} {platform} · {rubric}\n   📅 {scheduled} · {st_label}")
                    if slot.needs_info_for:
                        for item in slot.needs_info_for:
                            lines.append(f"   • {item}")
                    lines.append("")

                lines.append("Зайдите в контент-план для согласования или добавления информации.")
                text = "\n".join(lines)

                try:
                    await session.post(
                        f"https://api.telegram.org/bot{bot_token}/sendMessage",
                        json={"chat_id": connection.admin_chat_id, "text": text[:4000]},
                    )
                    print(f"✓ Уведомление отправлено: {business_id[:8]}... ({len(biz_slots)} постов)")
                except Exception as e:
                    print(f"✗ Ошибка отправки уведомления: {e}")
