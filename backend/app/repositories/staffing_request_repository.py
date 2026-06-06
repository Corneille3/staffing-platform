from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth.scope import AccessScope
from app.models.organization import Organization
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest


class StaffingRequestRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_stmt(self):
        return (
            select(StaffingRequest)
            .options(
                selectinload(StaffingRequest.requirements),
                selectinload(StaffingRequest.organization),
            )
            .order_by(StaffingRequest.created_at.desc())
        )

    def _tenant_org_ids(self, tenant_id):
        return select(Organization.id).where(Organization.tenant_id == tenant_id)

    def list(self) -> list[StaffingRequest]:
        return list(self.db.scalars(self._base_stmt()).all())

    def list_for_scope(self, scope: AccessScope) -> list[StaffingRequest]:
        stmt = self._base_stmt()
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return []
            stmt = stmt.where(
                StaffingRequest.organization_id.in_(self._tenant_org_ids(scope.tenant_id))
            )
            return list(self.db.scalars(stmt).all())
        if scope.is_org_admin:
            if not scope.org_ids:
                return []
            stmt = stmt.where(StaffingRequest.organization_id.in_(scope.org_ids))
            return list(self.db.scalars(stmt).all())
        # Worker: requests they were notified for. Spans all orgs in the worker's
        # tenant (correct per MULTITENANCY_HANDOFF §2.5 — a substitute is a
        # tenant-pool member, not org-restricted).
        # TODO(§2.5 multi-tenant worker): this filters only by worker_user_id, NOT
        # by tenant. For a substitute in ONE tenant (all today) that's safe. A
        # worker in TWO tenants would see both tenants' requests mixed — guarded
        # for now by the unique-email check in WorkerService.invite (multi-tenant
        # substitutes are unreachable). When per-tenant worker routing lands,
        # scope this by the worker's CURRENT tenant (from the /t/{slug} path).
        stmt = stmt.join(
            RequestResponse,
            RequestResponse.staffing_request_id == StaffingRequest.id,
        ).where(RequestResponse.worker_user_id == scope.user.id)
        return list(self.db.scalars(stmt).all())

    def get(self, request_id: UUID) -> StaffingRequest | None:
        stmt = (
            select(StaffingRequest)
            .where(StaffingRequest.id == request_id)
            .options(
                selectinload(StaffingRequest.requirements),
                selectinload(StaffingRequest.organization),
            )
        )
        return self.db.scalar(stmt)

    def can_access(self, staffing_request: StaffingRequest, scope: AccessScope) -> bool:
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return False
            org = self.db.get(Organization, staffing_request.organization_id)
            return org is not None and org.tenant_id == scope.tenant_id
        if scope.is_org_admin:
            return staffing_request.organization_id in scope.org_ids
        own_response = self.db.scalar(
            select(RequestResponse).where(
                RequestResponse.staffing_request_id == staffing_request.id,
                RequestResponse.worker_user_id == scope.user.id,
            )
        )
        return own_response is not None

    def create(self, staffing_request: StaffingRequest) -> StaffingRequest:
        self.db.add(staffing_request)
        self.db.flush()
        self.db.refresh(staffing_request)
        return staffing_request

    def save(self, staffing_request: StaffingRequest) -> StaffingRequest:
        self.db.add(staffing_request)
        self.db.flush()
        self.db.refresh(staffing_request)
        return staffing_request
