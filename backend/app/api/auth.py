import uuid
import random
import string
import logging
from datetime import datetime, timedelta

log = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.models import User, Business, EmailVerification
from app.config import settings

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7
_COOKIE_NAME = "auth_token"


def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.SECRET_KEY,
        algorithm=ALGORITHM
    )


def generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def _set_auth_cookie(response: Response, token: str) -> None:
    is_prod = bool(settings.DOMAIN)
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=_COOKIE_NAME, path="/")


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    # httpOnly cookie имеет приоритет; Authorization header — запасной путь
    # (для существующих сессий и API-клиентов)
    token = request.cookies.get(_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_verified: bool
    has_business: bool = False


async def _send_code(db: AsyncSession, email: str, purpose: str):
    """Удаляет старые коды нужного типа и создаёт новый, отправляет на почту."""
    await db.execute(
        delete(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.purpose == purpose,
        )
    )
    code = generate_code()
    db.add(EmailVerification(
        id=uuid.uuid4(),
        email=email,
        code=code,
        purpose=purpose,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    ))
    await db.commit()
    from app.services.email_service import send_verification_code, send_password_reset_code
    if purpose == "reset":
        send_password_reset_code(email, code)
    else:
        send_verification_code(email, code)
    return code


async def _check_code(db: AsyncSession, email: str, code: str, purpose: str) -> EmailVerification:
    result = await db.execute(
        select(EmailVerification).where(
            EmailVerification.email == email,
            EmailVerification.purpose == purpose,
            EmailVerification.is_used == False,
        ).order_by(EmailVerification.created_at.desc())
    )
    verification = result.scalars().first()
    if not verification:
        raise HTTPException(400, "Код не найден. Запросите новый.")
    if verification.expires_at < datetime.utcnow():
        raise HTTPException(400, "Код устарел. Запросите новый.")
    if verification.code != code:
        raise HTTPException(400, "Неверный код. Проверьте письмо.")
    return verification


@router.post("/register")
@limiter.limit("5/hour")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalars().first()

    if existing and existing.is_verified:
        raise HTTPException(400, "Email уже зарегистрирован. Войдите в аккаунт.")

    if len(data.password) < 8:
        raise HTTPException(400, "Пароль должен быть не менее 8 символов")

    if existing and not existing.is_verified:
        # Повторная регистрация незаверифицированного: обновляем пароль и шлём новый код
        existing.hashed_password = pwd_context.hash(data.password)
        await db.commit()
        await _send_code(db, data.email, "register")
        return {"status": "code_sent", "email": data.email}

    user = User(
        id=uuid.uuid4(),
        email=data.email,
        hashed_password=pwd_context.hash(data.password),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.commit()

    await _send_code(db, data.email, "register")
    log.info("[REGISTER] New user registered, code sent")
    return {"status": "code_sent", "email": data.email}


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_email(request: Request, response: Response, data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    verification = await _check_code(db, data.email, data.code, "register")

    user_result = await db.execute(select(User).where(User.email == data.email))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(404, "Пользователь не найден.")

    user.is_verified = True
    verification.is_used = True
    await db.commit()

    token = create_token(str(user.id))
    _set_auth_cookie(response, token)
    return {
        "access_token": token,
        "is_verified": True,
        "has_business": False,
    }


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalars().first()

    if not user or not pwd_context.verify(form.password, user.hashed_password):
        raise HTTPException(401, "Неверный email или пароль")

    if not user.is_verified:
        raise HTTPException(403, "Email не подтверждён. Проверьте почту или зарегистрируйтесь снова.")

    biz_result = await db.execute(
        select(Business).where(Business.user_id == user.id)
    )
    has_business = biz_result.scalars().first() is not None

    token = create_token(str(user.id))
    _set_auth_cookie(response, token)
    return {
        "access_token": token,
        "is_verified": True,
        "has_business": has_business,
    }


@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalars().first()
    # Не раскрываем существование аккаунта — всегда отвечаем одинаково
    if user and user.is_verified:
        await _send_code(db, data.email, "reset")
    return {"status": "sent"}


@router.post("/reset-password")
@limiter.limit("5/hour")
async def reset_password(request: Request, data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if len(data.new_password) < 8:
        raise HTTPException(400, "Пароль должен быть не менее 8 символов")

    verification = await _check_code(db, data.email, data.code, "reset")

    user_result = await db.execute(select(User).where(User.email == data.email))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(404, "Пользователь не найден.")

    user.hashed_password = pwd_context.hash(data.new_password)
    verification.is_used = True
    await db.commit()

    return {"status": "password_updated"}


@router.post("/logout")
async def logout(response: Response):
    _clear_auth_cookie(response)
    return {"status": "logged_out"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_verified": current_user.is_verified,
        "tour_completed": getattr(current_user, "tour_completed", False),
    }


@router.post("/tour-complete")
async def tour_complete(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.tour_completed = True
    await db.commit()
    return {"ok": True}
