from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import uuid

from app.database import get_db
from app.models.models import User, Business, PlatformConnection
from app.api.auth import get_current_user
from app.services.publishers import encrypt_token

router = APIRouter()


class ConnectPlatformRequest(BaseModel):
    business_id: str
    platform: str  # telegram / vk / ok
    token: str
    page_id: str
    page_name: str


@router.post("/connect")
async def connect_platform(
    data: ConnectPlatformRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Проверяем что бизнес принадлежит пользователю
    result = await db.execute(
        select(Business).where(
            Business.id == data.business_id,
            Business.user_id == current_user.id
        )
    )
    business = result.scalar_one_or_none()
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Проверяем нет ли уже такого подключения
    existing = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == data.business_id,
            PlatformConnection.platform == data.platform
        )
    )
    connection = existing.scalar_one_or_none()

    encrypted = encrypt_token(data.token)

    if connection:
        # Обновляем существующее
        connection.token_encrypted = encrypted
        connection.external_page_id = data.page_id
        connection.page_name = data.page_name
        connection.is_active = True
    else:
        # Создаём новое
        connection = PlatformConnection(
            id=uuid.uuid4(),
            business_id=uuid.UUID(data.business_id),
            platform=data.platform,
            token_encrypted=encrypted,
            external_page_id=data.page_id,
            page_name=data.page_name,
            is_active=True
        )
        db.add(connection)

    await db.commit()
    return {"status": "connected", "platform": data.platform, "page": data.page_name}


@router.get("/list/{business_id}")
async def list_connections(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id
        )
    )
    connections = result.scalars().all()
    return [
        {
            "platform": c.platform,
            "page_name": c.page_name,
            "is_active": c.is_active
        }
        for c in connections
    ]


@router.post("/test-post/{business_id}")
async def test_post(
    business_id: str,
    body: dict,  # {"platform": "telegram", "text": "Тест!"}
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отправляет тестовый пост прямо сейчас"""
    import aiohttp
    from app.services.publishers import decrypt_token

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.platform == body["platform"],
            PlatformConnection.is_active == True
        )
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=404, detail="Platform not connected")

    token = decrypt_token(connection.token_encrypted)
    text = body.get("text", "Тест от SMM Platform 🚀")

    if body["platform"] == "telegram":
        async with aiohttp.ClientSession() as session:
            resp = await session.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": connection.external_page_id, "text": text}
            )
            result = await resp.json()
        if not result.get("ok"):
            raise HTTPException(status_code=400, detail=f"TG error: {result}")
        return {"status": "sent", "message_id": result["result"]["message_id"]}

    raise HTTPException(status_code=400, detail="Platform not supported yet")