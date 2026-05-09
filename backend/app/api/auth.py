from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid, random, string

from app.database import get_db
from app.models.models import User, EmailVerification
from app.config import settings
from app.services.email_service import send_verification_code

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=12, truncate_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7


def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, settings.SECRET_KEY, algorithm=ALGORITHM)


def generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Schemas ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str

class ResendCodeRequest(BaseModel):
    email: EmailStr

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_verified: bool
    has_business: bool = False


# ── Register ─────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    # Проверяем существующего пользователя
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalar_one_or_none()

    if existing:
        if existing.is_verified:
            raise HTTPException(400, "Email уже зарегистрирован")
        # Если не верифицирован — переотправляем код
        user = existing
    else:
        if len(data.password) < 8:
            raise HTTPException(400, "Пароль должен быть не менее 8 символов")

        user = User(
            id=uuid.uuid4(),
            email=data.email,
            hashed_password=pwd_context.hash(data.password),
            is_active=True,
            is_verified=False,
        )
        db.add(user)
        await db.commit()

    # Создаём код верификации
    code = generate_code()
    verification = EmailVerification(
        id=uuid.uuid4(),
        email=data.email,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(verification)
    await db.commit()

    # Отправляем письмо
    send_verification_code(data.email, code)

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": False,
        "has_business": False,
    }


# ── Verify email ─────────────────────────────────────────

@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    # Находим свежий неиспользованный код
    result = await db.execute(
        select(EmailVerification).where(
            EmailVerification.email == data.email,
            EmailVerification.code == data.code,
            EmailVerification.is_used == False,
            EmailVerification.expires_at > datetime.utcnow(),
        ).order_by(EmailVerification.created_at.desc())
    )
    verification = result.scalar_one_or_none()

    if not verification:
        raise HTTPException(400, "Неверный или истёкший код")

    # Помечаем код использованным
    verification.is_used = True

    # Верифицируем пользователя
    user_result = await db.execute(select(User).where(User.email == data.email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    user.is_verified = True
    await db.commit()

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": True,
        "has_business": False,
    }


# ── Resend code ───────────────────────────────────────────

@router.post("/resend-code")
async def resend_code(data: ResendCodeRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    if user.is_verified:
        raise HTTPException(400, "Email уже подтверждён")

    code = generate_code()
    verification = EmailVerification(
        id=uuid.uuid4(),
        email=data.email,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(verification)
    await db.commit()

    send_verification_code(data.email, code)
    return {"status": "sent"}


# ── Login ─────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    if not user or not pwd_context.verify(form.password, user.hashed_password):
        raise HTTPException(401, "Неверный email или пароль")

    if not user.is_verified:
        # Переотправляем код если не верифицирован
        code = generate_code()
        verification = EmailVerification(
            id=uuid.uuid4(),
            email=user.email,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
        db.add(verification)
        await db.commit()
        send_verification_code(user.email, code)

    from app.models.models import Business
    biz_result = await db.execute(select(Business).where(Business.user_id == user.id))
    has_business = biz_result.scalar_one_or_none() is not None

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": user.is_verified,
        "has_business": has_business,
    }


# ── Me ────────────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_verified": current_user.is_verified,
    }