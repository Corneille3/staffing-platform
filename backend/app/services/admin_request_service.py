"""Admin requests triage index (ADMIN_ORG_HISTORY_HANDOFF §4).

Returns the coordinator's working list of requests across their sites, each
enriched with response metrics, a top-match acceptor, and (when assigned) the
assigned worker. Membership-based scoping — no RBAC change.
"""
from __future__ import annotations

from uuid import UUID

import sqlalchemy as sa
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import RequestStatus, ResponseStatus
from app.models.organization import Organization
from app.models.request_notification import RequestNotification
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.user import User

_STATUS_FOR_TAB = {
    'active': [RequestStatus.OPEN, RequestStatus.NOTIFIED, RequestStatus.RESPONSES_RECEIVED],
    'assigned': [RequestStatus.ASSIGNED],
}


class AdminRequestService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _scoped_org_ids(self, scope: AccessScope) -> list[UUID]:
        if scope.org_ids:
            return list(scope.org_ids)
        if scope.tenant_id:
            return list(
                self.db.scalars(select(Organization.id).where(Organization.tenant_id == scope.tenant_id))
            )
        return []

    def list_summaries(
        self,
        scope: AccessScope,
        tab: str = 'active',
        site_id: UUID | None = None,
        urgency: str = 'all',
        language: str = 'all',
        cursor: str | None = None,
        limit: int = 25,
    ) -> dict:
        limit = max(1, min(limit, 50))
        org_ids = self._scoped_org_ids(scope)
        if not org_ids:
            return {'items': [], 'counts': {'active': 0, 'assigned': 0, 'all': 0}, 'next_cursor': None}

        def _common(stmt):
            stmt = stmt.where(StaffingRequest.organization_id.in_(org_ids))
            if site_id is not None and site_id in org_ids:
                stmt = stmt.where(StaffingRequest.organization_id == site_id)
            if urgency == 'urgent':
                stmt = stmt.where(StaffingRequest.urgency_level >= 3)
            elif urgency == 'planned':
                stmt = stmt.where(StaffingRequest.urgency_level < 3)
            if language != 'all':
                stmt = stmt.where(StaffingRequest.language_requirement == language)
            return stmt

        # Tab counts (in-context with site/urgency/language filters).
        def _count(statuses):
            stmt = _common(select(func.count()).select_from(StaffingRequest))
            if statuses is not None:
                stmt = stmt.where(StaffingRequest.status.in_(statuses))
            return self.db.scalar(stmt) or 0

        counts = {
            'active': _count(_STATUS_FOR_TAB['active']),
            'assigned': _count(_STATUS_FOR_TAB['assigned']),
            'all': _count(None),
        }

        # Page query.
        page_stmt = _common(select(StaffingRequest))
        statuses = _STATUS_FOR_TAB.get(tab)
        if statuses is not None:
            page_stmt = page_stmt.where(StaffingRequest.status.in_(statuses))

        # Order: urgent + unassigned pinned on top (safety — an urgent unfilled
        # shift must never get buried), then newest-created first. (Was soonest
        # shift date, which sank a just-created far-out request to the bottom.)
        priority = case(
            (sa.and_(StaffingRequest.urgency_level >= 3, StaffingRequest.status != RequestStatus.ASSIGNED), 0),
            else_=1,
        )
        offset = 0
        if cursor:
            try:
                offset = max(0, int(cursor))
            except ValueError:
                offset = 0
        rows = list(
            self.db.scalars(
                page_stmt.order_by(priority, StaffingRequest.created_at.desc())
                .offset(offset)
                .limit(limit + 1)
            ).all()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = str(offset + limit) if has_more else None

        request_ids = [r.id for r in rows]
        if not request_ids:
            return {'items': [], 'counts': counts, 'next_cursor': None}

        # Batch: responses, notification match scores, worker names.
        responses_by_req: dict[UUID, list[RequestResponse]] = {}
        for resp in self.db.scalars(
            select(RequestResponse).where(RequestResponse.staffing_request_id.in_(request_ids))
        ).all():
            responses_by_req.setdefault(resp.staffing_request_id, []).append(resp)

        scores: dict[tuple[UUID, UUID], float] = {}
        for n in self.db.execute(
            select(RequestNotification.staffing_request_id, RequestNotification.worker_user_id, RequestNotification.match_score)
            .where(RequestNotification.staffing_request_id.in_(request_ids))
        ).all():
            if n.match_score is not None:
                scores[(n.staffing_request_id, n.worker_user_id)] = float(n.match_score)

        worker_ids = {r.worker_user_id for resps in responses_by_req.values() for r in resps}
        worker_ids |= {r.assigned_worker_user_id for r in rows if r.assigned_worker_user_id}
        names: dict[UUID, str] = {}
        if worker_ids:
            for u in self.db.scalars(select(User).where(User.id.in_(worker_ids))).all():
                names[u.id] = f'{u.first_name} {u.last_name}'.strip()

        items = []
        for r in rows:
            resps = responses_by_req.get(r.id, [])
            accepted = [x for x in resps if x.status == ResponseStatus.ACCEPTED]
            declined = [x for x in resps if x.status == ResponseStatus.DECLINED]
            metrics = {
                'notified': len(resps),
                'viewed': sum(1 for x in resps if x.viewed_at is not None),
                'accepted': len(accepted),
                'declined': len(declined),
                'responses': len(accepted) + len(declined),
            }

            top_match = None
            if accepted and r.status != RequestStatus.ASSIGNED:
                best = max(accepted, key=lambda x: scores.get((r.id, x.worker_user_id), -1.0))
                score = scores.get((r.id, best.worker_user_id))
                top_match = {
                    'user_id': best.worker_user_id,
                    'name': names.get(best.worker_user_id, 'Substitute'),
                    'match_score': round(score) if score is not None else None,
                }

            assigned_worker = None
            if r.assigned_worker_user_id:
                assigned_worker = {
                    'user_id': r.assigned_worker_user_id,
                    'name': names.get(r.assigned_worker_user_id, 'Substitute'),
                }

            items.append({
                'id': r.id,
                'public_id': f'REQ-{str(r.id).split("-")[0].upper()}',
                'urgent': r.urgency_level >= 3,
                'status': r.status.value,
                'role': r.role.value if r.role else None,
                'title': r.title,
                'organization_id': r.organization_id,
                'work_date': r.work_date,
                'start_time': r.start_time,
                'end_time': r.end_time,
                'language_requirement': r.language_requirement,
                'required_qualifications': r.required_qualifications,
                'urgency_level': r.urgency_level,
                'created_at': r.created_at,
                'metrics': metrics,
                'top_match': top_match,
                'assigned_worker': assigned_worker,
            })

        return {'items': items, 'counts': counts, 'next_cursor': next_cursor}
