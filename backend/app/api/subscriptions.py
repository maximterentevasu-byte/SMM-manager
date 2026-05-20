from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime, timedelta
import uuid

from app.database import get_db
from app.models.models import User, Subscription, SubscriptionPlan
from app.api.auth import get_current_user
from app.config import settings

router = APIRouter()

PLAN_CONFIG = {
    "demo":     {"posts_limit": 10,  "platforms_limit": 1, "days": 7,   "price": 0},
    "start":    {"posts_limit": 12,  "platforms_limit": 1, "days": 30,  "price": 299000},
    "business": {"posts_limit": 30,  "platforms_limit": 3, "days": 30,  "price": 599000},
    "pro":      {"posts_limit": 9999,"platforms_limit": 10,"days": 30,  "price": 1199000},
}

PAID_PLANS_AVAILABLE = False  # Включить когда будет Юкасса


class ActivatePlanRequest(BaseModel):
    plan: str


@router.post("/activate")
async def activate_plan(
    body: ActivatePlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    plan = body.plan
    if plan not in PLAN_CONFIG:
        raise HTTPException(400, "Неизвестный тариф")

    if plan != "demo" and not PAID_PLANS_AVAILABLE:
        raise HTTPException(400, "Платные тарифы скоро будут доступны — следите за обновлениями!")

    config = PLAN_CONFIG[plan]

    # Если демо — активируем сразу бесплатно
    if plan == "demo":
        # Проверяем не было ли уже демо
        result = await db.execute(
            select(Subscription).where(
                Subscription.user_id == current_user.id,
                Subscription.plan == SubscriptionPlan.demo
            )
        )
        existing_demo = result.scalar_one_or_none()
        if existing_demo:
            raise HTTPException(400, "Демо-период уже использовался")

        sub = Subscription(
            id=uuid.uuid4(),
            user_id=current_user.id,
            plan=SubscriptionPlan.demo,
            status="trialing",
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=config["days"]),
            posts_limit=config["posts_limit"],
            platforms_limit=config["platforms_limit"],
        )
        db.add(sub)
        await db.commit()
        return {"status": "activated", "plan": plan, "expires_at": sub.current_period_end.isoformat()}

    # Для платных тарифов — создаём платёж в ЮКасса
    if not settings.YOOKASSA_SHOP_ID or not settings.YOOKASSA_SECRET_KEY:
        # Режим без ЮКасса — активируем напрямую (для тестирования)
        sub = Subscription(
            id=uuid.uuid4(),
            user_id=current_user.id,
            plan=SubscriptionPlan(plan),
            status="active",
            current_period_start=datetime.utcnow(),
            current_period_end=datetime.utcnow() + timedelta(days=config["days"]),
            posts_limit=config["posts_limit"],
            platforms_limit=config["platforms_limit"],
        )
        db.add(sub)
        await db.commit()
        return {"status": "activated", "plan": plan, "payment_url": None}

    # ЮКасса интеграция
    import httpx, json as json_lib
    payment_data = {
        "amount": {"value": f"{config['price'] / 100:.2f}", "currency": "RUB"},
        "confirmation": {
            "type": "redirect",
            "return_url": f"https://{settings.DOMAIN}/payment/success?plan={plan}" if settings.DOMAIN else f"http://localhost:3000/payment/success?plan={plan}"
        },
        "capture": True,
        "description": f"SMM Platform — тариф {plan.capitalize()}",
        "metadata": {"user_id": str(current_user.id), "plan": plan},
        "save_payment_method": True,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.yookassa.ru/v3/payments",
            json=payment_data,
            auth=(settings.YOOKASSA_SHOP_ID, settings.YOOKASSA_SECRET_KEY),
            headers={"Idempotence-Key": str(uuid.uuid4())},
        )

    if resp.status_code != 200:
        raise HTTPException(400, f"Ошибка создания платежа: {resp.text}")

    payment = resp.json()
    return {
        "status": "pending",
        "payment_id": payment["id"],
        "payment_url": payment["confirmation"]["confirmation_url"],
    }


@router.get("/my")
async def get_my_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Проверяем использовался ли демо
    demo_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.plan == SubscriptionPlan.demo
        )
    )
    demo_used = demo_result.scalar_one_or_none() is not None

    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status.in_(["active", "trialing"])
        ).order_by(Subscription.current_period_end.desc())
    )
    sub = result.scalar_one_or_none()

    if not sub:
        return {"has_subscription": False, "plan": None, "demo_used": demo_used}

    # Проверяем не истёк ли
    if sub.current_period_end < datetime.utcnow():
        sub.status = "expired"
        await db.commit()
        return {"has_subscription": False, "plan": None, "demo_used": demo_used}

    days_left = (sub.current_period_end - datetime.utcnow()).days

    return {
        "has_subscription": True,
        "plan": sub.plan.value,
        "status": sub.status,
        "expires_at": sub.current_period_end.isoformat(),
        "days_left": days_left,
        "posts_limit": sub.posts_limit,
        "platforms_limit": sub.platforms_limit,
        "demo_used": demo_used,
    }


@router.post("/webhook/yookassa")
async def yookassa_webhook(
    body: dict,
    db: AsyncSession = Depends(get_db)
):
    """Вебхук от ЮКасса — активирует подписку после успешной оплаты"""
    if body.get("event") != "payment.succeeded":
        return {"status": "ignored"}

    payment = body["object"]
    metadata = payment.get("metadata", {})
    user_id = metadata.get("user_id")
    plan = metadata.get("plan")

    if not user_id or not plan or plan not in PLAN_CONFIG:
        return {"status": "error"}

    config = PLAN_CONFIG[plan]

    # Деактивируем старую подписку
    old_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status == "active"
        )
    )
    old_sub = old_result.scalar_one_or_none()
    if old_sub:
        old_sub.status = "cancelled"

    # Создаём новую
    sub = Subscription(
        id=uuid.uuid4(),
        user_id=user_id,
        plan=SubscriptionPlan(plan),
        status="active",
        current_period_start=datetime.utcnow(),
        current_period_end=datetime.utcnow() + timedelta(days=30),
        yookassa_payment_id=payment["id"],
        yookassa_payment_method_id=payment.get("payment_method", {}).get("id"),
        posts_limit=config["posts_limit"],
        platforms_limit=config["platforms_limit"],
    )
    db.add(sub)
    await db.commit()

    return {"status": "ok"}