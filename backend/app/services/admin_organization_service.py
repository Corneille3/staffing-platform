"""Admin multi-site organizations screen (ADMIN_ORG_HISTORY_HANDOFF §2).

Lists the sites a coordinator runs (their member orgs; for a network/platform
admin, all orgs in their tenant), each enriched with 30-day fill metrics,
coordinators, and a today roster. Membership-based scoping — no RBAC change.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.schemas.admin import (
    AdminOrganizationSite,
    AdminOrganizationUpdate,
    AdminOrgCoordinator,
    AdminOrgMetrics,
    AdminOrgRosterToday,
)
from app.services.audit_service import AuditService
from app.core.timeutil import shift_today

_FILLED = (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)
_OPEN = (RequestStatus.OPEN, RequestStatus.NOTIFIED, RequestStatus.RESPONSES_RECEIVED)


class AdminOrganizationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _scoped_org_ids(self, scope: AccessScope) -> list[UUID]:
        if scope.org_ids:
            return list(scope.org_ids)
        if scope.tenant_id:
            return list(
                self.db.scalars(
                    select(Organization.id).where(Organization.tenant_id == scope.tenant_id)
                )
            )
        return []

    def list_sites(self, scope: AccessScope) -> list[AdminOrganizationSite]:
        org_ids = self._scoped_org_ids(scope)
        if not org_ids:
            return []
        orgs = self.db.scalars(
            select(Organization).where(Organization.id.in_(org_ids))
        ).all()

        since = datetime.now(timezone.utc) - timedelta(days=30)
        today = shift_today()  # Québec date, not the container's UTC date

        # 30-day request volume + filled, grouped per org
        vol_rows = self.db.execute(
            select(
                StaffingRequest.organization_id,
                func.count().label('req30'),
                func.count().filter(StaffingRequest.status.in_(_FILLED)).label('filled30'),
            )
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.created_at >= since,
            )
            .group_by(StaffingRequest.organization_id)
        ).all()
        vol = {r.organization_id: (r.req30, r.filled30) for r in vol_rows}

        open_rows = self.db.execute(
            select(StaffingRequest.organization_id, func.count().label('open'))
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.status.in_(_OPEN),
            )
            .group_by(StaffingRequest.organization_id)
        ).all()
        open_map = {r.organization_id: r.open for r in open_rows}

        coord_rows = self.db.execute(
            select(
                OrganizationMembership.organization_id,
                User.id,
                User.first_name,
                User.last_name,
                OrganizationMembership.role,
            )
            .join(User, User.id == OrganizationMembership.user_id)
            .where(
                OrganizationMembership.organization_id.in_(org_ids),
                OrganizationMembership.is_active.is_(True),
            )
        ).all()
        coords: dict[UUID, list[AdminOrgCoordinator]] = {}
        for r in coord_rows:
            coords.setdefault(r.organization_id, []).append(
                AdminOrgCoordinator(
                    id=r.id, name=f'{r.first_name} {r.last_name}'.strip(), role=r.role.value
                )
            )

        # Roster today: confirmed assignments for this org's requests dated today.
        roster_rows = self.db.execute(
            select(
                StaffingRequest.organization_id,
                func.count().filter(Assignment.checked_in_at.isnot(None)).label('on_site'),
                func.count().filter(Assignment.checked_in_at.is_(None)).label('arriving'),
            )
            .select_from(Assignment)
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.work_date == today,
                Assignment.status == AssignmentStatus.CONFIRMED,
            )
            .group_by(StaffingRequest.organization_id)
        ).all()
        roster = {r.organization_id: (r.on_site, r.arriving) for r in roster_rows}

        sites: list[AdminOrganizationSite] = []
        for o in orgs:
            req30, filled30 = vol.get(o.id, (0, 0))
            fill_rate = round(100 * filled30 / req30) if req30 else 0
            on_site, arriving = roster.get(o.id, (0, 0))
            sites.append(
                AdminOrganizationSite(
                    id=o.id,
                    parent_organization_id=o.parent_organization_id,
                    name=o.name,
                    type=o.type.value,
                    city=o.city,
                    neighbourhood=o.neighbourhood,
                    region=o.region,
                    address_line1=o.address_line1,
                    postal_code=o.postal_code,
                    capacity=o.capacity,
                    enrolled_count=o.enrolled_count,
                    hours_label=o.hours_label,
                    preferred_language=o.preferred_language,
                    contact_phone=o.contact_phone,
                    contact_email=o.contact_email,
                    is_active=o.is_active,
                    metrics=AdminOrgMetrics(
                        fill_rate_30d=fill_rate,
                        requests_30d=req30,
                        filled_30d=filled30,
                        open_requests=open_map.get(o.id, 0),
                    ),
                    coordinators=coords.get(o.id, []),
                    roster_today=AdminOrgRosterToday(on_site=on_site, substitutes_arriving=arriving),
                )
            )
        # Spec §2.6: default selection = highest-volume site.
        sites.sort(key=lambda s: s.metrics.requests_30d, reverse=True)
        return sites

    def update_site(
        self, org_id: UUID, payload: AdminOrganizationUpdate, scope: AccessScope
    ) -> Organization:
        if org_id not in self._scoped_org_ids(scope):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You are not a coordinator for this site.',
            )
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Organization not found')
        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(org, field, value)
        self.db.add(org)
        AuditService(self.db).log(
            action='org.updated',
            entity_type='organization',
            entity_id=org.id,
            actor_user_id=scope.user.id,
            organization_id=org.id,
            payload={k: str(v) for k, v in data.items()},
        )
        self.db.commit()
        self.db.refresh(org)
        return org
