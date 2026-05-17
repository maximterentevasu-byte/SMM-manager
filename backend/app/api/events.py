from datetime import datetime
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_current_user
from app.models.models import Event, Business, ContentSlot, PlatformConnection, Platform, PlanStatus

router = APIRouter()


class EventCreate(BaseModel):
    name: str
    description: Optional[str] = None
    start_date: str   # ISO date "YYYY-MM-DD"
    end_date: str
    has_start_notification: bool = False
    start_post_datetime: Optional[str] = None   # ISO datetime
    start_platforms: Optional[list[str]] = None
    has_end_notification: bool = False
    end_post_datetime: Optional[str] = None
    end_platforms: Optional[list[str]] = None
    has_intermediate: bool = False
    intermediate_count: Optional[int] = None
    intermediate_datetimes: Optional[list[str]] = None
    intermediate_platforms: Optional[list[str]] = None


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _resolve_platforms(
    requested: Optional[list[str]],
    all_active: list[Platform],
) -> list[Platform]:
    """Возвращает платформы из requested (если заданы), иначе все активные."""
    if requested:
        valid = {p.value for p in Platform}
        return [Platform(p) for p in requested if p in valid]
    return all_active or [Platform.vk]


async def _create_event_slots(
    db: AsyncSession,
    event: Event,
    business_id: uuid.UUID,
    start_platforms: Optional[list[str]] = None,
    end_platforms: Optional[list[str]] = None,
    intermediate_platforms: Optional[list[str]] = None,
) -> None:
    """Создаёт ContentSlot для каждого уведомления события."""
    conns_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.is_active == True,
        )
    )
    connections = conns_result.scalars().all()
    all_active = list({c.platform for c in connections})

    def _make_slot(post_type: str, scheduled_at: datetime, platform: Platform) -> ContentSlot:
        label = {"start": "Старт", "end": "Итог"}.get(post_type) or post_type.replace("_", " ").capitalize()
        return ContentSlot(
            business_id=business_id,
            platform=platform,
            scheduled_at=scheduled_at,
            rubric={"name": f"{label}: {event.name}"},
            idea={"idea": f"{label} мероприятия «{event.name}»"},
            status=PlanStatus.needs_info,
            needs_info_for=[
                "Фото или видео с мероприятия",
                "Ключевые тезисы для поста",
            ],
            event_id=event.id,
            event_post_type=post_type,
        )

    slots: list[ContentSlot] = []

    if event.has_start_notification and event.start_post_datetime:
        for p in _resolve_platforms(start_platforms, all_active):
            slots.append(_make_slot("start", event.start_post_datetime, p))

    if event.has_end_notification and event.end_post_datetime:
        for p in _resolve_platforms(end_platforms, all_active):
            slots.append(_make_slot("end", event.end_post_datetime, p))

    if event.has_intermediate and event.intermediate_datetimes:
        inter_plats = _resolve_platforms(intermediate_platforms, all_active)
        for i, dt_str in enumerate(event.intermediate_datetimes, 1):
            dt = _parse_dt(dt_str)
            if dt:
                for p in inter_plats:
                    slots.append(_make_slot(f"intermediate_{i}", dt, p))

    for s in slots:
        db.add(s)


@router.post("/{business_id}")
async def create_event(
    business_id: str,
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    biz_result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    biz = biz_result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")

    start_date = _parse_dt(data.start_date) or datetime.utcnow()
    end_date = _parse_dt(data.end_date) or start_date

    event = Event(
        business_id=uuid.UUID(business_id),
        name=data.name,
        description=data.description,
        start_date=start_date,
        end_date=end_date,
        has_start_notification=data.has_start_notification,
        start_post_datetime=_parse_dt(data.start_post_datetime),
        has_end_notification=data.has_end_notification,
        end_post_datetime=_parse_dt(data.end_post_datetime),
        has_intermediate=data.has_intermediate,
        intermediate_count=data.intermediate_count,
        intermediate_datetimes=data.intermediate_datetimes,
        status="active",
    )
    db.add(event)
    await db.flush()  # получаем event.id до создания слотов

    await _create_event_slots(
        db, event, uuid.UUID(business_id),
        start_platforms=data.start_platforms,
        end_platforms=data.end_platforms,
        intermediate_platforms=data.intermediate_platforms,
    )
    await db.commit()
    await db.refresh(event)

    return {
        "id": str(event.id),
        "name": event.name,
        "start_date": event.start_date.isoformat(),
        "end_date": event.end_date.isoformat(),
        "status": event.status,
    }


@router.get("/{business_id}")
async def list_events(
    business_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    biz_result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    if not biz_result.scalar_one_or_none():
        raise HTTPException(404, "Business not found")

    result = await db.execute(
        select(Event).where(
            Event.business_id == business_id,
            Event.status != "cancelled",
        ).order_by(Event.start_date)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "name": e.name,
            "description": e.description,
            "start_date": e.start_date.isoformat(),
            "end_date": e.end_date.isoformat(),
            "status": e.status,
        }
        for e in events
    ]


class EventUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None


@router.get("/{business_id}/{event_id}")
async def get_event(
    business_id: str,
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Event).where(Event.id == event_id, Event.business_id == business_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404)
    return {
        "id": str(event.id),
        "name": event.name,
        "description": event.description,
        "start_date": event.start_date.isoformat(),
        "end_date": event.end_date.isoformat(),
        "status": event.status,
        "has_start_notification": event.has_start_notification,
        "start_post_datetime": event.start_post_datetime.isoformat() if event.start_post_datetime else None,
        "has_end_notification": event.has_end_notification,
        "end_post_datetime": event.end_post_datetime.isoformat() if event.end_post_datetime else None,
        "has_intermediate": event.has_intermediate,
        "intermediate_count": event.intermediate_count,
        "intermediate_datetimes": event.intermediate_datetimes,
    }


@router.patch("/{event_id}/update")
async def update_event(
    event_id: str,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404)
    if data.name is not None:
        event.name = data.name
    if data.description is not None:
        event.description = data.description
    if data.start_date is not None:
        event.start_date = _parse_dt(data.start_date) or event.start_date
    if data.end_date is not None:
        event.end_date = _parse_dt(data.end_date) or event.end_date
    await db.commit()
    return {"status": "updated"}


@router.delete("/{event_id}")
async def delete_event(
    event_id: str,
    delete_slots: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404)
    if delete_slots:
        from sqlalchemy import delete as sql_delete
        from app.models.models import ContentSlot
        await db.execute(sql_delete(ContentSlot).where(ContentSlot.event_id == event.id))
    await db.delete(event)
    await db.commit()
    return {"status": "deleted"}


@router.patch("/{event_id}/complete")
async def complete_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404)
    event.status = "completed"
    await db.commit()
    return {"status": "completed"}


@router.patch("/{event_id}/cancel")
async def cancel_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(404)
    event.status = "cancelled"
    await db.commit()
    return {"status": "cancelled"}
