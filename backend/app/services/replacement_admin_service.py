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

# Request status → feed status (the coordinator's vocabulary, §6.1).
_FEED_STATUS = {
    RequestStatus.OPEN: 'searching',
    RequestStatus.PENDING_APPROVAL: 'searching',
    RequestStatus.ASSIGNED: 'filled',
    RequestStatus.COMPLETED: 'filled',
    RequestStatus.CANCELLED: 'cancelled',
    RequestStatus.EXPIRED: 'unfilled',
}


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

        items: list[ReplacementFeedItem] = []
        for r in requests:
            feed_status = _FEED_STATUS.get(r.status, 'searching')
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
                claimer_name=name(r.assigned_worker_user_id),
                released_at=r.created_at,
                time_to_fill_minutes=ttf(r),
            ))

        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        filled = [r for r in requests if r.status in (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)]
        ttfs = [t for r in filled if (t := ttf(r)) is not None]
        kpis = ReplacementKpis(
            released_this_week=sum(1 for r in requests if r.created_at and r.created_at >= week_ago),
            filled=len(filled),
            avg_time_to_fill_minutes=int(sum(ttfs) / len(ttfs)) if ttfs else None,
            unfilled=sum(1 for r in requests if r.status == RequestStatus.EXPIRED),
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
