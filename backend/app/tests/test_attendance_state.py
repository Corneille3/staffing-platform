"""Derived attendance state (app.core.attendance) + its exposure on AssignmentRead."""
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.core.attendance import attendance_state
from app.core.config import settings
from app.models.enums import AssignmentStatus
from app.tests.test_checkout_hours import _assignment, _request


@pytest.fixture(autouse=True)
def _utc_shift_timezone(monkeypatch):
    # conftest pins UTC inside the session-scoped db_engine fixture; the pure
    # tests below don't touch the DB, so pin it here too or wall-clock drifts.
    monkeypatch.setattr(settings, 'shift_timezone', 'UTC')


def _fake(status=AssignmentStatus.CONFIRMED, checked_in=None, checked_out=None, request=None):
    if request is None:
        request = SimpleNamespace(work_date=date(2026, 9, 12), start_time=time(9, 45), end_time=time(9, 55))
    return SimpleNamespace(status=status, checked_in_at=checked_in, checked_out_at=checked_out, staffing_request=request)


def _utc(hh, mm):
    # conftest pins shift_timezone to UTC, so wall-clock == UTC here.
    return datetime(2026, 9, 12, hh, mm, tzinfo=timezone.utc)


def test_never_checked_in_walks_upcoming_due_missed():
    a = _fake()
    assert attendance_state(a, _utc(9, 0)) == 'upcoming'
    assert attendance_state(a, _utc(9, 50)) == 'due'      # started, check-in still open
    assert attendance_state(a, _utc(9, 55)) == 'missed'   # closes exactly at the scheduled end


def test_checked_in_stays_on_shift_until_the_cutoff_then_unclosed():
    a = _fake(checked_in=_utc(9, 46))
    cutoff = _utc(9, 55) + timedelta(minutes=settings.checkout_cutoff_minutes)
    assert attendance_state(a, _utc(10, 0)) == 'on_shift'
    assert attendance_state(a, cutoff - timedelta(seconds=1)) == 'on_shift'
    assert attendance_state(a, cutoff) == 'unclosed'


def test_checked_out_is_completed_whatever_the_clock_says():
    a = _fake(status=AssignmentStatus.COMPLETED, checked_in=_utc(9, 46), checked_out=_utc(9, 54))
    assert attendance_state(a, _utc(9, 0)) == 'completed'
    assert attendance_state(_fake(checked_in=_utc(9, 46), checked_out=_utc(9, 54)), _utc(23, 0)) == 'completed'


def test_cancelled_released_or_orphan_have_no_state():
    assert attendance_state(_fake(status=AssignmentStatus.CANCELLED), _utc(12, 0)) is None
    assert attendance_state(_fake(status=AssignmentStatus.RELEASED), _utc(12, 0)) is None
    assert attendance_state(SimpleNamespace(status=AssignmentStatus.CONFIRMED, checked_in_at=None,
                                            checked_out_at=None, staffing_request=None), _utc(12, 0)) is None


def test_midnight_crossing_shift_is_due_until_its_next_day_end():
    req = SimpleNamespace(work_date=date(2026, 9, 12), start_time=time(22, 0), end_time=time(6, 0))
    a = _fake(request=req)
    assert attendance_state(a, datetime(2026, 9, 13, 5, 0, tzinfo=timezone.utc)) == 'due'
    assert attendance_state(a, datetime(2026, 9, 13, 6, 0, tzinfo=timezone.utc)) == 'missed'


def test_assignment_read_exposes_attendance(db_session, seed, org_admin_client, worker_a_client):
    # A window that spans "now" (helper default) → the worker is due, not missed.
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    db_session.flush()

    rows = org_admin_client.get('/api/v1/assignments').json()['items']
    row = next(r for r in rows if r['id'] == str(assignment.id))
    assert row['attendance'] == 'due'

    # The worker's own listing carries it too (Horaire history + tracking page).
    mine = worker_a_client.get('/api/v1/assignments').json()['items']
    assert next(r for r in mine if r['id'] == str(assignment.id))['attendance'] == 'due'
