"""Self-serve replacement — the atomic first-claim-wins engine.

SELF_SERVE_REPLACEMENT_HANDOFF §3. A worker releases a shift to the eligible
pool; the first to claim wins, atomically, with no coordinator in the loop.

The whole feature's safety rests on `claim()`: a single conditional UPDATE is
the lock. Postgres row-locks the request, and a concurrent claimer's WHERE
(status='open') no longer matches once the winner commits → 0 rows → 409. No
read-then-write race, no SELECT ... FOR UPDATE needed (the UPDATE re-evaluates
its WHERE after acquiring the row lock, even under READ COMMITTED).
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, RequestOrigin, RequestStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.services.audit_service import AuditService

# Only worker-originated, auto-assign requests are claimable this way.
SELF_SERVE_ORIGINS = (RequestOrigin.WORKER_REPLACEMENT, RequestOrigin.STAFF_ABSENCE)


class ReplacementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)

    def claim(self, request_id: UUID, claimer_user_id: UUID, tenant_id: UUID) -> Assignment:
        """Claim an open replacement. Exactly one concurrent caller wins (§3).

        Winner: request → assigned, a confirmed assignment is created for the
        claimer, and the released original assignment (if any) is marked
        RELEASED. Losers get 409 ``already_filled``. A double-tap by the same
        winner is idempotent — it returns the existing assignment, not a 409.

        Tenant isolation is enforced in the UPDATE's WHERE (the request's org
        must belong to ``tenant_id``) — we scope in-app, not via Postgres RLS.
        """
        now = datetime.now(timezone.utc)
        org_in_tenant = select(Organization.id).where(Organization.tenant_id == tenant_id)

        won = self.db.execute(
            update(StaffingRequest)
            .where(
                StaffingRequest.id == request_id,
                StaffingRequest.status == RequestStatus.OPEN,
                StaffingRequest.origin.in_(SELF_SERVE_ORIGINS),
                StaffingRequest.organization_id.in_(org_in_tenant),
            )
            .values(
                status=RequestStatus.ASSIGNED,
                assigned_worker_user_id=claimer_user_id,
                assigned_at=now,
            )
            .returning(
                StaffingRequest.replaces_assignment_id,
                StaffingRequest.organization_id,
            )
        ).first()

        if won is None:
            return self._lost_or_idempotent(request_id, claimer_user_id)

        replaces_assignment_id, organization_id = won

        assignment = Assignment(
            id=uuid4(),
            staffing_request_id=request_id,
            worker_user_id=claimer_user_id,
            assigned_by_user_id=claimer_user_id,  # self-serve: claimer IS the assigner
            status=AssignmentStatus.CONFIRMED,
            assigned_at=now,
            confirmed_at=now,
        )
        self.db.add(assignment)

        # Release the original holder's assignment — only the contractor path has
        # one (staff_absence has no StaffiG assignment, so the pointer is NULL).
        if replaces_assignment_id is not None:
            self.db.execute(
                update(Assignment)
                .where(Assignment.id == replaces_assignment_id)
                .values(status=AssignmentStatus.RELEASED, cancelled_at=now)
            )

        self.audit_service.log(
            action='replacement.claimed',
            entity_type='assignment',
            entity_id=assignment.id,
            actor_user_id=claimer_user_id,
            organization_id=organization_id,
            payload={
                'staffing_request_id': str(request_id),
                'replaces_assignment_id': str(replaces_assignment_id) if replaces_assignment_id else None,
            },
        )
        self.db.commit()
        self.db.refresh(assignment)
        return assignment

    def _lost_or_idempotent(self, request_id: UUID, claimer_user_id: UUID) -> Assignment:
        """The UPDATE matched 0 rows. Either someone else won (→ 409) or this
        same claimer already won a prior tap (→ idempotent success)."""
        self.db.rollback()  # discard the no-op transaction
        request = self.db.get(StaffingRequest, request_id)
        if (
            request is not None
            and request.status == RequestStatus.ASSIGNED
            and request.assigned_worker_user_id == claimer_user_id
        ):
            existing = self.db.scalar(
                select(Assignment).where(
                    Assignment.staffing_request_id == request_id,
                    Assignment.worker_user_id == claimer_user_id,
                )
            )
            if existing is not None:
                return existing
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='already_filled')
