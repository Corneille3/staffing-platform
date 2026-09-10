"""Admin dashboard — the coordinator's morning surface (ADMIN_HANDOFF §3).

One round-trip composing: the most-urgent unassigned request, a short live
list, weekly fill KPIs, this-week fill-rate-by-day, today's activity, and the
today roster. Membership-based scoping throughout.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.core.timeutil import shift_midnight_utc, shift_start_utc, shift_today
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    AvailabilityStatus,
    RequestOrigin,
    RequestStatus,
    ResponseStatus,
)
from app.models.request_response import RequestResponse
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
        # "Today" is the Québec calendar date, not the UTC one — after 20:00
        # local the UTC date is already tomorrow and the roster went blank.
        today = shift_today()

        req = self.requests.list_summaries(scope, tab='active', limit=10)
        active = req['items']
        counts = req['counts']

        urgent_now = None
        live = active
        if active and active[0]['urgent'] and active[0]['status'] != 'assigned':
            top = active[0]
            shift_dt = shift_start_utc(top['work_date'], top['start_time'])
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
            'week_fill_rate': self._week_fill_rate(scope, today),
            'roster_today': self._roster_today(scope, today),
            'coverage_forward': self._coverage_forward(scope, today),
        }

    # ── Coverage-risk, next 14 days (SMS spec Feature 2 + CHECKOUT spec §4) ──
    def _coverage_forward(self, scope: AccessScope, today: date) -> dict:
        """Every future gap the system already knows about, per day.

        Buckets per request in [today, today+14):
        - covered: assigned/completed
        - pending_approval: unassigned with ≥1 acceptance — a coordinator pick away
        - released: unassigned replacement (worker release/absence), nobody raised a hand
        - open: unassigned coordinator post, nobody raised a hand
        One round-trip; the window is small enough to bucket in Python.
        """
        window_end = today + timedelta(days=14)
        has_accepted = (
            select(func.count(RequestResponse.id))
            .where(
                RequestResponse.staffing_request_id == StaffingRequest.id,
                RequestResponse.status == ResponseStatus.ACCEPTED,
            )
            .correlate(StaffingRequest)
            .scalar_subquery()
        )
        rows = self.db.execute(
            self.reporting._scope_requests(
                select(StaffingRequest.work_date, StaffingRequest.status,
                       StaffingRequest.origin, has_accepted.label('accepted')),
                scope,
            ).where(
                StaffingRequest.work_date >= today,
                StaffingRequest.work_date < window_end,
                StaffingRequest.status.notin_((
                    RequestStatus.DRAFT, RequestStatus.CANCELLED, RequestStatus.EXPIRED,
                )),
            )
        ).all()

        days = {
            today + timedelta(days=i): {'open': 0, 'released': 0, 'pending_approval': 0, 'covered': 0}
            for i in range(14)
        }
        urgent_48h = 0
        for r in rows:
            if r.status in _FILLED:
                bucket = 'covered'
            elif r.accepted:
                bucket = 'pending_approval'
            elif r.origin != RequestOrigin.COORDINATOR:
                bucket = 'released'
            else:
                bucket = 'open'
            days[r.work_date][bucket] += 1
            if bucket != 'covered' and r.work_date < today + timedelta(days=2):
                urgent_48h += 1

        uncovered_total = sum(
            d['open'] + d['released'] + d['pending_approval'] for d in days.values()
        )
        return {
            'days': [{'date': day, **counts} for day, counts in sorted(days.items())],
            'uncovered_total': uncovered_total,
            'urgent_48h': urgent_48h,
            'not_checked_in_today': self._not_checked_in_count(scope, today),
        }

    def _not_checked_in_count(self, scope: AccessScope, today: date) -> int:
        """CONFIRMED today, past start + grace, no check-in — the "nobody
        arrived" signal a director wants now, not at payroll time (§4)."""
        org_ids = self.requests._scoped_org_ids(scope)
        if not org_ids:
            return 0
        now = datetime.now(timezone.utc)
        rows = self.db.execute(
            select(StaffingRequest.work_date, StaffingRequest.start_time)
            .select_from(Assignment)
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.work_date == today,
                Assignment.status == AssignmentStatus.CONFIRMED,
                Assignment.checked_in_at.is_(None),
            )
        ).all()
        grace = timedelta(minutes=settings.checkin_grace_minutes)
        return sum(1 for r in rows if shift_start_utc(r.work_date, r.start_time) + grace < now)

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
        # Week boundaries at local Monday midnight — created_at is UTC, the
        # week a coordinator means is the Québec one.
        today = shift_today()
        monday = shift_midnight_utc(today - timedelta(days=today.weekday()))
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
    def _week_fill_rate(self, scope: AccessScope, today: date) -> list[int]:
        monday = today - timedelta(days=today.weekday())
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
                StaffingRequest.start_time, StaffingRequest.end_time,
                StaffingRequest.work_date, Assignment.checked_in_at,
                Assignment.checked_out_at, Assignment.status.label('assignment_status'),
            )
            .select_from(Assignment)
            .join(StaffingRequest, StaffingRequest.id == Assignment.staffing_request_id)
            .join(User, User.id == Assignment.worker_user_id)
            .where(
                StaffingRequest.organization_id.in_(org_ids),
                StaffingRequest.work_date == today,
                Assignment.status.in_((AssignmentStatus.CONFIRMED, AssignmentStatus.COMPLETED)),
            )
            .order_by(StaffingRequest.start_time.asc())
        ).all()
        now = datetime.now(timezone.utc)
        grace = timedelta(minutes=settings.checkin_grace_minutes)

        def _row_status(r) -> str:
            if r.assignment_status == AssignmentStatus.COMPLETED or r.checked_out_at is not None:
                return 'done'
            if r.checked_in_at is not None:
                return 'on_site'
            # Past start + grace with no stamp: the absence signal (§4).
            if shift_start_utc(r.work_date, r.start_time) + grace < now:
                return 'not_checked_in'
            return 'arriving'

        return [
            {
                'name': f'{r.first_name} {r.last_name}'.strip(),
                'role': _ROLE_LABEL.get(r.role.value, r.role.value) if r.role else None,
                'starts_at': r.start_time,
                'ends_at': r.end_time,
                'status': _row_status(r),
            }
            for r in rows
        ]
