from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PlatformSettings(Base):
    """Singleton row: new-tenant defaults + reserved-slug blocklist
    (PLATFORM_HANDOFF §2.3-2.4)."""

    __tablename__ = 'platform_settings'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    default_language: Mapped[str] = mapped_column(String(20), default='fr', server_default='fr')
    trial_length_days: Mapped[int] = mapped_column(Integer, default=30, server_default='30')
    invite_expiry_days: Mapped[int] = mapped_column(Integer, default=14, server_default='14')
    # Law 25 — locked, not editable via the API.
    data_residency: Mapped[str] = mapped_column(String(50), default='aws-ca-central-1', server_default='aws-ca-central-1')
    orphan_retention_days: Mapped[int] = mapped_column(Integer, default=30, server_default='30')
    # Tenant access (§2.2): does each grant need tenant-admin approval, and how
    # long does an approved session last before auto-revoke.
    access_requires_approval: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    access_window_hours: Mapped[int] = mapped_column(Integer, default=4, server_default='4')
    reserved_slugs: Mapped[list] = mapped_column(JSONB, default=list)
    # Local day (shift timezone) the lead follow-up reminder last ran — written
    # by the scheduler, never by the API.
    lead_reminder_sent_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
