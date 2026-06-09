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

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    RequestOrigin,
    RequestStatus,
    ReplacementPolicy,
)
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.services.audit_service import AuditService

# Only worker-originated, auto-assign requests are claimable this way.
SELF_SERVE_ORIGINS = (RequestOrigin.WORKER_REPLACEMENT, RequestOrigin.STAFF_ABSENCE)
# A reason must be one of these (or omitted).
RELEASE_REASONS = {'sick', 'family', 'personal', 'other'}


class ReplacementService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)

    def release(self, request_id: UUID, scope: AccessScope, reason: str | None) -> StaffingRequest:
        """A contractor releases a held shift to the pool (§2). Keyed on the
        request the worker holds — the worker UI has the request, not the
        assignment. Creates an open (or pending_approval, per org policy)
        worker_replacement request that points at their assignment. The giver
        KEEPS the shift until someone claims it (§7).
        """
        if reason is not None and reason not in RELEASE_REASONS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, 'Unknown release reason.')

        original = self.db.get(StaffingRequest, request_id)
        if original is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Shift not found.')
        assignment = self.db.scalar(
            select(Assignment).where(
                Assignment.staffing_request_id == request_id,
                Assignment.worker_user_id == scope.user.id,
                Assignment.status == AssignmentStatus.CONFIRMED,
            )
        )
        if assignment is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'You do not hold a confirmed assignment for this shift.',
            )

        org = self.db.get(Organization, original.organization_id)
        if scope.tenant_id is None or org.tenant_id != scope.tenant_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')

        allowed = org.replacement_allowed_roles or []
        if original.role is None or original.role.value not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                'This role is not enabled for self-serve replacement.',
            )

        # Lead-time window. Shift times are stored naive; treat as UTC for now
        # (min_release_lead_minutes defaults to 0, so this is a no-op until an
        # org sets it). Revisit if per-org timezones land.
        shift_start = datetime.combine(original.work_date, original.start_time, tzinfo=timezone.utc)
        minutes_until = (shift_start - datetime.now(timezone.utc)).total_seconds() / 60
        if minutes_until < org.min_release_lead_minutes:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'Too close to the shift start to release it.',
            )

        # One live release per assignment.
        existing = self.db.scalar(
            select(StaffingRequest).where(
                StaffingRequest.replaces_assignment_id == assignment.id,
                StaffingRequest.status.in_([RequestStatus.OPEN, RequestStatus.PENDING_APPROVAL]),
            )
        )
        if existing is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'A replacement is already being sought for this shift.',
            )

        needs_approval = org.replacement_policy == ReplacementPolicy.APPROVAL
        replacement = StaffingRequest(
            id=uuid4(),
            organization_id=original.organization_id,
            created_by_user_id=scope.user.id,
            request_type=original.request_type,
            role=original.role,
            hourly_rate=original.hourly_rate,
            status=RequestStatus.PENDING_APPROVAL if needs_approval else RequestStatus.OPEN,
            origin=RequestOrigin.WORKER_REPLACEMENT,
            auto_assign=True,
            replaces_assignment_id=assignment.id,
            release_reason=reason,
            title=original.title,
            description=original.description,
            city=original.city,
            location_name=original.location_name,
            work_date=original.work_date,
            start_time=original.start_time,
            end_time=original.end_time,
            urgency_level=original.urgency_level,
            language_requirement=original.language_requirement,
            coverage_type=original.coverage_type,
            contact_name=original.contact_name,
            contact_phone=original.contact_phone,
            contact_email=original.contact_email,
            arrival_instructions=original.arrival_instructions,
        )
        self.db.add(replacement)
        self.db.flush()

        self.audit_service.log(
            action='replacement.released',
            entity_type='staffing_request',
            entity_id=replacement.id,
            actor_user_id=scope.user.id,
            organization_id=original.organization_id,
            payload={
                'replaces_assignment_id': str(assignment.id),
                'original_request_id': str(original.id),
                'reason': reason,
                'policy': org.replacement_policy.value,
            },
        )
        self.db.commit()
        self.db.refresh(replacement)
        # Phase 3: when policy=auto, broadcast to the eligible pool here and copy
        # the original request's qualification/certification requirements so
        # eligibility filtering is faithful.
        return replacement

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
