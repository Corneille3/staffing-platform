from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import OrganizationType, ReplacementPolicy, db_enum

# Default roles allowed to release/report a shift for self-serve replacement
# (SELF_SERVE_REPLACEMENT §5) — the care-giving roles, editable per org.
DEFAULT_REPLACEMENT_ROLES = ['educator', 'assistant_educator', 'psw', 'nurse']


class Organization(Base):
    __tablename__ = 'organizations'

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey('tenants.id', ondelete='RESTRICT'))
    # Self-referential: a "site"/installation rows up to its parent CPE/org.
    # NULL parent means this row IS a parent (or a standalone org).
    parent_organization_id: Mapped[UUID | None] = mapped_column(
        ForeignKey('organizations.id', ondelete='SET NULL')
    )
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[OrganizationType] = mapped_column(db_enum(OrganizationType, 'organization_type'))
    city: Mapped[str] = mapped_column(String(100))
    neighbourhood: Mapped[str | None] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    address_line1: Mapped[str | None] = mapped_column(String(255))
    address_line2: Mapped[str | None] = mapped_column(String(255))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    preferred_language: Mapped[str] = mapped_column(String(20), default='fr', server_default='fr')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default='true')
    # Multi-site descriptors (per ADMIN_ORG_HISTORY_HANDOFF §1) — all optional.
    capacity: Mapped[int | None] = mapped_column(Integer)
    enrolled_count: Mapped[int | None] = mapped_column(Integer)
    hours_label: Mapped[str | None] = mapped_column(String(120))
    # Self-serve replacement policy (SELF_SERVE_REPLACEMENT §5). Default auto =
    # released shifts broadcast instantly; approval keeps a coordinator gate.
    replacement_policy: Mapped[ReplacementPolicy] = mapped_column(
        db_enum(ReplacementPolicy, 'replacement_policy'),
        default=ReplacementPolicy.AUTO,
        server_default=ReplacementPolicy.AUTO.value,
    )
    replacement_allowed_roles: Mapped[list[str]] = mapped_column(
        JSONB,
        default=lambda: list(DEFAULT_REPLACEMENT_ROLES),
        server_default=text("""'["educator","assistant_educator","psw","nurse"]'::jsonb"""),
    )
    # A shift can only be released this many minutes before it starts (0 = up to
    # start time, which a same-day sick release needs).
    min_release_lead_minutes: Mapped[int] = mapped_column(Integer, default=0, server_default='0')
    # Check-in/out geofence radius around (latitude, longitude); NULL falls back
    # to settings.geofence_default_radius_m (SPEC_CHECKOUT_HOURS §3).
    geofence_radius_m: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship('Tenant', back_populates='organizations')
    parent = relationship('Organization', remote_side=[id], back_populates='sites')
    sites = relationship('Organization', back_populates='parent')
    memberships = relationship('OrganizationMembership', back_populates='organization')
    staffing_requests = relationship('StaffingRequest', back_populates='organization')
    audit_logs = relationship('AuditLog', back_populates='organization')
