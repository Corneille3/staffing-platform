"""Admin dashboard — the coordinator's morning surface (ADMIN_HANDOFF §3).

One round-trip composing: the most-urgent unassigned request, a short live
list, weekly fill KPIs, this-week fill-rate-by-day, today's activity, and the
today roster. Membership-based scoping throughout.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.assignment import Assignment
from app.models.enums import AssignmentStatus, AvailabilityStatus, RequestStatus
from app.models.staffing_request import StaffingRequest
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_profile import WorkerProfile
from app.services.admin_request_service import AdminRequestService
from app.services.reporting_service import ReportingService

_FILLED = (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)
_ROLE_LABEL = {
    'educator': 'Educator',
    'assistant_educator': 'Assistant educator',
    'psw': 'PSW',
    'nurse': 'Nurse',
    'food_handler': 'Food handler',
    'other': 'Staff',
}


def _humanize(delta: timedelta, *, future: bool) -> str:
    secs = int(delta.total_seconds())
    if secs < 0:
        return "now" if future else "just now"
    mins = secs // 60
    if mins < 60:
        v = f"{mins}m"
    elif mins < 60 * 24:
        h = mins // 60
        m = mins % 60
        v = f"{h}h{m}" if m else f"{h}h"
    else:
        v = f"{mins // (60 * 24)}d"
    return f"in {v}" if future else f"{v} ago"


class AdminDashboardService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.requests = AdminRequestService(db)
        self.reporting = ReportingService(db)

    def build(self, scope: AccessScope) -> dict:
        now = datetime.now(timezone.utc)

        req = self.requests.list_summaries(scope, tab='active', limit=10)
        active = req['items']
        counts = req['counts']

        urgent_now = None
        live = active
        if active and active[0]['urgent'] and active[0]['status'] != 'assigned':
            top = active[0]
            shift_dt = datetime.combine(top['work_date'], top['start_time'], tzinfo=timezone.utc)
            urgent_now = {
                **top,
                'elapsed': _humanize(now - top['created_at'], future=False),
                'starts_in': _humanize(shift_dt - now, future=True),
            }
            live = active[1:]
        live = live[:4]

        return {
            'coordinator': {'first_name': scope.user.first_name},
            'urgent_now': urgent_now,
            'kpis': self._kpis(scope, counts['active']),
            'live_requests': live,
            'activity_today': self.reporting.admin_activity(scope, limit=5)['items'],
            'week_fill_rate': self._week_fill_rate(scope, now),
            'roster_today': self._roster_today(scope, now.date()),
        }

    # ── KPIs ────────────────────────────────────────────────────────────────
    def _fill_rate_created_between(self, scope: AccessScope, start: datetime, end: datetime) -> int | None:
        def _f(stmt):
            return self.reporting._scope_requests(stmt, scope).where(
                StaffingRequest.created_at >= start, StaffingRequest.created_at < end,
                StaffingRequest.status != RequestStatus.DRAFT,
            )
        posted = self.db.scalar(_f(select(func.count()).select_from(StaffingRequest))) or 0
        if not posted:
            return None
        filled = self.db.scalar(
            _f(select(func.count()).select_from(StaffingRequest)).where(StaffingRequest.status.in_(_FILLED))
        ) or 0
        return round(100 * filled / posted)

    def _kpis(self, scope: AccessScope, open_count: int) -> dict:
        now = datetime.now(timezone.utc)
        monday = datetime.combine(now.date() - timedelta(days=now.weekday()), time(), tzinfo=timezone.utc)
        this_week = self._fill_rate_created_between(scope, monday, monday + timedelta(days=7))
        last_week = self._fill_rate_created_between(scope, monday - timedelta(days=7), monday)

        avg_seconds = self.db.scalar(
            self.reporting._scope_requests(
                select(func.avg(func.extract('epoch', StaffingRequest.assigned_at - StaffingRequest.created_at)))
                .select_from(StaffingRequest),
                scope,
            ).where(StaffingRequest.assigned_at.isnot(None))
        )

        subs = 0
        if scope.tenant_id:
            subs = self.db.scalar(
                select(func.count())
                .select_from(WorkerProfile)
                .join(User, WorkerProfile.user_id == User.id)
                .join(TenantMembership, TenantMembership.user_id == User.id)
                .where(
                    WorkerProfile.availability_status == AvailabilityStatus.AVAILABLE,
                    TenantMembership.tenant_id == scope.tenant_id,
                    TenantMembership.is_active.is_(True),
                )
            ) or 0

        assigned_count = self.db.scalar(
            self.reporting._scope_requests(
                select(func.count()).select_from(StaffingRequest), scope,
            ).where(StaffingRequest.status == RequestStatus.ASSIGNED)
        ) or 0

        return {
            'fill_rate_week': this_week or 0,
            'fill_rate_delta': (this_week - last_week) if (this_week is not None and last_week is not None) else 0,
            'avg_time_to_fill_minutes': int(avg_seconds / 60) if avg_seconds else None,
            'open_count': open_count,
            'assigned_count': assigned_count,
            'substitutes_ready': subs,
        }

    # ── This-week fill rate by day (Mon..Sun, by shift work_date) ────────────
    def _week_fill_rate(self, scope: AccessScope, now: datetime) -> list[int]:
        monday = now.date() - timedelta(days=now.weekday())
        out: list[int] = []
        for i in range(7):
            day = monday + timedelta(days=i)
            base = self.reporting._scope_requests(
                select(func.count()).select_from(StaffingRequest), scope,
            ).where(StaffingRequest.work_date == day, StaffingRequest.status != RequestStatus.DRAFT)
            total = self.db.scalar(base) or 0
            if not total:
                out.append(0)
                continue
            filled = self.db.scalar(base.where(StaffingRequest.status.in_(_FILLED))) or 0
            out.append(round(100 * filled / total))
        return out

    # ── Today roster ────────────────────────────────────────────────────────
    def _roster_today(self, scope: AccessScope, today: date) -> list[dict]:
        org_ids = self.requests._scoped_org_ids(scope)
        if not org_ids:
            return []
        rows = self.db.execute(
            select(
                User.first_name, User.last_name, StaffingRequest.role,
                StaffingRequest.start_time, StaffingRequest.end_time, Assignment.checked_in_at,
            )
            .select_from(Assignment)
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .join(User, User.id == Assignment.worker_user_id)
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.work_date == today,
                Assignment.status == AssignmentStatus.CONFIRMED,
            )
            .order_by(StaffingRequest.start_time.asc())
        ).all()
        return [
            {
                'name': f'{r.first_name} {r.last_name}'.strip(),
                'role': _ROLE_LABEL.get(r.role.value, r.role.value) if r.role else None,
                'starts_at': r.start_time,
                'ends_at': r.end_time,
                'status': 'on_site' if r.checked_in_at is not None else 'arriving',
            }
            for r in rows
        ]
