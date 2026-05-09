from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.models import User, Business, ContentSlot
from app.api.auth import get_current_user

router = APIRouter()


class GeneratePlanRequest(BaseModel):
    year: int
    month: int  # 1-12


@router.post("/{business_id}/generate-plan")
async def generate_plan(
    business_id: str,
    data: GeneratePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.workers.content_tasks import generate_content_plan_task

    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Бизнес не найден")
    if not business.strategy:
        raise HTTPException(400, "Сначала нужно сгенерировать стратегию")

    generate_content_plan_task.delay(business_id, data.year, data.month)
    return {"status": "started", "message": "Контент-план генерируется"}


@router.get("/{business_id}/plan")
async def get_plan(
    business_id: str,
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Получаем слоты за указанный месяц
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)

    result = await db.execute(
        select(ContentSlot).where(
            and_(
                ContentSlot.business_id == business_id,
                ContentSlot.scheduled_at >= start,
                ContentSlot.scheduled_at < end,
            )
        ).order_by(ContentSlot.scheduled_at)
    )
    slots = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "platform": s.platform,
            "scheduled_at": s.scheduled_at.isoformat(),
            "rubric_name": s.rubric.get("name") if s.rubric else None,
            "idea": s.idea,
            "post_text": s.post_text,
            "image_url": s.image_url,
            "status": s.status,
        }
        for s in slots
    ]


@router.post("/slots/{slot_id}/regenerate")
async def regenerate_slot(
    slot_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.workers.content_tasks import generate_post_content_task

    generate_post_content_task.delay(slot_id)
    return {"status": "regenerating"}
