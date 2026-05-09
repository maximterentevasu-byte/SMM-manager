import uuid
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, JSON, DateTime, ForeignKey, Enum, Boolean, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PlanStatus(str, enum.Enum):
    planned = "planned"           # слот создан, идеи нет
    idea_ready = "idea_ready"     # идея есть, текст не написан
    content_ready = "content_ready"  # текст + картинка готовы
    published = "published"       # опубликован
    failed = "failed"             # ошибка


class Platform(str, enum.Enum):
    vk = "vk"
    telegram = "telegram"
    ok = "ok"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    businesses: Mapped[list["Business"]] = relationship(back_populates="user")


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))

    # Профиль бизнеса — весь JSON из анкеты
    profile: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Контент-стратегия — генерирует AI
    strategy: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="businesses")
    platform_connections: Mapped[list["PlatformConnection"]] = relationship(back_populates="business")
    content_slots: Mapped[list["ContentSlot"]] = relationship(back_populates="business")


class PlatformConnection(Base):
    """Подключённые соцсети пользователя"""
    __tablename__ = "platform_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform))

    # Токен хранится зашифрованным (Fernet)
    token_encrypted: Mapped[str] = mapped_column(Text)
    external_page_id: Mapped[str] = mapped_column(String(255))  # ID группы VK или TG-канала
    page_name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    business: Mapped["Business"] = relationship(back_populates="platform_connections")


class ContentSlot(Base):
    """Один запланированный пост"""
    __tablename__ = "content_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    rubric: Mapped[dict] = mapped_column(JSON)  # рубрика из стратегии

    # Идея поста (генерируется первой)
    idea: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Готовый контент
    post_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hashtags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    image_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Публикация
    status: Mapped[PlanStatus] = mapped_column(Enum(PlanStatus), default=PlanStatus.planned)
    external_post_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Статистика (собирается через 24-48ч после публикации)
    reach: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    likes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    comments: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    shares: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    er: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stats_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="content_slots")
