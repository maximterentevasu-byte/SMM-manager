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
    pending_approval = "pending_approval"  # AI сгенерил, ждёт согласования пользователем
    needs_info = "needs_info"              # согласован, но нужна доп. инфо от пользователя
    content_ready = "content_ready"        # полностью готов к публикации
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
    events: Mapped[list["Event"]] = relationship(back_populates="business")


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

    # TG Analytics MTProto credentials (хранятся per-connection, не в .env)
    tg_api_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tg_api_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    tg_session_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # VK Analytics user token (wall.get требует user token, не community token)
    vk_user_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Telegram chat ID администратора бизнеса (для уведомлений)
    admin_chat_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Offset для getUpdates (чтобы не перечитывать старые апдейты)
    tg_update_offset: Mapped[Optional[int]] = mapped_column(nullable=True)

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

    image_base64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    images: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)          # карусель (список base64)
    needs_info_for: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)  # список требуемых данных
    tg_approval_rejected: Mapped[bool] = mapped_column(Boolean, default=False)  # отклонено через TG → только через платформу
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID, ForeignKey("events.id", ondelete="SET NULL"), nullable=True)
    event_post_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 'start' | 'end' | 'intermediate_N'

    reach: Mapped[Optional[int]] = mapped_column(nullable=True)
    likes: Mapped[Optional[int]] = mapped_column(nullable=True)
    comments: Mapped[Optional[int]] = mapped_column(nullable=True)
    shares: Mapped[Optional[int]] = mapped_column(nullable=True)
    er: Mapped[Optional[float]] = mapped_column(nullable=True)
    stats_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="content_slots")
    event: Mapped[Optional["Event"]] = relationship(back_populates="content_slots")


class Event(Base):
    """Маркетинговое событие (акция, ивент) с автоматическими постами."""
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime)
    end_date: Mapped[datetime] = mapped_column(DateTime)

    has_start_notification: Mapped[bool] = mapped_column(Boolean, default=False)
    start_post_datetime: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    has_end_notification: Mapped[bool] = mapped_column(Boolean, default=False)
    end_post_datetime: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    has_intermediate: Mapped[bool] = mapped_column(Boolean, default=False)
    intermediate_count: Mapped[Optional[int]] = mapped_column(nullable=True)
    intermediate_datetimes: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    status: Mapped[str] = mapped_column(String(50), default="active")  # active | completed | cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    business: Mapped["Business"] = relationship(back_populates="events")
    content_slots: Mapped[list["ContentSlot"]] = relationship(back_populates="event")


class SlotNotification(Base):
    """Трекинг уведомлений о постах в Telegram: message_id → slot_id для обработки ответов."""
    __tablename__ = "slot_notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    slot_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("content_slots.id", ondelete="CASCADE"), index=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("platform_connections.id", ondelete="CASCADE"))
    tg_message_id: Mapped[int] = mapped_column()
    admin_chat_id: Mapped[str] = mapped_column(String(255))
    notification_type: Mapped[str] = mapped_column(String(50), default="needs_info")
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TGWeeklyStats(Base):
    __tablename__ = "analytics_tg_weekly"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"), index=True)
    channel_id: Mapped[str] = mapped_column(String(255))
    channel_name: Mapped[str] = mapped_column(String(255))
    week_start: Mapped[datetime] = mapped_column(DateTime, index=True)
    week_end: Mapped[datetime] = mapped_column(DateTime)
    stats: Mapped[dict] = mapped_column(JSON)    # агрегированные метрики
    posts: Mapped[list] = mapped_column(JSON)    # список постов недели
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VKWeeklyStats(Base):
    __tablename__ = "analytics_vk_weekly"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, default=uuid.uuid4)
    business_id: Mapped[uuid.UUID] = mapped_column(UUID, ForeignKey("businesses.id"), index=True)
    group_id: Mapped[str] = mapped_column(String(255))
    group_name: Mapped[str] = mapped_column(String(255))
    week_start: Mapped[datetime] = mapped_column(DateTime, index=True)
    week_end: Mapped[datetime] = mapped_column(DateTime)
    stats: Mapped[dict] = mapped_column(JSON)
    posts: Mapped[list] = mapped_column(JSON)
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


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