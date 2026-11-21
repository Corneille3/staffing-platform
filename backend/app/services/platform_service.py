"""Platform-operator aggregate reads — MULTITENANCY_HANDOFF §5.2.

The privacy boundary: this service crosses tenant boundaries (it's the operator)
but selects ONLY counts and rates + tenant/admin identity. It deliberately does
not import or expose any worker/request/shift row data. Keep it that way.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.models.enums import RequestStatus, TenantStatus, UserRole
from app.models.organization import Organization
from app.models.platform_lead import PlatformLead
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User

_FILLED = (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)


class PlatformService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _org_count(self, tenant_id: UUID) -> int:
        return self.db.scalar(
            select(func.count()).select_from(Organization).where(Organization.tenant_id == tenant_id)
        ) or 0

    def _substitute_count(self, tenant_id: UUID) -> int:
        return self.db.scalar(
            select(func.count(distinct(TenantMembership.user_id)))
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.role == UserRole.WORKER,
                TenantMembership.is_active.is_(True),
            )
        ) or 0

    def _fill_counts(self, tenant_id: UUID, cutoff: datetime) -> tuple[int, int]:
        """(filled, total) requests created in the window for this tenant."""
        base = (
            select(func.count())
            .select_from(StaffingRequest)
            .join(Organization, StaffingRequest.organization_id == Organization.id)
            .where(Organization.tenant_id == tenant_id, StaffingRequest.created_at > cutoff)
        )
        total = self.db.scalar(base) or 0
        filled = self.db.scalar(base.where(StaffingRequest.status.in_(_FILLED))) or 0
        return filled, total

    def _admin_for(self, tenant_id: UUID) -> User | None:
        return self.db.scalar(
            select(User)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.role == UserRole.NETWORK_ADMIN,
                TenantMembership.is_active.is_(True),
            )
            .order_by(User.created_at.asc())
        )

    def tenants_overview(self) -> dict:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        # Filter on status, not is_active: suspension ALSO writes
        # is_active=False, and hiding suspended tenants makes their
        # Reactivate button unreachable (2026-08-06 regression). REMOVED
        # is the only state the console forgets.
        tenants = self.db.scalars(
            select(Tenant)
            .where(Tenant.status != TenantStatus.REMOVED)
            .order_by(Tenant.created_at.desc())
        ).all()

        # « Origine »: the sales lead a tenant was invited from, if any.
        origins = {
            tenant_id: (segment, source, lead_status.value)
            for tenant_id, segment, source, lead_status in self.db.execute(
                select(PlatformLead.tenant_id, PlatformLead.segment, PlatformLead.source, PlatformLead.status)
                .where(PlatformLead.tenant_id.in_([t.id for t in tenants]))
            )
        }

        rows: list[dict] = []
        active_tenants = 0
        total_orgs = 0
        total_subs = 0
        agg_filled = 0
        agg_total = 0

        for t in tenants:
            org_count = self._org_count(t.id)
            sub_count = self._substitute_count(t.id)
            filled, total = self._fill_counts(t.id, cutoff)
            admin = self._admin_for(t.id)

            if t.status == TenantStatus.ACTIVE:
                active_tenants += 1
            total_orgs += org_count
            total_subs += sub_count
            agg_filled += filled
            agg_total += total

            rows.append({
                'id': t.id,
                'name': t.name,
                'slug': t.slug,
                'region': t.region,
                'status': t.status.value,
                'org_count': org_count,
                'substitute_count': sub_count,
                'fill_rate_30d': round(100 * filled / total) if total else None,
                'admin_name': f'{admin.first_name} {admin.last_name}' if admin else None,
                'admin_email': admin.email if admin else None,
                'since': t.activated_at or t.created_at,
                'lead_segment': origins.get(t.id, (None, None, None))[0],
                'lead_source': origins.get(t.id, (None, None, None))[1],
                'lead_status': origins.get(t.id, (None, None, None))[2],
            })

        return {
            'kpis': {
                'active_tenants': active_tenants,
                'total_orgs': total_orgs,
                'total_substitutes': total_subs,
                'weighted_fill_rate': round(100 * agg_filled / agg_total) if agg_total else None,
            },
            'tenants': rows,
        }
