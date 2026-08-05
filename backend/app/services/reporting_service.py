from datetime import datetime, timedelta, timezone
from uuid import UUID

import sqlalchemy as sa
from fastapi import HTTPException, status
from sqlalchemy import distinct, extract, func, or_, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.enums import AvailabilityStatus, RequestStatus
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_profile import WorkerProfile
from app.models.worker_region import WorkerRegion

_UNFILLED = [RequestStatus.OPEN, RequestStatus.NOTIFIED, RequestStatus.RESPONSES_RECEIVED]
_FILLED = [RequestStatus.ASSIGNED, RequestStatus.COMPLETED]

# Map every audit action emitted by the codebase to a chip-filter bucket.
# Actions not listed here only appear under "all".
_ACTION_FILTER_BUCKETS: dict[str, set[str]] = {
    'assignment.confirmed':         {'assigned'},
    'request_response.accepted':    {'assigned'},
    'staffing_request.cancelled':   {'cancelled'},
    'assignment.cancelled':         {'cancelled'},
    'request_response.declined':    {'cancelled'},
    'request_response.withdrawn':   {'cancelled'},
    'staffing_request.renotified':  {'escalated'},
    'coordinator.invited':          {'invitations'},
    'worker.invited':               {'invitations'},
    'tenant.removed':               {'removals'},
    'user.removed':                 {'removals'},
}


def _buckets_for(action: str) -> set[str]:
    return _ACTION_FILTER_BUCKETS.get(action, set())


# Admin/coordinator activity taxonomy (ADMIN_ORG_HISTORY_HANDOFF §3.4) — a
# request-lifecycle view, distinct from the APF network buckets above.
_ADMIN_ACTION_BUCKETS: dict[str, set[str]] = {
    'staffing_request.published':  {'posted'},
    'request_response.accepted':   {'accepted'},
    'request_response.declined':   {'declined'},
    'assignment.confirmed':        {'assigned'},
    'staffing_request.completed':  {'completed'},
    'staffing_request.cancelled':  {'cancelled'},
    'assignment.cancelled':        {'cancelled'},
    'worker.invited':              {'invited'},
    'coordinator.invited':         {'invited'},
}
_ADMIN_BUCKETS = ('posted', 'accepted', 'declined', 'assigned', 'completed', 'cancelled', 'expired', 'invited')


def _admin_buckets_for(action: str) -> set[str]:
    return _ADMIN_ACTION_BUCKETS.get(action, set())


class ReportingService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _tenant_org_subq(self, tenant_id):
        return select(Organization.id).where(Organization.tenant_id == tenant_id)

    def _scope_requests(self, stmt, scope: AccessScope):
        if scope.is_platform_admin or scope.is_network_admin:
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
        if (scope.is_platform_admin or scope.is_network_admin) and scope.tenant_id:
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
        if (scope.is_platform_admin or scope.is_network_admin) and scope.tenant_id:
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

    def _scope_org_filter(self, scope: AccessScope):
        """Return a SQLAlchemy filter clause that limits Organization rows to the scope."""
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return sa.false()
            return Organization.tenant_id == scope.tenant_id
        if scope.org_ids:
            return Organization.id.in_(scope.org_ids)
        return sa.false()

    def apf_snapshot(self, scope: AccessScope) -> dict:
        """Aggregate everything the APF dashboard needs in a single service call.

        Returns kpis + status_breakdown + shortage_cities + org_activity. Callers
        upstream (api/v1/apf.py) memoize per-tenant for 60s; this method itself
        does no caching so tests can hit it deterministically.
        """
        overview = self.network_overview(scope)

        org_filter = self._scope_org_filter(scope)

        orgs = self.db.scalars(
            select(Organization)
            .where(org_filter, Organization.is_active.is_(True))
            .order_by(Organization.name)
        ).all()

        if not orgs:
            org_rollup_rows: list[tuple] = []
        else:
            org_rollup_rows = self.db.execute(
                select(
                    StaffingRequest.organization_id,
                    StaffingRequest.status,
                    func.count(),
                )
                .where(StaffingRequest.organization_id.in_([o.id for o in orgs]))
                .group_by(StaffingRequest.organization_id, StaffingRequest.status)
            ).all()

        # Roll up { org_id: { status: count } }
        per_org: dict = {o.id: {'total': 0, 'filled': 0, 'open': 0} for o in orgs}
        for org_id, status_val, count in org_rollup_rows:
            row = per_org[org_id]
            row['total'] += count
            if status_val in _FILLED:
                row['filled'] += count
            elif status_val in _UNFILLED:
                row['open'] += count

        org_activity = [
            {
                'id': o.id,
                'name': o.name,
                'city': o.city,
                'region': o.region,
                'type': o.type.value if hasattr(o.type, 'value') else str(o.type),
                **per_org[o.id],
            }
            for o in orgs
        ]
        # Most active first
        org_activity.sort(key=lambda r: r['total'], reverse=True)

        org_name_by_id = {o.id: o.name for o in orgs}

        closed_statuses = [
            RequestStatus.ASSIGNED,
            RequestStatus.COMPLETED,
            RequestStatus.CANCELLED,
            RequestStatus.EXPIRED,
        ]
        recent_closed = self.db.execute(
            self._scope_requests(
                select(
                    StaffingRequest.id,
                    StaffingRequest.title,
                    StaffingRequest.status,
                    StaffingRequest.city,
                    StaffingRequest.work_date,
                    StaffingRequest.organization_id,
                ).where(StaffingRequest.status.in_(closed_statuses)),
                scope,
            )
            .order_by(StaffingRequest.created_at.desc())
            .limit(8)
        ).all()

        recent_closed_requests = [
            {
                'id': r.id,
                'title': r.title,
                'status': r.status.value if hasattr(r.status, 'value') else str(r.status),
                'city': r.city,
                'work_date': r.work_date,
                'organization_id': r.organization_id,
                'organization_name': org_name_by_id.get(r.organization_id),
            }
            for r in recent_closed
        ]

        return {
            'kpis': {
                'total_requests': overview['total_requests'],
                'filled_count': overview['filled_count'],
                'fill_rate': overview['fill_rate'],
                'active_substitutes': overview['active_substitutes'],
                'unfilled_count': overview['unfilled_count'],
                'avg_fill_hours': overview['avg_fill_hours'],
                'organizations_count': len(orgs),
            },
            'status_breakdown': overview['status_breakdown'],
            'shortage_cities': overview['shortage_cities'],
            'org_activity': org_activity,
            'recent_closed_requests': recent_closed_requests,
        }

    def _scope_audit_logs(self, stmt, scope: AccessScope):
        """Limit audit logs to ones visible to this APF tenant.

        A log is in-scope if:
          1. organization_id is in the tenant's orgs, OR
          2. actor_user_id has a TenantMembership to this tenant (covers
             admin-level events like coordinator.invited where organization_id
             is null), OR
          3. entity_type='tenant' AND entity_id=tenant.id (covers tenant.created/removed).
        """
        if scope.is_platform_admin or scope.is_network_admin:
            if not scope.tenant_id:
                return stmt.where(sa.false())
            tenant_org_subq = self._tenant_org_subq(scope.tenant_id)
            tenant_member_subq = select(TenantMembership.user_id).where(
                TenantMembership.tenant_id == scope.tenant_id
            )
            return stmt.where(
                or_(
                    AuditLog.organization_id.in_(tenant_org_subq),
                    AuditLog.actor_user_id.in_(tenant_member_subq),
                    sa.and_(
                        AuditLog.entity_type == 'tenant',
                        AuditLog.entity_id == scope.tenant_id,
                    ),
                )
            )
        if scope.org_ids:
            return stmt.where(AuditLog.organization_id.in_(scope.org_ids))
        return stmt.where(sa.false())

    def apf_activity(
        self,
        scope: AccessScope,
        filter_bucket: str = 'all',
        cursor: datetime | None = None,
        limit: int = 50,
        org_id: UUID | None = None,
    ) -> dict:
        """Cursor-paginated audit feed for the APF activity page.

        Returns rows scoped to the caller's tenant, optionally filtered to a
        single chip bucket and/or one organization. Counts reflect the org
        filter when applied so the chips show counts in-context.
        """
        limit = max(1, min(limit, 100))

        if org_id is not None:
            # Caller must have access to this org via tenant scope.
            org = self.db.get(Organization, org_id)
            if org is None or (
                (scope.is_platform_admin or scope.is_network_admin)
                and org.tenant_id != scope.tenant_id
            ):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail='You do not have access to this organization.',
                )

        # Counts per bucket — one scan, all buckets at once. Applies org filter if set.
        scoped_counts_stmt = self._scope_audit_logs(
            select(AuditLog.action, func.count()).group_by(AuditLog.action), scope,
        )
        if org_id is not None:
            scoped_counts_stmt = scoped_counts_stmt.where(AuditLog.organization_id == org_id)
        action_counts = {row[0]: row[1] for row in self.db.execute(scoped_counts_stmt).all()}
        counts = {
            'all': sum(action_counts.values()),
            'assigned': 0,
            'cancelled': 0,
            'escalated': 0,
            'invitations': 0,
            'removals': 0,
        }
        for action, count in action_counts.items():
            for bucket in _buckets_for(action):
                counts[bucket] += count

        # Page query.
        page_stmt = self._scope_audit_logs(select(AuditLog), scope)
        if org_id is not None:
            page_stmt = page_stmt.where(AuditLog.organization_id == org_id)
        if filter_bucket != 'all':
            allowed_actions = [
                action for action in _ACTION_FILTER_BUCKETS
                if filter_bucket in _ACTION_FILTER_BUCKETS[action]
            ]
            if not allowed_actions:
                page_stmt = page_stmt.where(sa.false())
            else:
                page_stmt = page_stmt.where(AuditLog.action.in_(allowed_actions))

        if cursor is not None:
            page_stmt = page_stmt.where(AuditLog.created_at < cursor)

        # Fetch limit+1 to detect whether more pages exist.
        rows = list(
            self.db.scalars(
                page_stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit + 1)
            ).all()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = rows[-1].created_at if has_more and rows else None

        # Eager-load actor + organization + resolve request_title.
        actor_ids = {r.actor_user_id for r in rows if r.actor_user_id is not None}
        org_ids = {r.organization_id for r in rows if r.organization_id is not None}
        request_ids: set[UUID] = set()
        for r in rows:
            if r.entity_type == 'staffing_request' and r.entity_id is not None:
                request_ids.add(r.entity_id)
            payload_req = r.payload.get('staffing_request_id') if isinstance(r.payload, dict) else None
            if payload_req:
                try:
                    request_ids.add(UUID(str(payload_req)))
                except (ValueError, TypeError):
                    pass

        actors_by_id = {}
        if actor_ids:
            for user in self.db.scalars(select(User).where(User.id.in_(actor_ids))).all():
                actors_by_id[user.id] = {
                    'id': user.id,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'role': user.role.value if hasattr(user.role, 'value') else str(user.role),
                }

        orgs_by_id = {}
        if org_ids:
            for org in self.db.scalars(select(Organization).where(Organization.id.in_(org_ids))).all():
                orgs_by_id[org.id] = {'id': org.id, 'name': org.name}

        titles_by_id: dict[UUID, str] = {}
        if request_ids:
            for sr_id, title in self.db.execute(
                select(StaffingRequest.id, StaffingRequest.title).where(
                    StaffingRequest.id.in_(request_ids)
                )
            ).all():
                titles_by_id[sr_id] = title

        items = []
        for r in rows:
            sr_id = None
            if r.entity_type == 'staffing_request' and r.entity_id is not None:
                sr_id = r.entity_id
            elif isinstance(r.payload, dict):
                payload_req = r.payload.get('staffing_request_id')
                if payload_req:
                    try:
                        sr_id = UUID(str(payload_req))
                    except (ValueError, TypeError):
                        sr_id = None
            items.append({
                'id': r.id,
                'created_at': r.created_at,
                'action': r.action,
                'entity_type': r.entity_type,
                'entity_id': r.entity_id,
                'actor': actors_by_id.get(r.actor_user_id) if r.actor_user_id else None,
                'organization': orgs_by_id.get(r.organization_id) if r.organization_id else None,
                'payload': r.payload if isinstance(r.payload, dict) else {},
                'request_title': titles_by_id.get(sr_id) if sr_id else None,
            })

        return {
            'items': items,
            'next_cursor': next_cursor,
            'counts': counts,
        }

    def _activity_org_ids(self, scope: AccessScope) -> list[UUID]:
        if scope.org_ids:
            return list(scope.org_ids)
        if (scope.is_platform_admin or scope.is_network_admin) and scope.tenant_id:
            return list(self.db.scalars(self._tenant_org_subq(scope.tenant_id)))
        return []

    def _resolve_activity_items(self, rows: list) -> list[dict]:
        """Eager-load actor + organization + request_title for a page of audit
        rows and shape them into ActivityRow dicts."""
        actor_ids = {r.actor_user_id for r in rows if r.actor_user_id is not None}
        org_ids = {r.organization_id for r in rows if r.organization_id is not None}
        request_ids: set[UUID] = set()
        for r in rows:
            if r.entity_type == 'staffing_request' and r.entity_id is not None:
                request_ids.add(r.entity_id)
            payload_req = r.payload.get('staffing_request_id') if isinstance(r.payload, dict) else None
            if payload_req:
                try:
                    request_ids.add(UUID(str(payload_req)))
                except (ValueError, TypeError):
                    pass

        actors_by_id = {}
        if actor_ids:
            for user in self.db.scalars(select(User).where(User.id.in_(actor_ids))).all():
                actors_by_id[user.id] = {
                    'id': user.id,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'role': user.role.value if hasattr(user.role, 'value') else str(user.role),
                }
        orgs_by_id = {}
        if org_ids:
            for org in self.db.scalars(select(Organization).where(Organization.id.in_(org_ids))).all():
                orgs_by_id[org.id] = {'id': org.id, 'name': org.name}
        titles_by_id: dict[UUID, str] = {}
        if request_ids:
            for sr_id, title in self.db.execute(
                select(StaffingRequest.id, StaffingRequest.title).where(StaffingRequest.id.in_(request_ids))
            ).all():
                titles_by_id[sr_id] = title

        items = []
        for r in rows:
            sr_id = None
            if r.entity_type == 'staffing_request' and r.entity_id is not None:
                sr_id = r.entity_id
            elif isinstance(r.payload, dict):
                payload_req = r.payload.get('staffing_request_id')
                if payload_req:
                    try:
                        sr_id = UUID(str(payload_req))
                    except (ValueError, TypeError):
                        sr_id = None
            items.append({
                'id': r.id,
                'created_at': r.created_at,
                'action': r.action,
                'entity_type': r.entity_type,
                'entity_id': r.entity_id,
                'actor': actors_by_id.get(r.actor_user_id) if r.actor_user_id else None,
                'organization': orgs_by_id.get(r.organization_id) if r.organization_id else None,
                'payload': r.payload if isinstance(r.payload, dict) else {},
                'request_title': titles_by_id.get(sr_id) if sr_id else None,
            })
        return items

    def _admin_activity_kpis(
        self, scope: AccessScope, site_id, since, until,
    ) -> dict:
        def _f(stmt):
            stmt = self._scope_requests(stmt, scope)
            if site_id is not None:
                stmt = stmt.where(StaffingRequest.organization_id == site_id)
            if since is not None:
                stmt = stmt.where(StaffingRequest.created_at >= since)
            if until is not None:
                stmt = stmt.where(StaffingRequest.created_at <= until)
            return stmt

        # "Posted" = requests that actually left draft (drafts were never posted).
        posted = self.db.scalar(
            _f(select(func.count()).select_from(StaffingRequest).where(StaffingRequest.status != RequestStatus.DRAFT))
        ) or 0
        filled = self.db.scalar(
            _f(select(func.count()).select_from(StaffingRequest).where(StaffingRequest.status.in_(_FILLED)))
        ) or 0
        cancelled = self.db.scalar(
            _f(select(func.count()).select_from(StaffingRequest).where(StaffingRequest.status == RequestStatus.CANCELLED))
        ) or 0
        expired = self.db.scalar(
            _f(select(func.count()).select_from(StaffingRequest).where(StaffingRequest.status == RequestStatus.EXPIRED))
        ) or 0
        avg_seconds = self.db.scalar(
            _f(
                select(func.avg(func.extract('epoch', StaffingRequest.assigned_at - StaffingRequest.created_at)))
                .select_from(StaffingRequest)
                .where(StaffingRequest.assigned_at.isnot(None))
            )
        )
        sites = 1 if site_id is not None else len(self._activity_org_ids(scope))
        return {
            'posted': posted,
            'filled': filled,
            'cancelled': cancelled,
            'expired': expired,
            'fill_rate': round(100 * filled / posted) if posted else 0,
            'avg_time_to_fill_minutes': int(avg_seconds / 60) if avg_seconds else None,
            'sites': sites,
        }

    def admin_activity(
        self,
        scope: AccessScope,
        filter_bucket: str = 'all',
        cursor: datetime | None = None,
        limit: int = 50,
        site_id: UUID | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> dict:
        """Coordinator audit timeline (ADMIN_ORG_HISTORY_HANDOFF §3) — same
        audit_logs table as APF activity, scoped to the caller's sites
        (AccessScope.org_ids), with the request-lifecycle bucket taxonomy,
        a KPI strip, optional site + date-range filters, and cursor paging."""
        limit = max(1, min(limit, 100))

        if site_id is not None and site_id not in set(self._activity_org_ids(scope)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You do not have access to this site.',
            )

        def _filtered(stmt):
            stmt = self._scope_audit_logs(stmt, scope)
            if site_id is not None:
                stmt = stmt.where(AuditLog.organization_id == site_id)
            if since is not None:
                stmt = stmt.where(AuditLog.created_at >= since)
            if until is not None:
                stmt = stmt.where(AuditLog.created_at <= until)
            return stmt

        # Facet counts (in-context with site/date filters), one scan.
        action_counts = {
            row[0]: row[1]
            for row in self.db.execute(
                _filtered(select(AuditLog.action, func.count()).group_by(AuditLog.action))
            ).all()
        }
        counts = {'all': sum(action_counts.values())}
        for bucket in _ADMIN_BUCKETS:
            counts[bucket] = 0
        for action, count in action_counts.items():
            for bucket in _admin_buckets_for(action):
                counts[bucket] += count

        page_stmt = _filtered(select(AuditLog))
        if filter_bucket != 'all':
            allowed = [a for a in _ADMIN_ACTION_BUCKETS if filter_bucket in _ADMIN_ACTION_BUCKETS[a]]
            page_stmt = page_stmt.where(AuditLog.action.in_(allowed)) if allowed else page_stmt.where(sa.false())
        if cursor is not None:
            page_stmt = page_stmt.where(AuditLog.created_at < cursor)

        rows = list(
            self.db.scalars(
                page_stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit + 1)
            ).all()
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = rows[-1].created_at if has_more and rows else None

        return {
            'items': self._resolve_activity_items(rows),
            'next_cursor': next_cursor,
            'counts': counts,
            'kpis': self._admin_activity_kpis(scope, site_id, since, until),
        }

    def org_snapshot(self, scope: AccessScope, org_id: UUID) -> dict:
        """Org-level snapshot for the APF drill-in page.

        Same shape spirit as apf_snapshot but scoped to one organization. Raises
        403 if the org is not in the caller's tenant scope.
        """
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='Organization not found.',
            )
        if scope.is_platform_admin or scope.is_network_admin:
            if org.tenant_id != scope.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail='You do not have access to this organization.',
                )
        elif org_id not in scope.org_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You do not have access to this organization.',
            )

        total_requests = self.db.scalar(
            select(func.count()).select_from(StaffingRequest)
            .where(StaffingRequest.organization_id == org_id)
        ) or 0
        filled_count = self.db.scalar(
            select(func.count()).select_from(StaffingRequest)
            .where(
                StaffingRequest.organization_id == org_id,
                StaffingRequest.status.in_(_FILLED),
            )
        ) or 0
        unfilled_count = self.db.scalar(
            select(func.count()).select_from(StaffingRequest)
            .where(
                StaffingRequest.organization_id == org_id,
                StaffingRequest.status.in_(_UNFILLED),
            )
        ) or 0
        fill_rate = round(filled_count / total_requests * 100) if total_requests else 0

        avg_raw = self.db.scalar(
            select(func.avg(
                extract('epoch', Assignment.assigned_at - StaffingRequest.created_at) / 3600
            ))
            .select_from(Assignment)
            .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
            .where(
                StaffingRequest.organization_id == org_id,
                Assignment.status != 'cancelled',
            )
        )
        avg_fill_hours = round(float(avg_raw), 1) if avg_raw is not None else None

        # Active substitutes who cover this org's city.
        active_in_city = self.db.scalar(
            select(func.count(distinct(WorkerProfile.id)))
            .select_from(WorkerProfile)
            .join(WorkerRegion, WorkerRegion.worker_profile_id == WorkerProfile.id)
            .where(
                WorkerProfile.availability_status == AvailabilityStatus.AVAILABLE,
                WorkerRegion.city == org.city,
            )
        ) or 0

        status_rows = self.db.execute(
            select(StaffingRequest.status, func.count())
            .select_from(StaffingRequest)
            .where(StaffingRequest.organization_id == org_id)
            .group_by(StaffingRequest.status)
        ).all()
        status_breakdown = {
            (row[0].value if hasattr(row[0], 'value') else str(row[0])): row[1]
            for row in status_rows
        }

        closed_statuses = [
            RequestStatus.ASSIGNED,
            RequestStatus.COMPLETED,
            RequestStatus.CANCELLED,
            RequestStatus.EXPIRED,
        ]
        recent_closed = self.db.execute(
            select(
                StaffingRequest.id,
                StaffingRequest.title,
                StaffingRequest.status,
                StaffingRequest.city,
                StaffingRequest.work_date,
                StaffingRequest.created_at,
            )
            .where(
                StaffingRequest.organization_id == org_id,
                StaffingRequest.status.in_(closed_statuses),
            )
            .order_by(StaffingRequest.created_at.desc())
            .limit(8)
        ).all()
        upcoming_open = self.db.execute(
            select(
                StaffingRequest.id,
                StaffingRequest.title,
                StaffingRequest.status,
                StaffingRequest.city,
                StaffingRequest.work_date,
                StaffingRequest.created_at,
            )
            .where(
                StaffingRequest.organization_id == org_id,
                StaffingRequest.status.in_(_UNFILLED),
            )
            .order_by(StaffingRequest.work_date.asc())
            .limit(8)
        ).all()

        def _row(r) -> dict:
            return {
                'id': r.id,
                'title': r.title,
                'status': r.status.value if hasattr(r.status, 'value') else str(r.status),
                'city': r.city,
                'work_date': r.work_date,
                'created_at': r.created_at,
            }

        return {
            'id': org.id,
            'name': org.name,
            'type': org.type.value if hasattr(org.type, 'value') else str(org.type),
            'city': org.city,
            'region': org.region,
            'contact_email': org.contact_email,
            'contact_phone': org.contact_phone,
            'preferred_language': org.preferred_language,
            'is_active': org.is_active,
            'kpis': {
                'total_requests': total_requests,
                'filled_count': filled_count,
                'fill_rate': fill_rate,
                'unfilled_count': unfilled_count,
                'avg_fill_hours': avg_fill_hours,
                'active_substitutes_in_city': active_in_city,
            },
            'status_breakdown': status_breakdown,
            'recent_closed_requests': [_row(r) for r in recent_closed],
            'upcoming_open_requests': [_row(r) for r in upcoming_open],
        }

    def network_pool(self, scope: AccessScope) -> dict:
        """Aggregate for the APF NetworkPool page (NETWORK_HANDOFF.md §7.3).

        Returns KPI bento + per-city distribution + top contributors. The
        substitute population is scoped via TenantMembership (workers belong
        to a tenant, not a specific org).
        """
        if not ((scope.is_platform_admin or scope.is_network_admin) and scope.tenant_id):
            return {
                'kpis': {
                    'total': 0, 'available_now': 0, 'multi_org_pct': 0,
                    'avg_reliability': 0, 'shortage_cities_count': 0,
                },
                'distribution': [],
                'top_contributors': [],
            }

        tenant_id = scope.tenant_id

        # Active workers in this tenant (with profile).
        worker_rows = self.db.execute(
            select(User, WorkerProfile)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .join(WorkerProfile, WorkerProfile.user_id == User.id)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.is_active.is_(True),
                User.role == 'worker',
                User.is_active.is_(True),
            )
        ).all()
        workers_by_id = {u.id: (u, p) for u, p in worker_rows}
        worker_ids = list(workers_by_id.keys())
        profile_ids = [p.id for _, p in worker_rows]

        total = len(worker_ids)
        available_now = sum(
            1 for _, p in worker_rows
            if p.availability_status == AvailabilityStatus.AVAILABLE
        )

        avg_reliability = (
            round(sum(p.reliability for _, p in worker_rows) / total) if total else 0
        )

        # Cities + languages.
        city_rows = self.db.execute(
            select(WorkerRegion.worker_profile_id, WorkerRegion.city)
            .where(WorkerRegion.worker_profile_id.in_(profile_ids))
        ).all() if profile_ids else []
        cities_by_profile: dict[UUID, list[str]] = {}
        for prof_id, city in city_rows:
            cities_by_profile.setdefault(prof_id, []).append(city)

        # Distribution per city.
        city_to_workers: dict[str, list[tuple]] = {}
        for u, p in worker_rows:
            for city in cities_by_profile.get(p.id, []):
                city_to_workers.setdefault(city, []).append((u, p))
        distribution: list[dict] = []
        for city, entries in city_to_workers.items():
            total_c = len(entries)
            avail_c = sum(1 for _, p in entries if p.availability_status == AvailabilityStatus.AVAILABLE)
            pct = round((avail_c / total_c) * 100) if total_c else 0
            langs = sorted({u.preferred_language for u, _ in entries})
            distribution.append({
                'city': city,
                'total': total_c,
                'available': avail_c,
                'coverage_pct': max(0, min(100, pct)),
                'languages': langs,
            })
        distribution.sort(key=lambda r: r['total'], reverse=True)

        # Shifts last 30 days + distinct orgs per worker.
        cutoff_30 = datetime.now(timezone.utc) - timedelta(days=30)
        org_per_worker: dict[UUID, set[UUID]] = {}
        shifts_per_worker: dict[UUID, int] = {}
        if worker_ids:
            shift_rows = self.db.execute(
                select(
                    Assignment.worker_user_id,
                    StaffingRequest.organization_id,
                    func.count().label('shifts'),
                )
                .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
                .where(
                    Assignment.worker_user_id.in_(worker_ids),
                    Assignment.assigned_at >= cutoff_30,
                )
                .group_by(Assignment.worker_user_id, StaffingRequest.organization_id)
            ).all()
            for worker_id, org_id, shifts in shift_rows:
                org_per_worker.setdefault(worker_id, set()).add(org_id)
                shifts_per_worker[worker_id] = shifts_per_worker.get(worker_id, 0) + shifts

        multi_org = sum(1 for v in org_per_worker.values() if len(v) >= 2)
        multi_org_pct = round((multi_org / total) * 100) if total else 0

        # Shortage cities reused from overview.
        overview = self.network_overview(scope)
        shortage_cities_count = len(overview['shortage_cities'])

        # Top contributors: order by shifts_30d desc, then reliability desc.
        contributor_rows: list[dict] = []
        for u, p in worker_rows:
            shifts = shifts_per_worker.get(u.id, 0)
            org_count = len(org_per_worker.get(u.id, set()))
            contributor_rows.append({
                'id': u.id,
                'first_name': u.first_name,
                'last_name': u.last_name,
                'cities': cities_by_profile.get(p.id, []),
                'role': u.role.value if hasattr(u.role, 'value') else str(u.role),
                'org_count': org_count,
                'shifts_30d': shifts,
                'languages': [u.preferred_language],
                'reliability': p.reliability,
            })
        contributor_rows.sort(
            key=lambda r: (r['shifts_30d'], r['reliability']),
            reverse=True,
        )
        top_contributors = contributor_rows[:20]

        return {
            'kpis': {
                'total': total,
                'available_now': available_now,
                'multi_org_pct': max(0, min(100, multi_org_pct)),
                'avg_reliability': max(0, min(100, avg_reliability)),
                'shortage_cities_count': shortage_cities_count,
            },
            'distribution': distribution,
            'top_contributors': top_contributors,
        }

    def network_summary(self, scope: AccessScope) -> dict[str, int]:
        org_count_stmt = select(func.count()).select_from(Organization)
        request_stmt = select(func.count()).select_from(StaffingRequest)
        assignment_stmt = (
            select(func.count())
            .select_from(Assignment)
            .join(StaffingRequest, Assignment.staffing_request_id == StaffingRequest.id)
        )

        if scope.is_platform_admin or scope.is_network_admin:
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
        if scope.is_platform_admin or scope.is_network_admin:
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
