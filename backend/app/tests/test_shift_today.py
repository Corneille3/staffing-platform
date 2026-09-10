"""Finding #18: "today" is the Québec calendar date, not the UTC one.

conftest pins shift_timezone=UTC so most suites can build shifts relative to
utcnow. These tests flip it to a zone whose calendar date differs from UTC
*right now* — UTC-12 in the UTC morning, UTC+14 in the UTC afternoon — so
every "today" derivation has to follow the zone or the assertion fails,
without freezing the clock.
"""
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from app.core.config import settings
from app.core.timeutil import shift_local_date, shift_midnight_utc, shift_today
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
)
from app.models.staffing_request import StaffingRequest
from app.services.attendance_sweep_service import AttendanceSweepService
from app.services.matching_service import MatchingService


def _offset_zone() -> str:
    """A zone whose local date is not today's UTC date at this very moment.
    POSIX sign convention: Etc/GMT+12 is UTC-12, Etc/GMT-14 is UTC+14."""
    return 'Etc/GMT+12' if datetime.now(timezone.utc).hour < 12 else 'Etc/GMT-14'


@pytest.fixture
def local_today(monkeypatch):
    zone = _offset_zone()
    monkeypatch.setattr(settings, 'shift_timezone', zone)
    today = datetime.now(ZoneInfo(zone)).date()
    assert today != datetime.now(timezone.utc).date(), 'zone must disagree with UTC now'
    return today


def _request(session, seed, work_date, *, status=RequestStatus.ASSIGNED, urgency=1) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=RequestOrigin.COORDINATOR, title='Shift', city='IntTestCity',
        work_date=work_date, start_time=time(12, 0), end_time=time(14, 0), urgency_level=urgency,
    )
    session.add(req)
    session.flush()
    return req


def _confirmed(session, seed, req, worker) -> Assignment:
    assignment = Assignment(
        id=uuid4(), staffing_request_id=req.id, worker_user_id=worker.id,
        assigned_by_user_id=seed.org_admin.id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    session.add(assignment)
    session.flush()
    return assignment


def test_timeutil_today_follows_shift_timezone(local_today):
    now = datetime.now(timezone.utc)
    assert shift_today() == local_today
    assert shift_local_date(now) == local_today
    midnight = shift_midnight_utc(local_today)
    assert midnight.tzinfo == timezone.utc
    assert midnight.astimezone(ZoneInfo(settings.shift_timezone)).time() == time(0, 0)
    assert midnight <= now


def test_dashboard_roster_and_coverage_use_local_today(db_session, seed, org_admin_client, local_today):
    utc_today = datetime.now(timezone.utc).date()
    _confirmed(db_session, seed, _request(db_session, seed, local_today), seed.worker_a)
    _confirmed(db_session, seed, _request(db_session, seed, utc_today), seed.worker_b)

    dash = org_admin_client.get('/api/v1/admin/dashboard').json()
    names = {r['name'] for r in dash['roster_today']}
    assert 'Worker Alpha' in names
    assert 'Worker Beta' not in names  # dated on the UTC "today", not the local one
    assert dash['coverage_forward']['days'][0]['date'] == local_today.isoformat()


def test_org_roster_today_uses_local_today(db_session, seed, org_admin_client, local_today):
    utc_today = datetime.now(timezone.utc).date()
    _confirmed(db_session, seed, _request(db_session, seed, local_today), seed.worker_a)
    _confirmed(db_session, seed, _request(db_session, seed, utc_today), seed.worker_b)

    items = org_admin_client.get('/api/v1/admin/organizations').json()['items']
    site = next(s for s in items if s['id'] == str(seed.org.id))
    assert site['roster_today']['substitutes_arriving'] == 1


def test_same_day_urgent_rule_uses_local_today(db_session, seed, worker_a_client, local_today):
    worker_a_client.patch(
        f'/api/v1/workers/{seed.worker_a.id}/availability', json={'urgent_alert_opt_in': False},
    )
    db_session.refresh(seed.worker_a)
    matching = MatchingService(db_session)
    same_day = _request(db_session, seed, local_today, status=RequestStatus.OPEN)
    tomorrow = _request(db_session, seed, local_today + timedelta(days=1), status=RequestStatus.OPEN)
    assert matching.wants_notification(same_day, seed.worker_a) is False
    assert matching.wants_notification(tomorrow, seed.worker_a) is True


def test_sweep_candidates_bound_on_local_date(db_session, seed, local_today):
    today = _confirmed(db_session, seed, _request(db_session, seed, local_today), seed.worker_a)
    yesterday = _confirmed(
        db_session, seed, _request(db_session, seed, local_today - timedelta(days=1)), seed.worker_b,
    )
    far = _confirmed(
        db_session, seed, _request(db_session, seed, local_today + timedelta(days=2)), seed.worker_a,
    )
    rows = AttendanceSweepService(db_session)._candidates(datetime.now(timezone.utc))
    ids = {row[0].id for row in rows}
    assert today.id in ids
    assert yesterday.id in ids
    assert far.id not in ids
