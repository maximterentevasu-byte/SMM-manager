"""
Telegram-уведомления для владельцев бизнеса.

Логика:
- 1 сообщение = 1 пост (каждый пост отправляется отдельным сообщением)
- Уведомления начинаются ровно за 3 дня до публикации в 10:00 МСК
- Повторяются каждые 3 часа (задача запускается в 10, 13, 16, 19, 22 МСК)
- Пользователь отвечает ИМЕННО на это сообщение → бот обрабатывает ответ
- Из ответа извлекаются фото/видео и текст, которые прикрепляются к карточке поста
"""
import asyncio
import base64
from datetime import datetime, timedelta

import aiohttp

from app.workers.celery_app import celery_app
from app.workers.db import get_worker_db
from app.models.models import (
    ContentSlot, PlatformConnection, SlotNotification, PlanStatus, Platform, Business
)
from sqlalchemy import select, and_, delete

import logging
log = logging.getLogger(__name__)

# МСК = UTC+3
MSK_OFFSET = timedelta(hours=3)

NOTIFY_DAYS_BEFORE = 3          # за сколько дней начинать уведомления
NOTIFY_HOUR_MSK = 10            # час начала уведомлений по МСК
NOTIFY_INTERVAL_HOURS = 3       # интервал между повторами

MEDIA_KEYWORDS = ["фото", "видео", "пришли", "загрузи", "прикрепи", "изображение", "снимок"]


def _is_media_question(q: str) -> bool:
    return any(kw in q.lower() for kw in MEDIA_KEYWORDS)


def _platform_label(platform) -> str:
    val = platform.value if hasattr(platform, "value") else platform
    return {"telegram": "Telegram", "vk": "ВКонтакте", "ok": "Одноклассники"}.get(val, val)


def _build_slot_message(slot: ContentSlot) -> str:
    rubric = slot.rubric.get("name", "—") if slot.rubric else "—"
    platform = _platform_label(slot.platform)
    scheduled = slot.scheduled_at.strftime("%d.%m.%Y %H:%M")

    lines = [
        f"📋 <b>Нужна информация для поста</b>",
        f"",
        f"📅 {scheduled}  ·  {platform}  ·  {rubric}",
    ]

    if slot.idea and slot.idea.get("idea"):
        lines.append(f"💡 {slot.idea['idea']}")

    if slot.needs_info_for:
        lines.append("")
        lines.append("<b>Что нужно предоставить:</b>")
        for i, item in enumerate(slot.needs_info_for, 1):
            lines.append(f"{i}. {item}")

    lines.extend([
        "",
        "↩️ <i>Ответьте на это сообщение — прикрепите фото/видео или напишите ответы на вопросы.</i>",
    ])

    return "\n".join(lines)


# ── Задача 1: отправка уведомлений ───────────────────────────────────────────

@celery_app.task(name="app.workers.notification_tasks.notify_pending_posts")
def notify_pending_posts():
    asyncio.run(_notify())


async def _notify():
    now_utc = datetime.utcnow()
    now_msk = now_utc + MSK_OFFSET

    async with get_worker_db() as db:
        deadline = now_utc + timedelta(days=NOTIFY_DAYS_BEFORE)

        result = await db.execute(
            select(ContentSlot).where(
                and_(
                    ContentSlot.status == PlanStatus.needs_info,
                    ContentSlot.scheduled_at >= now_utc,
                    ContentSlot.scheduled_at <= deadline,
                )
            )
        )
        slots = [s for s in result.scalars().all() if s.needs_info_for]
        if not slots:
            return

        # Группируем по business_id → ищем TG-подключение
        by_business: dict[str, list[ContentSlot]] = {}
        for slot in slots:
            by_business.setdefault(str(slot.business_id), []).append(slot)

        async with aiohttp.ClientSession() as session:
            for business_id, biz_slots in by_business.items():
                conn_result = await db.execute(
                    select(PlatformConnection).where(
                        and_(
                            PlatformConnection.business_id == business_id,
                            PlatformConnection.platform == Platform.telegram,
                            PlatformConnection.is_active == True,
                            PlatformConnection.admin_chat_id.isnot(None),
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

                for slot in biz_slots:
                    # Не слать раньше 10:00 МСК за NOTIFY_DAYS_BEFORE до даты поста
                    slot_msk = slot.scheduled_at + MSK_OFFSET
                    first_notify = (slot_msk - timedelta(days=NOTIFY_DAYS_BEFORE)).replace(
                        hour=NOTIFY_HOUR_MSK, minute=0, second=0, microsecond=0
                    )
                    if now_msk < first_notify:
                        continue

                    # Не дублировать — проверяем последнее уведомление (< NOTIFY_INTERVAL_HOURS)
                    cutoff = now_utc - timedelta(hours=NOTIFY_INTERVAL_HOURS - 0.25)
                    recent = await db.execute(
                        select(SlotNotification).where(
                            and_(
                                SlotNotification.slot_id == slot.id,
                                SlotNotification.sent_at >= cutoff,
                            )
                        )
                    )
                    if recent.scalar_one_or_none():
                        continue

                    text = _build_slot_message(slot)
                    try:
                        resp = await session.post(
                            f"https://api.telegram.org/bot{bot_token}/sendMessage",
                            json={
                                "chat_id": connection.admin_chat_id,
                                "text": text[:4096],
                                "parse_mode": "HTML",
                            },
                        )
                        resp_data = await resp.json()
                        if resp_data.get("ok"):
                            msg_id = resp_data["result"]["message_id"]
                            notif = SlotNotification(
                                slot_id=slot.id,
                                connection_id=connection.id,
                                tg_message_id=msg_id,
                                admin_chat_id=connection.admin_chat_id,
                            )
                            db.add(notif)
                            log.info("Уведомление отправлено: slot=%s msg_id=%d", str(slot.id)[:8], msg_id)
                        else:
                            log.warning("TG sendMessage error: %s", resp_data)
                    except Exception as e:
                        log.error("Ошибка отправки уведомления: %s", e)

                await db.commit()


# ── Задача 2: приём ответов на уведомления ───────────────────────────────────

@celery_app.task(name="app.workers.notification_tasks.check_telegram_replies")
def check_telegram_replies():
    asyncio.run(_check_replies())


async def _check_replies():
    async with get_worker_db() as db:
        result = await db.execute(
            select(PlatformConnection).where(
                and_(
                    PlatformConnection.platform == Platform.telegram,
                    PlatformConnection.is_active == True,
                    PlatformConnection.admin_chat_id.isnot(None),
                )
            )
        )
        connections = result.scalars().all()
        if not connections:
            return

        from app.services.publishers import decrypt_token

        async with aiohttp.ClientSession() as session:
            for connection in connections:
                try:
                    bot_token = decrypt_token(connection.token_encrypted)
                except Exception:
                    continue

                offset = connection.tg_update_offset or 0
                try:
                    resp = await session.get(
                        f"https://api.telegram.org/bot{bot_token}/getUpdates",
                        params={"offset": offset, "timeout": 0, "limit": 100},
                    )
                    data = await resp.json()
                except Exception as e:
                    log.error("getUpdates error: %s", e)
                    continue

                if not data.get("ok"):
                    continue

                updates = data.get("result", [])
                if not updates:
                    continue

                new_offset = offset
                for update in updates:
                    update_id = update["update_id"]
                    new_offset = max(new_offset, update_id + 1)

                    message = update.get("message") or update.get("edited_message")
                    if not message:
                        continue

                    # Нас интересуют ТОЛЬКО ответы на наши уведомления
                    reply_to = message.get("reply_to_message")
                    if not reply_to:
                        continue

                    replied_msg_id = reply_to.get("message_id")
                    chat_id = str(message.get("chat", {}).get("id", ""))

                    notif_result = await db.execute(
                        select(SlotNotification).where(
                            and_(
                                SlotNotification.tg_message_id == replied_msg_id,
                                SlotNotification.admin_chat_id == chat_id,
                            )
                        )
                    )
                    notif = notif_result.scalar_one_or_none()
                    if not notif:
                        continue

                    # Загружаем слот
                    slot_result = await db.execute(
                        select(ContentSlot).where(ContentSlot.id == notif.slot_id)
                    )
                    slot = slot_result.scalar_one_or_none()
                    if not slot or slot.status not in [
                        PlanStatus.needs_info, PlanStatus.planned, PlanStatus.idea_ready
                    ]:
                        continue

                    await _process_reply(session, bot_token, message, slot, db)
                    # Удаляем запись уведомления — повторный ответ не вызовет двойную обработку
                    await db.execute(
                        delete(SlotNotification).where(SlotNotification.slot_id == notif.slot_id)
                    )

                # Сохраняем новый offset
                connection.tg_update_offset = new_offset
                await db.commit()


async def _process_reply(
    session: aiohttp.ClientSession,
    bot_token: str,
    message: dict,
    slot: ContentSlot,
    db,
) -> None:
    """Обрабатывает ответное сообщение: сохраняет фото/видео и/или генерирует текст."""
    chat_id = str(message.get("chat", {}).get("id", ""))
    user_text = (message.get("text") or message.get("caption") or "").strip()
    photos = message.get("photo", [])
    video = message.get("video")
    document = message.get("document")

    updated = False
    confirm_parts: list[str] = []

    # ── Сохраняем фото ────────────────────────────────────────────────────────
    if photos:
        # Telegram присылает несколько размеров — берём наибольший
        largest = max(photos, key=lambda p: p.get("file_size", 0))
        b64 = await _download_file_b64(session, bot_token, largest["file_id"])
        if b64:
            slot.image_base64 = b64
            slot.image_url = None
            updated = True
            confirm_parts.append("🖼 Фото прикреплено к посту.")
    elif document and document.get("mime_type", "").startswith("image/"):
        b64 = await _download_file_b64(session, bot_token, document["file_id"])
        if b64:
            slot.image_base64 = b64
            slot.image_url = None
            updated = True
            confirm_parts.append("🖼 Изображение прикреплено к посту.")
    elif video:
        # Для видео сохраняем превью-обложку (thumbnail), если есть
        thumb = video.get("thumbnail") or video.get("thumb")
        if thumb:
            b64 = await _download_file_b64(session, bot_token, thumb["file_id"])
            if b64:
                slot.image_base64 = b64
                updated = True
        confirm_parts.append("🎬 Видео получено (обложка прикреплена).")
        updated = True

    # ── Генерируем/обновляем текст поста ────────────────────────────────────
    if user_text:
        questions = slot.needs_info_for or []
        text_questions = [q for q in questions if not _is_media_question(q)]

        # Формируем answers: каждый текстовый вопрос получает полный текст ответа
        if text_questions:
            answers = [{"question": q, "answer": user_text} for q in text_questions]
        else:
            answers = [{"question": "Информация от владельца бизнеса", "answer": user_text}]

        try:
            biz_result = await db.execute(
                select(Business).where(Business.id == slot.business_id)
            )
            business = biz_result.scalar_one_or_none()
            if business:
                from app.workers.content_tasks import _generate_post_text_with_info, _generate_image_prompt
                post_data = await _generate_post_text_with_info(slot, business.profile, answers)
                slot.post_text = post_data["text"]
                slot.hashtags = post_data.get("hashtags", [])
                if not slot.image_prompt:
                    slot.image_prompt = await _generate_image_prompt(slot, business.profile)
                updated = True
                confirm_parts.append("✍️ Текст поста сгенерирован.")
        except Exception as e:
            log.error("Ошибка генерации текста из TG-ответа: %s", e)
            confirm_parts.append("⚠️ Не удалось сгенерировать текст — проверьте карточку поста.")

    if not updated:
        return

    # Снимаем вопросы: если фото не пришло — оставляем медиа-вопросы
    questions = slot.needs_info_for or []
    has_media_attachment = bool(photos or video or document)
    if has_media_attachment:
        slot.needs_info_for = None
    else:
        remaining = [q for q in questions if _is_media_question(q)]
        slot.needs_info_for = remaining if remaining else None

    # Переводим в согласование если пост полностью готов
    if slot.post_text and slot.image_base64:
        slot.status = PlanStatus.pending_approval

    await db.commit()

    # Отправляем подтверждение в чат
    confirm_lines = ["✅ <b>Информация получена!</b>", ""] + confirm_parts + [
        "",
        "Откройте контент-план для финального согласования.",
    ]
    try:
        await session.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": "\n".join(confirm_lines),
                "parse_mode": "HTML",
            },
        )
    except Exception as e:
        log.error("Ошибка отправки подтверждения: %s", e)


async def _download_file_b64(
    session: aiohttp.ClientSession, bot_token: str, file_id: str
) -> str | None:
    """Скачивает файл из Telegram по file_id и возвращает base64."""
    try:
        resp = await session.get(
            f"https://api.telegram.org/bot{bot_token}/getFile",
            params={"file_id": file_id},
        )
        data = await resp.json()
        if not data.get("ok"):
            return None
        file_path = data["result"]["file_path"]

        dl = await session.get(
            f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
        )
        content = await dl.read()
        return base64.b64encode(content).decode()
    except Exception as e:
        log.error("Ошибка скачивания файла TG: %s", e)
        return None
