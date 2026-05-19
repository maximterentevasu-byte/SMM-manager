from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel
from app.database import get_db
from app.models.models import User, Business
from app.api.auth import get_current_user

router = APIRouter()


class RefineStrategyRequest(BaseModel):
    message: str


class UpdatePostsPerWeekRequest(BaseModel):
    platform: str
    posts_per_week: int


class PostingScheduleRequest(BaseModel):
    required_days: list[str]    # ["mon","tue","wed","thu","fri","sat","sun"]
    required_times: list[str]   # ["09:00","18:00"]
    ai_experiment: bool         # разрешить ИИ экспериментировать со слотами


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


@router.patch("/{business_id}/posts-per-week")
async def update_posts_per_week(
    business_id: str,
    body: UpdatePostsPerWeekRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business or not business.strategy:
        raise HTTPException(404, "Бизнес или стратегия не найдены")
    posts = max(1, min(14, body.posts_per_week))
    business.strategy = [
        {**ps, "posts_per_week": posts} if ps.get("platform") == body.platform else ps
        for ps in business.strategy
    ]
    flag_modified(business, "strategy")
    await db.commit()
    return {"status": "updated", "platform": body.platform, "posts_per_week": posts}


@router.patch("/{business_id}/posting-schedule")
async def update_posting_schedule(
    business_id: str,
    body: PostingScheduleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Не найдено")
    profile = dict(business.profile or {})
    profile["posting_schedule"] = {
        "required_days": body.required_days,
        "required_times": body.required_times,
        "ai_experiment": body.ai_experiment,
    }
    business.profile = profile
    flag_modified(business, "profile")
    await db.commit()
    return {"status": "updated"}


@router.get("/{business_id}/profile")
async def get_profile(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Не найдено")
    return {"profile": business.profile, "name": business.name}


@router.post("/{business_id}/refine-strategy")
async def refine_strategy_endpoint(
    business_id: str,
    body: RefineStrategyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Не найдено")
    if not business.strategy:
        raise HTTPException(400, "Стратегия не сгенерирована")

    from app.agents.strategy_agent import refine_strategy
    import json
    try:
        new_strategy = await refine_strategy(business.strategy, body.message, business.profile or {})
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(500, "Модель вернула некорректный ответ, попробуйте переформулировать запрос")

    # Защита: пустой или невалидный ответ — возвращаем оригинал без сохранения
    if not new_strategy or not isinstance(new_strategy, list):
        return {"strategy": business.strategy, "status": "unchanged"}

    # Защита: если модель пропустила платформы — восстанавливаем из оригинальной стратегии
    new_platforms = {ps.get("platform") for ps in new_strategy}
    for original_ps in business.strategy:
        if original_ps.get("platform") not in new_platforms:
            new_strategy.append(original_ps)

    # Сохраняем posts_per_week из предыдущей версии (чтобы не сбрасывать пользовательские настройки)
    ppw_map = {ps.get("platform"): ps.get("posts_per_week") for ps in business.strategy if ps.get("posts_per_week")}
    for ps in new_strategy:
        if ps.get("platform") in ppw_map and not ps.get("posts_per_week"):
            ps["posts_per_week"] = ppw_map[ps["platform"]]

    business.strategy = new_strategy
    flag_modified(business, "strategy")
    await db.commit()
    return {"strategy": new_strategy, "status": "updated"}


@router.post("/{business_id}/strategy-chat")
async def strategy_chat_endpoint(
    business_id: str,
    body: RefineStrategyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == business_id, Business.user_id == current_user.id)
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(404, "Не найдено")

    from app.agents.strategy_agent import strategy_chat
    chat_result = await strategy_chat(body.message, business.strategy, business.profile or {})
    return chat_result


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
