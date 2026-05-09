from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import String, Text, JSON, DateTime, ForeignKey, Enum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import enum


class PlanStatus(str, enum.Enum):
    planned = "planned"
    idea_ready = "idea_ready"
    content_ready = "content_ready"
    published = "published"
    failed = "failed"


class Platform(str, enum.Enum):
    vk = "vk"
    telegram = "telegram"
    ok = "ok"


class SubscriptionPlan(str, enum.Enum):
    demo = "demo"
    start = "start"
    business = "business"
    pro = "pro"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    businesses: Mapped[list["Business"]] = relationship(back_populates="user")
    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="user")


class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code: Mapped[str] = mapped_column(String(6))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(255))
    profile: Mapped[dict] = mapped_column(JSON)
    strategy: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="businesses")
    platform_connections: Mapped[list["PlatformConnection"]] = relationship(back_populates="business")
    content_slots: Mapped[list["ContentSlot"]] = relationship(back_populates="business")


class PlatformConnection(Base):
    __tablename__ = "platform_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform))
    token_encrypted: Mapped[str] = mapped_column(Text)
    external_page_id: Mapped[str] = mapped_column(String(255))
    page_name: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    business: Mapped["Business"] = relationship(back_populates="platform_connections")


class ContentSlot(Base):
    __tablename__ = "content_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"))
    platform: Mapped[Platform] = mapped_column(Enum(Platform))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    rubric: Mapped[dict] = mapped_column(JSON)

    idea: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    post_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hashtags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    image_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[PlanStatus] = mapped_column(Enum(PlanStatus), default=PlanStatus.planned)
    external_post_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    reach: Mapped[Optional[int]] = mapped_column(nullable=True)
    likes: Mapped[Optional[int]] = mapped_column(nullable=True)
    comments: Mapped[Optional[int]] = mapped_column(nullable=True)
    shares: Mapped[Optional[int]] = mapped_column(nullable=True)
    er: Mapped[Optional[float]] = mapped_column(nullable=True)
    stats_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="content_slots")


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("users.id"))
    plan: Mapped[SubscriptionPlan] = mapped_column(Enum(SubscriptionPlan))
    status: Mapped[str] = mapped_column(String(50))  # active / cancelled / past_due / trialing
    current_period_start: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    current_period_end: Mapped[datetime] = mapped_column(DateTime)
    yookassa_payment_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    yookassa_payment_method_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Лимиты по тарифу
    posts_limit: Mapped[int] = mapped_column(default=10)
    platforms_limit: Mapped[int] = mapped_column(default=1)

    user: Mapped["User"] = relationship(back_populates="subscriptions")