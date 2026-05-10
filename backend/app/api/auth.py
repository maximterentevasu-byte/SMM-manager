import uuid
import random
import string
import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.models import User, EmailVerification, Business
from app.config import settings
from app.services.email_service import send_verification_code

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7


def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "exp": expire},
        settings.SECRET_KEY,
        algorithm=ALGORITHM
    )


def generate_code() -> str:
    return "".join(random.choices(string.digits, k=6))


def send_email_in_thread(to: str, code: str):
    """Отправляет письмо в отдельном потоке с полным логированием"""
    try:
        print(f"[THREAD] Starting email send to {to}, code={code}")
        result = send_verification_code(to, code)
        print(f"[THREAD] Email send result: {result}")
    except Exception as e:
        print(f"[THREAD ERROR] {type(e).__name__}: {e}")


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

class ResendCodeRequest(BaseModel):
    email: EmailStr

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    is_verified: bool
    has_business: bool = False


@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalars().first()

    if existing:
        if existing.is_verified:
            raise HTTPException(400, "Email уже зарегистрирован")
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

    code = generate_code()
    verification = EmailVerification(
        id=uuid.uuid4(),
        email=data.email,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=15),
    )
    db.add(verification)
    await db.commit()

    print(f"[REGISTER] Code for {data.email}: {code}")

    t = threading.Thread(target=send_email_in_thread, args=(data.email, code), daemon=True)
    t.start()

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": False,
        "has_business": False,
    }


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(EmailVerification).where(
            EmailVerification.email == data.email,
            EmailVerification.code == data.code,
            EmailVerification.is_used == False,
            EmailVerification.expires_at > datetime.utcnow(),
        ).order_by(EmailVerification.created_at.desc())
    )
    verification = result.scalars().first()

    if not verification:
        raise HTTPException(400, "Неверный или истёкший код")

    verification.is_used = True

    user_result = await db.execute(select(User).where(User.email == data.email))
    user = user_result.scalars().first()
    if not user:
        raise HTTPException(404, "Пользователь не найден")

    user.is_verified = True
    await db.commit()

    biz_result = await db.execute(select(Business).where(Business.user_id == user.id))
    has_business = biz_result.scalars().first() is not None

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": True,
        "has_business": has_business,
    }


@router.post("/resend-code")
async def resend_code(data: ResendCodeRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalars().first()
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

    print(f"[RESEND] Code for {data.email}: {code}")

    t = threading.Thread(target=send_email_in_thread, args=(data.email, code), daemon=True)
    t.start()

    return {"status": "sent"}


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalars().first()

    if not user or not pwd_context.verify(form.password, user.hashed_password):
        raise HTTPException(401, "Неверный email или пароль")

    if not user.is_verified:
        code = generate_code()
        verification = EmailVerification(
            id=uuid.uuid4(),
            email=user.email,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=15),
        )
        db.add(verification)
        await db.commit()

        print(f"[LOGIN] Code for {user.email}: {code}")

        t = threading.Thread(target=send_email_in_thread, args=(user.email, code), daemon=True)
        t.start()

    biz_result = await db.execute(
        select(Business).where(Business.user_id == user.id)
    )
    has_business = biz_result.scalars().first() is not None

    return {
        "access_token": create_token(str(user.id)),
        "is_verified": user.is_verified,
        "has_business": has_business,
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "is_verified": current_user.is_verified,
    }