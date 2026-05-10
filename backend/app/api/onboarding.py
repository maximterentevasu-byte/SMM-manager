import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models.models import User, Business
from app.api.auth import get_current_user
from app.services.onboarding_service import clarify_business_profile, parse_clarification_answer

router = APIRouter()


class BusinessProfileRequest(BaseModel):
    name: str
    niche: str
    usp: str
    price_segment: str
    geo: str
    audience_primary: str
    audience_pains: list[str]
    audience_objections: list[str]
    competitors: list[dict]
    platforms: list[str]
    platform_goals: dict
    brand_voice: str
    brand_voice_examples: list[str]
    visual_style: str
    content_restrictions: list[str]
    logo_url: Optional[str] = None
    brand_colors: list[str] = []


@router.post("/save-profile/{business_id}")
async def save_profile(
    business_id: str,
    profile_data: BusinessProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    profile = profile_data.model_dump()
    business = None

    # Если business_id не "new" — ищем существующий
    if business_id != "new":
        try:
            result = await db.execute(
                select(Business).where(
                    Business.id == business_id,
                    Business.user_id == current_user.id
                )
            )
            business = result.scalar_one_or_none()
        except Exception:
            business = None

    if business:
        business.profile = profile
        business.name = profile_data.name
    else:
        business = Business(
            id=uuid.uuid4(),
            user_id=current_user.id,
            name=profile_data.name,
            profile=profile
        )
        db.add(business)

    await db.commit()
    return {"business_id": str(business.id), "status": "saved"}


@router.post("/clarify/{business_id}")
async def get_clarifying_questions(
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
        raise HTTPException(status_code=404, detail="Business not found")

    questions = await clarify_business_profile(business.profile)
    return {"questions": questions}


@router.post("/answer-clarification/{business_id}")
async def answer_clarification(
    business_id: str,
    body: dict,
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
        raise HTTPException(status_code=404, detail="Business not found")

    updated_profile = await parse_clarification_answer(
        body["question"], body["answer"], business.profile
    )
    business.profile = updated_profile
    await db.commit()
    return {"profile": updated_profile}