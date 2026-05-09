from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.models import User, Business
from app.api.auth import get_current_user

router = APIRouter()


@router.get("/")
async def get_my_businesses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.user_id == current_user.id)
    )
    businesses = result.scalars().all()
    return [
        {
            "id": str(b.id),
            "name": b.name,
            "onboarding_done": b.onboarding_done,
            "has_strategy": b.strategy is not None,
        }
        for b in businesses
    ]


@router.get("/{business_id}/strategy")
async def get_strategy(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Не найдено")

    return {
        "strategy": business.strategy,
        "ready": business.strategy is not None
    }


@router.post("/{business_id}/generate-strategy")
async def trigger_strategy(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from app.workers.strategy_tasks import generate_strategy_task

    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Не найдено")

    generate_strategy_task.delay(business_id)
    return {"status": "started"}
