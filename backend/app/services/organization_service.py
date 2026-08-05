from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import RequestStatus
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.staffing_request import StaffingRequest
from app.repositories.organization_repository import OrganizationRepository
from app.services.audit_service import AuditService

# Statuses that mean dispatch is in flight — an org with any of these cannot be
# removed until the coordinator closes them out. Drafts don't block (they die
# quietly with the org), and terminal states (completed/cancelled/expired) are
# history, which removal deliberately preserves.
_LIVE_REQUEST_STATUSES = (
    RequestStatus.OPEN,
    RequestStatus.NOTIFIED,
    RequestStatus.RESPONSES_RECEIVED,
    RequestStatus.ASSIGNED,
    RequestStatus.PENDING_APPROVAL,
)


class OrganizationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repository = OrganizationRepository(db)
        self.audit_service = AuditService(db)

    def list(self) -> list[Organization]:
        return self.repository.list()

    def get(self, organization_id: UUID) -> Organization | None:
        return self.repository.get(organization_id)

    def remove(self, organization_id: UUID, scope: AccessScope) -> Organization:
        """Soft-delete an organization (mirrors tenant removal, one level down).

        Deactivates the org and its OrganizationMemberships — the people stay
        active (they may serve other orgs in the tenant); only their tie to
        this org is cut. Requests/assignments/audit history are preserved.
        Refuses while dispatch is live so a removal can't strand an open
        request or an assigned shift.
        """
        org = self.repository.get(organization_id)
        if org is None or not org.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Organization not found')
        if not scope.tenant_id or org.tenant_id != scope.tenant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

        live_count = self.db.scalar(
            select(func.count(StaffingRequest.id)).where(
                StaffingRequest.organization_id == organization_id,
                StaffingRequest.status.in_(_LIVE_REQUEST_STATUSES),
            )
        ) or 0
        if live_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'Organization has {live_count} live request(s) — close or cancel them first',
            )

        self.db.execute(
            update(OrganizationMembership)
            .where(OrganizationMembership.organization_id == organization_id)
            .values(is_active=False)
        )
        org.is_active = False

        self.audit_service.log(
            action='organization.removed',
            entity_type='organization',
            entity_id=org.id,
            actor_user_id=scope.user.id,
            organization_id=org.id,
            payload={'name': org.name, 'city': org.city, 'tenant_id': str(org.tenant_id)},
        )
        self.db.commit()
        self.db.refresh(org)
        return org
