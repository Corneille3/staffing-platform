from datetime import date, datetime, timezone
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer,
    SmallInteger, String, Text, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import LeadStatus, db_enum


class PlatformLead(Base):
    """A prospect organization, before any tenant exists (SPEC_PLATFORM_LEADS).

    Tier-0 data: organization-level contact details only, never anything from
    inside a tenant. `tenant_id` is the single link to the tenant this lead
    became — set at invite, with `converted_at` stamped when that tenant goes
    active (the spec's tenants.lead_id + converted_tenant_id pair, folded
    into one column so the two sides cannot drift)."""

    __tablename__ = 'platform_leads'
    __table_args__ = (
        CheckConstraint('site_count IS NULL OR site_count >= 0', name='ck_platform_leads_site_count'),
        CheckConstraint('score IS NULL OR score BETWEEN 0 AND 10', name='ck_platform_leads_score'),
        Index('ix_platform_leads_status', 'status'),
        Index('ix_platform_leads_segment', 'segment'),
        Index(
            'ix_platform_leads_next_action_open', 'next_action_at',
            postgresql_where=text("status NOT IN ('won', 'lost')"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    external_ref: Mapped[str | None] = mapped_column(String(40), unique=True)  # "L017" (import)
    org_name: Mapped[str] = mapped_column(String(255))
    segment: Mapped[str] = mapped_column(String(40))
    subtype: Mapped[str | None] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20), default='prospect', server_default='prospect')
    site_count: Mapped[int | None] = mapped_column(Integer)
    capacity_note: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(120))
    province: Mapped[str] = mapped_column(String(2))
    regions: Mapped[str | None] = mapped_column(Text)
    agency_ban_phase: Mapped[str] = mapped_column(String(10), default='none', server_default='none')
    language: Mapped[str] = mapped_column(String(2), default='fr', server_default='fr')
    website: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(60))
    email: Mapped[str | None] = mapped_column(String(255))
    contact_name: Mapped[str | None] = mapped_column(String(160))
    contact_title: Mapped[str | None] = mapped_column(String(160))
    hiring_signal: Mapped[bool | None] = mapped_column(Boolean)
    score: Mapped[int | None] = mapped_column(SmallInteger)
    wave: Mapped[str | None] = mapped_column(String(1))  # 'A' | 'B' | 'C' | NULL (channel)
    status: Mapped[LeadStatus] = mapped_column(
        db_enum(LeadStatus, 'lead_status'), default=LeadStatus.NEW, server_default='new',
    )
    lost_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), default='research', server_default='research')
    source_detail: Mapped[str | None] = mapped_column(String(255))
    next_action: Mapped[str | None] = mapped_column(Text)
    next_action_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    tenant_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('tenants.id', ondelete='SET NULL'), unique=True,
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # NULL for system-created leads (the public intake form).
    created_by: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )


class PlatformLeadEvent(Base):
    """Activity feed of a lead — append-only through the API (no PATCH, no DELETE)."""

    __tablename__ = 'platform_lead_events'
    __table_args__ = (
        Index('ix_platform_lead_events_lead_created', 'lead_id', text('created_at DESC')),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    lead_id: Mapped[UUID] = mapped_column(ForeignKey('platform_leads.id', ondelete='CASCADE'))
    type: Mapped[str] = mapped_column(String(30))
    from_status: Mapped[LeadStatus | None] = mapped_column(db_enum(LeadStatus, 'lead_status'))
    to_status: Mapped[LeadStatus | None] = mapped_column(db_enum(LeadStatus, 'lead_status'))
    body: Mapped[str | None] = mapped_column(Text)
    # NULL when the system wrote it (public form).
    actor_id: Mapped[UUID | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'))
    # Stamped by the application clock, not now(): Postgres' now() is the
    # transaction start, so two events written in one transaction would tie
    # and the feed order would be arbitrary.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(),
    )
