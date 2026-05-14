import aiohttp
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.models.models import User, Business, PlatformConnection
from app.api.auth import get_current_user
from app.services.publishers import encrypt_token, decrypt_token

router = APIRouter()


class ConnectPlatformRequest(BaseModel):
    business_id: str
    platform: str   # telegram / vk
    token: str
    page_id: str
    page_name: str = ""


@router.post("/connect")
async def connect_platform(
    data: ConnectPlatformRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Business).where(Business.id == data.business_id, Business.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Business not found")

    page_name = data.page_name

    # Верифицируем токен и получаем имя страницы автоматически
    if data.platform == "telegram":
        async with aiohttp.ClientSession() as session:
            resp = await session.get(
                f"https://api.telegram.org/bot{data.token}/getChat",
                params={"chat_id": data.page_id}
            )
            tg = await resp.json()
        if not tg.get("ok"):
            raise HTTPException(400, tg.get("description", "Неверный токен или chat_id"))
        chat = tg["result"]
        page_name = chat.get("title") or chat.get("username") or data.page_name

    elif data.platform == "vk":
        group_id_clean = data.page_id.lstrip("-")
        async with aiohttp.ClientSession() as session:
            resp = await session.get(
                "https://api.vk.com/method/groups.getById",
                params={"group_id": group_id_clean, "fields": "members_count",
                        "access_token": data.token, "v": "5.199"}
            )
            vk = await resp.json()

        if "error" in vk:
            # Fallback: проверяем токен через wall.get (работает с любым community token)
            async with aiohttp.ClientSession() as session:
                resp2 = await session.get(
                    "https://api.vk.com/method/wall.get",
                    params={"owner_id": f"-{group_id_clean}", "count": 1,
                            "access_token": data.token, "v": "5.199"}
                )
                vk2 = await resp2.json()
            if "error" in vk2:
                raise HTTPException(400, vk2["error"]["error_msg"])
            # Токен рабочий, имя берём из поля запроса
        else:
            resp_data = vk.get("response", {})
            # VK API 5.131- возвращает список, 5.194+ возвращает {"groups": [...]}
            groups = resp_data if isinstance(resp_data, list) else resp_data.get("groups", [])
            if groups:
                page_name = groups[0].get("name", data.page_name)

    else:
        raise HTTPException(400, f"Платформа {data.platform} не поддерживается")

    # Сохраняем или обновляем подключение
    existing = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == data.business_id,
            PlatformConnection.platform == data.platform
        )
    )
    connection = existing.scalar_one_or_none()
    encrypted = encrypt_token(data.token)

    if connection:
        connection.token_encrypted = encrypted
        connection.external_page_id = data.page_id
        connection.page_name = page_name
        connection.is_active = True
    else:
        connection = PlatformConnection(
            id=uuid.uuid4(),
            business_id=uuid.UUID(data.business_id),
            platform=data.platform,
            token_encrypted=encrypted,
            external_page_id=data.page_id,
            page_name=page_name,
            is_active=True,
        )
        db.add(connection)

    await db.commit()
    return {"status": "connected", "platform": data.platform, "page_name": page_name}


@router.get("/list/{business_id}")
async def list_connections(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlatformConnection).where(PlatformConnection.business_id == business_id)
    )
    return [
        {
            "platform": c.platform.value if hasattr(c.platform, "value") else c.platform,
            "page_name": c.page_name,
            "external_page_id": c.external_page_id,
            "is_active": c.is_active,
            "admin_chat_id": c.admin_chat_id,
        }
        for c in result.scalars().all()
    ]


class AdminChatRequest(BaseModel):
    admin_chat_id: str


@router.patch("/admin-chat/{business_id}")
async def set_admin_chat(
    business_id: str,
    body: AdminChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.platform == "telegram",
            PlatformConnection.is_active == True,
        )
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(404, "Telegram не подключён")

    # Verify chat_id is reachable with the bot token
    token = decrypt_token(connection.token_encrypted)
    async with aiohttp.ClientSession() as session:
        resp = await session.get(
            f"https://api.telegram.org/bot{token}/getChat",
            params={"chat_id": body.admin_chat_id}
        )
        tg = await resp.json()
    if not tg.get("ok"):
        raise HTTPException(400, f"Не удалось найти чат: {tg.get('description', 'Проверьте ID')}")

    connection.admin_chat_id = body.admin_chat_id
    await db.commit()

    chat = tg["result"]
    chat_name = chat.get("first_name") or chat.get("username") or body.admin_chat_id
    return {"status": "saved", "chat_name": chat_name}


@router.delete("/disconnect/{business_id}/{platform}")
async def disconnect_platform(
    business_id: str,
    platform: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.platform == platform
        )
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(404, "Подключение не найдено")
    await db.delete(connection)
    await db.commit()
    return {"status": "disconnected"}


@router.post("/test-post/{business_id}")
async def test_post(
    business_id: str,
    body: dict,  # {"platform": "telegram"|"vk", "text": "Тест!"}
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    platform = body.get("platform")
    text = body.get("text", "Тест от SMM Platform 🚀")

    conn_result = await db.execute(
        select(PlatformConnection).where(
            PlatformConnection.business_id == business_id,
            PlatformConnection.platform == platform,
            PlatformConnection.is_active == True
        )
    )
    connection = conn_result.scalar_one_or_none()
    if not connection:
        raise HTTPException(404, "Платформа не подключена")

    token = decrypt_token(connection.token_encrypted)

    if platform == "telegram":
        async with aiohttp.ClientSession() as session:
            resp = await session.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": connection.external_page_id, "text": text}
            )
            result = await resp.json()
        if not result.get("ok"):
            raise HTTPException(400, f"Telegram: {result.get('description', 'Ошибка')}")
        return {"status": "sent", "message_id": result["result"]["message_id"]}

    if platform == "vk":
        group_id = connection.external_page_id.lstrip("-")
        async with aiohttp.ClientSession() as session:
            resp = await session.post(
                "https://api.vk.com/method/wall.post",
                params={
                    "owner_id": f"-{group_id}",
                    "message": text,
                    "access_token": token,
                    "v": "5.131",
                }
            )
            result = await resp.json()
        if "error" in result:
            raise HTTPException(400, f"VK: {result['error']['error_msg']}")
        return {"status": "sent", "post_id": result["response"]["post_id"]}

    raise HTTPException(400, "Платформа не поддерживается")
