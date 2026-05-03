from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import distinct, extract, func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.enums import AvailabilityStatus, RequestStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_profile import WorkerProfile
from app.models.worker_region import WorkerRegion

_UNFILLED = [RequestStatus.OPEN, RequestStatus.NOTIFIED, RequestStatus.RESPONSES_RECEIVED]
_FILLED = [RequestStatus.ASSIGNED, RequestStatus.COMPLETED]


class ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _tenant_org_subq(self, tenant_id):
        return select(Organization.id).where(Organization.tenant_id == tenant_id)

    def _scope_requests(self, stmt, scope: AccessScope):
        if scope.is_platform_admin:
            return stmt
        if scope.is_network_admin:
            if not scope.tenant_id:
                return stmt.where(sa.false())
            return stmt.where(
                StaffingRequest.organization_id.in_(self._tenant_org_subq(scope.tenant_id))
            )
        if scope.org_ids:
            return stmt.where(StaffingRequest.organization_id.in_(scope.org_ids))
        return stmt.where(sa.false())

    def _active_substitutes(self, scope: AccessScope) -> int:
        stmt = (
            select(func.count()).select_from(WorkerProfile)
            .where(WorkerProfile.availability_status == AvailabilityStatus.AVAILABLE)
        )
        if scope.is_platform_admin:
            return self.db.scalar(stmt) or 0
        if scope.is_network_admin and scope.tenant_id:
            stmt = stmt.join(User, WorkerProfile.user_id == User.id).join(
                TenantMembership, TenantMembership.user_id == User.id
            ).where(
                TenantMembership.tenant_id == scope.tenant_id,
                TenantMembership.is_active.is_(True),
            )
            return self.db.scalar(stmt) or 0
        return 0

    def _covered_cities(self, scope: AccessScope) -> set[str]:
        stmt = (
            select(distinct(WorkerRegion.city))
            .join(WorkerProfile, WorkerRegion.worker_profile_id == WorkerProfile.id)
            .where(WorkerProfile.availability_status == AvailabilityStatus.AVAILABLE)
        )
        if scope.is_platform_admin:
            return set(self.db.scalars(stmt).all())
        if scope.is_network_admin and scope.tenant_id:
            stmt = stmt.join(User, WorkerProfile.user_id == User.id).join(
                TenantMembership, TenantMembership.user_id == User.id
            ).where(
                TenantMembership.tenant_id == scope.tenant_id,
                TenantMembership.is_active.is_(True),
            )
            return set(self.db.scalars(stmt).all())
        return set()

    def network_overview(self, scope: AccessScope) -> dict:
        total_requests = self.db.scalar(
            self._scope_requests(select(func.count()).select_from(StaffingRequest), scope)
        ) or 0

        filled_count = self.db.scalar(
            self._scope_requests(
                select(func.count()).select_from(StaffingRequest)
                .where(StaffingRequest.status.in_(_FILLED)),
                scope,
            )
        ) or 0

        fill_rate = round(filled_count / total_requests * 100) if total_requests else 0
        active_substitutes = self._active_substitutes(scope)

        unfilled_count = self.db.scalar(
            self._scope_requests(
                select(func.count()).select_from(StaffingRequest)
                .where(StaffingRequest.status.in_(_UNFILLED)),
                scope,
            )
        ) or 0

        avg_raw = self.db.scalar(
            self._scope_requests(
                select(func.avg(
                    extract('epoch', Assignment.assigned_at - StaffingRequest.created_at) / 3600
                ))
                .select_from(Assignment)
                .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
                .where(Assignment.status != 'cancelled'),
                scope,
            )
        )
        avg_fill_hours = round(float(avg_raw), 1) if avg_raw is not None else None

        status_rows = self.db.execute(
            self._scope_requests(
                select(StaffingRequest.status, func.count())
                .select_from(StaffingRequest)
                .group_by(StaffingRequest.status),
                scope,
            )
        ).all()
        status_breakdown = {
            (row[0].value if hasattr(row[0], 'value') else str(row[0])): row[1]
            for row in status_rows
        }

        open_cities = self.db.scalars(
            self._scope_requests(
                select(distinct(StaffingRequest.city))
                .where(StaffingRequest.status.in_(_UNFILLED)),
                scope,
            )
        ).all()

        covered_cities = self._covered_cities(scope)
        shortage_cities = sorted(c for c in open_cities if c not in covered_cities)

        return {
            'total_requests': total_requests,
            'filled_count': filled_count,
            'fill_rate': fill_rate,
            'active_substitutes': active_substitutes,
            'unfilled_count': unfilled_count,
            'avg_fill_hours': avg_fill_hours,
            'status_breakdown': status_breakdown,
            'shortage_cities': shortage_cities,
        }

    def network_summary(self, scope: AccessScope) -> dict[str, int]:
        org_count_stmt = select(func.count()).select_from(Organization)
        request_stmt = select(func.count()).select_from(StaffingRequest)
        assignment_stmt = (
            select(func.count())
            .select_from(Assignment)
            .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
        )

        if scope.is_platform_admin:
            pass
        elif scope.is_network_admin:
            if not scope.tenant_id:
                return {'organization_count': 0, 'request_count': 0, 'assignment_count': 0}
            tenant_org_ids = self._tenant_org_subq(scope.tenant_id)
            org_count_stmt = org_count_stmt.where(Organization.tenant_id == scope.tenant_id)
            request_stmt = request_stmt.where(StaffingRequest.organization_id.in_(tenant_org_ids))
            assignment_stmt = assignment_stmt.where(
                StaffingRequest.organization_id.in_(tenant_org_ids)
            )
        elif scope.org_ids:
            org_count_stmt = org_count_stmt.where(Organization.id.in_(scope.org_ids))
            request_stmt = request_stmt.where(StaffingRequest.organization_id.in_(scope.org_ids))
            assignment_stmt = assignment_stmt.where(
                StaffingRequest.organization_id.in_(scope.org_ids)
            )
        else:
            return {'organization_count': 0, 'request_count': 0, 'assignment_count': 0}

        return {
            'organization_count': self.db.scalar(org_count_stmt) or 0,
            'request_count': self.db.scalar(request_stmt) or 0,
            'assignment_count': self.db.scalar(assignment_stmt) or 0,
        }

    def organization_summary(self, organization_id: UUID, scope: AccessScope) -> dict[str, int]:
        if not scope.is_platform_admin:
            if scope.is_network_admin:
                org = self.db.get(Organization, organization_id)
                if org is None or org.tenant_id != scope.tenant_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail='You do not have access to this organization.',
                    )
            elif organization_id not in scope.org_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail='You do not have access to this organization.',
                )
        return {
            'request_count': self.db.scalar(
                select(func.count())
                .select_from(StaffingRequest)
                .where(StaffingRequest.organization_id == organization_id)
            ) or 0,
            'assignment_count': self.db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
                .where(StaffingRequest.organization_id == organization_id)
            ) or 0,
        }
