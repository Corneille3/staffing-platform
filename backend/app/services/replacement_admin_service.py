"""Coordinator-facing self-serve replacement (SELF_SERVE_REPLACEMENT §5, §6.1).

Read-only awareness (the self-filled feed + KPIs) plus the per-org policy.
Kept separate from ReplacementService, which owns the worker actions.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import RequestOrigin, RequestStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.repositories.organization_repository import OrganizationRepository
from app.schemas.replacement import (
    ReplacementFeedItem,
    ReplacementFeedResponse,
    ReplacementKpis,
    ReplacementPolicyRead,
    ReplacementPolicyUpdate,
)
from app.services.audit_service import AuditService
from app.services.replacement_service import ReplacementService

# Request status → feed status (the coordinator's vocabulary, §6.1).
_FEED_STATUS = {
    RequestStatus.OPEN: 'searching',
    RequestStatus.PENDING_APPROVAL: 'searching',
    RequestStatus.ASSIGNED: 'filled',
    RequestStatus.COMPLETED: 'filled',
    RequestStatus.CANCELLED: 'cancelled',
    RequestStatus.EXPIRED: 'unfilled',
}

# Approval-mode auto-publish timeout (§7): if the coordinator ignores a pending
# release this long, the sweep publishes it so a sick worker isn't stuck.
AUTO_PUBLISH_MINUTES = 10


def _shift_started(request: StaffingRequest, now: datetime) -> bool:
    return datetime.combine(request.work_date, request.start_time, tzinfo=timezone.utc) <= now


class ReplacementAdminService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.org_repo = OrganizationRepository(db)
        self.audit_service = AuditService(db)

    def _accessible_org_ids(self, scope: AccessScope) -> list[UUID]:
        return [org.id for org in self.org_repo.list_for_scope(scope)]

    def coordinator_feed(self, scope: AccessScope, status_filter: str | None = None) -> ReplacementFeedResponse:
        org_ids = self._accessible_org_ids(scope)
        empty = ReplacementFeedResponse(
            kpis=ReplacementKpis(released_this_week=0, filled=0, unfilled=0), items=[],
        )
        if not org_ids:
            return empty

        requests = list(self.db.scalars(
            select(StaffingRequest)
            .where(
                StaffingRequest.origin == RequestOrigin.WORKER_REPLACEMENT,
                StaffingRequest.organization_id.in_(org_ids),
            )
            .order_by(StaffingRequest.created_at.desc())
        ))

        user_ids: set[UUID] = set()
        for r in requests:
            user_ids.add(r.created_by_user_id)
            if r.assigned_worker_user_id:
                user_ids.add(r.assigned_worker_user_id)
        users = {
            u.id: u for u in self.db.scalars(select(User).where(User.id.in_(user_ids)))
        } if user_ids else {}

        def name(uid: UUID | None) -> str | None:
            if uid is None:
                return None
            u = users.get(uid)
            return f'{u.first_name} {u.last_name}'.strip() if u else None

        def ttf(r: StaffingRequest) -> int | None:
            if r.assigned_at and r.created_at:
                return int((r.assigned_at - r.created_at).total_seconds() // 60)
            return None

        now = datetime.now(timezone.utc)
        items: list[ReplacementFeedItem] = []
        for r in requests:
            feed_status = _FEED_STATUS.get(r.status, 'searching')
            # Derived: an open shift whose start time has passed with no claim
            # reads as unfilled even before the sweep persists it — so the
            # dashboard is honest without a scheduler.
            if r.status == RequestStatus.OPEN and _shift_started(r, now):
                feed_status = 'unfilled'
            if status_filter == 'live' and feed_status != 'searching':
                continue
            if status_filter == 'history' and feed_status == 'searching':
                continue
            items.append(ReplacementFeedItem(
                request_id=r.id,
                giver_name=name(r.created_by_user_id) or '—',
                title=r.title,
                work_date=r.work_date,
                start_time=r.start_time,
                end_time=r.end_time,
                role=r.role.value if r.role else None,
                reason=r.release_reason,
                status=feed_status,
                awaiting_approval=r.status == RequestStatus.PENDING_APPROVAL,
                claimer_name=name(r.assigned_worker_user_id),
                released_at=r.created_at,
                time_to_fill_minutes=ttf(r),
            ))

        week_ago = now - timedelta(days=7)
        filled = [r for r in requests if r.status in (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)]
        ttfs = [t for r in filled if (t := ttf(r)) is not None]
        kpis = ReplacementKpis(
            released_this_week=sum(1 for r in requests if r.created_at and r.created_at >= week_ago),
            filled=len(filled),
            avg_time_to_fill_minutes=int(sum(ttfs) / len(ttfs)) if ttfs else None,
            # Persisted-expired + derived-unfilled (open, shift already started).
            unfilled=sum(
                1 for r in requests
                if r.status == RequestStatus.EXPIRED
                or (r.status == RequestStatus.OPEN and _shift_started(r, now))
            ),
        )
        return ReplacementFeedResponse(kpis=kpis, items=items)

    def _org_in_scope(self, org_id: UUID, scope: AccessScope) -> Organization:
        if org_id not in self._accessible_org_ids(scope):
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Organization not found.')
        return org

    def get_policy(self, org_id: UUID, scope: AccessScope) -> ReplacementPolicyRead:
        org = self._org_in_scope(org_id, scope)
        return ReplacementPolicyRead(
            organization_id=org.id,
            organization_name=org.name,
            policy=org.replacement_policy,
            allowed_roles=org.replacement_allowed_roles or [],
            min_release_lead_minutes=org.min_release_lead_minutes,
        )

    def set_policy(self, org_id: UUID, payload: ReplacementPolicyUpdate, scope: AccessScope) -> ReplacementPolicyRead:
        org = self._org_in_scope(org_id, scope)
        if payload.policy is not None:
            org.replacement_policy = payload.policy
        if payload.allowed_roles is not None:
            org.replacement_allowed_roles = payload.allowed_roles
        if payload.min_release_lead_minutes is not None:
            org.min_release_lead_minutes = payload.min_release_lead_minutes
        self.audit_service.log(
            action='replacement.policy_updated',
            entity_type='organization',
            entity_id=org.id,
            actor_user_id=scope.user.id,
            organization_id=org.id,
            payload={
                'policy': org.replacement_policy.value,
                'allowed_roles': org.replacement_allowed_roles,
                'min_release_lead_minutes': org.min_release_lead_minutes,
            },
        )
        self.db.commit()
        self.db.refresh(org)
        return self.get_policy(org_id, scope)

    # ── approval mode (§5) ──────────────────────────────────────────────────

    def _pending_in_scope(self, request_id: UUID, scope: AccessScope) -> StaffingRequest:
        request = self.db.get(StaffingRequest, request_id)
        if request is None or request.origin != RequestOrigin.WORKER_REPLACEMENT:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Replacement not found.')
        if request.organization_id not in self._accessible_org_ids(scope):
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')
        if request.status != RequestStatus.PENDING_APPROVAL:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                'This release is not awaiting approval.',
            )
        return request

    def approve(self, request_id: UUID, scope: AccessScope) -> StaffingRequest:
        """Approval mode: the coordinator approves a pending release → it opens
        and broadcasts to the pool (§5)."""
        request = self._pending_in_scope(request_id, scope)
        request.status = RequestStatus.OPEN
        self.audit_service.log(
            action='replacement.approved', entity_type='staffing_request',
            entity_id=request.id, actor_user_id=scope.user.id,
            organization_id=request.organization_id, payload={},
        )
        self.db.commit()
        self.db.refresh(request)
        ReplacementService(self.db).broadcast(request)
        return request

    def deny(self, request_id: UUID, scope: AccessScope, reason: str | None) -> StaffingRequest:
        """Approval mode: the coordinator refuses the release → cancelled, the
        giver keeps the shift (§5)."""
        request = self._pending_in_scope(request_id, scope)
        request.status = RequestStatus.CANCELLED
        request.cancelled_at = datetime.now(timezone.utc)
        self.audit_service.log(
            action='replacement.denied', entity_type='staffing_request',
            entity_id=request.id, actor_user_id=scope.user.id,
            organization_id=request.organization_id, payload={'reason': reason},
        )
        self.db.commit()
        self.db.refresh(request)
        return request

    def sweep(self, scope: AccessScope) -> dict:
        """Manual/cron-ready housekeeping (§7), scoped to the caller's orgs:
        auto-publish approvals the coordinator sat on past the timeout, and
        expire open releases whose shift already started with no claim.

        Proactive coordinator notification on expiry is deferred until this is
        wired to a scheduler (same status as the reliability cron) — for now the
        dashboard surfaces unfilled and this persists the state."""
        org_ids = self._accessible_org_ids(scope)
        if not org_ids:
            return {'auto_published': 0, 'expired': 0}
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(minutes=AUTO_PUBLISH_MINUTES)

        pending = list(self.db.scalars(select(StaffingRequest).where(
            StaffingRequest.origin == RequestOrigin.WORKER_REPLACEMENT,
            StaffingRequest.organization_id.in_(org_ids),
            StaffingRequest.status == RequestStatus.PENDING_APPROVAL,
            StaffingRequest.created_at < cutoff,
        )))
        worker_svc = ReplacementService(self.db)
        for request in pending:
            request.status = RequestStatus.OPEN
            self.audit_service.log(
                action='replacement.auto_published', entity_type='staffing_request',
                entity_id=request.id, actor_user_id=scope.user.id,
                organization_id=request.organization_id, payload={'timeout_minutes': AUTO_PUBLISH_MINUTES},
            )
        self.db.commit()
        for request in pending:
            self.db.refresh(request)
            worker_svc.broadcast(request)

        opens = list(self.db.scalars(select(StaffingRequest).where(
            StaffingRequest.origin == RequestOrigin.WORKER_REPLACEMENT,
            StaffingRequest.organization_id.in_(org_ids),
            StaffingRequest.status == RequestStatus.OPEN,
        )))
        expired = 0
        for request in opens:
            if _shift_started(request, now):
                request.status = RequestStatus.EXPIRED
                self.audit_service.log(
                    action='replacement.unfilled', entity_type='staffing_request',
                    entity_id=request.id, actor_user_id=scope.user.id,
                    organization_id=request.organization_id, payload={},
                )
                expired += 1
        self.db.commit()
        return {'auto_published': len(pending), 'expired': expired}
