from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid

from app.database import get_db
from app.models.models import User, Business
from app.api.auth import get_current_user
from app.agents.onboarding_agent import clarify_business_profile

router = APIRouter()


class BusinessProfileRequest(BaseModel):
    name: str
    niche: str
    usp: str
    price_segment: str           # economy / middle / premium
    geo: str
    audience_primary: str
    audience_pains: list[str]
    audience_objections: list[str]
    competitors: list[dict]      # [{name, url, pros, cons}]
    platforms: list[str]         # ["vk", "telegram"]
    platform_goals: dict         # {"vk": "sales"}
    brand_voice: str
    brand_voice_examples: list[str]
    visual_style: str
    content_restrictions: list[str]
    logo_url: Optional[str] = None
    brand_colors: list[str] = []


@router.post("/save-profile")
async def save_profile(
    data: BusinessProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Сохраняет анкету бизнеса"""
    profile = data.model_dump()

    # Проверяем — есть ли уже бизнес у этого юзера
    result = await db.execute(
        select(Business).where(Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()

    if business:
        business.profile = profile
        business.name = data.name
    else:
        business = Business(
            id=uuid.uuid4(),
            user_id=current_user.id,
            name=data.name,
            profile=profile
        )
        db.add(business)

    await db.commit()
    await db.refresh(business)
    return {"business_id": str(business.id), "status": "saved"}


@router.post("/clarify/{business_id}")
async def get_clarifying_questions(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """AI анализирует анкету и возвращает уточняющие вопросы"""
    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Бизнес не найден")

    questions = await clarify_business_profile(business.profile)
    return {"questions": questions}


@router.post("/answer/{business_id}")
async def answer_clarification(
    business_id: str,
    body: dict,  # {question: str, answer: str}
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновляет профиль на основе ответа пользователя"""
    from app.agents.onboarding_agent import parse_clarification_answer

    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Бизнес не найден")

    updated = await parse_clarification_answer(
        body["question"], body["answer"], business.profile
    )
    business.profile = updated
    await db.commit()
    return {"profile": updated}


@router.post("/complete/{business_id}")
async def complete_onboarding(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Завершает онбординг и запускает генерацию стратегии"""
    from app.workers.strategy_tasks import generate_strategy_task

    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Бизнес не найден")

    business.onboarding_done = True
    await db.commit()

    # Запускаем генерацию стратегии в фоне
    generate_strategy_task.delay(business_id)

    return {"status": "onboarding_complete", "message": "Стратегия генерируется, займёт 30-60 секунд"}
