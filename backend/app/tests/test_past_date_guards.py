"""Past-date guards (2026-06-10): broadcasting coverage for an ended shift is
always a mistake — a prod absence sat 'searching' for a day before the sweep
existed to clean it. The guard is keyed on the shift END so mid-shift urgent
coverage (the 8h05 no-show covered at 8h30) stays allowed.

conftest pins shift_timezone=UTC, so shifts are built relative to utcnow.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.auth.scope import AccessScope
from app.core.config import settings
from app.core.timeutil import shift_end_utc
from app.models.assignment import Assignment
from app.models.enums import (
    AssignmentStatus,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
)
from app.models.staffing_request import StaffingRequest
from app.services.replacement_service import ReplacementService
from app.services.staffing_request_service import StaffingRequestService
from app.tests.conftest import request_payload


def _request_row(session, seed, *, starts_in: timedelta, lasts: timedelta,
                 status=RequestStatus.DRAFT, origin=RequestOrigin.COORDINATOR) -> StaffingRequest:
    """A request whose shift runs [now+starts_in, now+starts_in+lasts]. The
    end<=start overnight convention makes midnight crossings work out."""
    start = datetime.now(timezone.utc) + starts_in
    end = start + lasts
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=origin,
        title='Garde-fou', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=end.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    return req


# ── coordinator path: publish / renotify ─────────────────────────────────────

def test_publish_rejects_ended_shift(apf_client, seed):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    rid = apf_client.post(
        '/api/v1/requests',
        json=request_payload(seed.org.id, seed.apf.id, work_date=yesterday),
    ).json()['id']  # drafts may hold any date — the guard fires at broadcast

    resp = apf_client.post(f'/api/v1/requests/{rid}/publish')

    assert resp.status_code == 409
    assert 'already ended' in resp.json()['detail']


def test_publish_allows_mid_shift_urgent_coverage(db_session, seed):
    """Started 2 h ago, runs 2 more hours — the no-show scenario must publish."""
    req = _request_row(
        db_session, seed, starts_in=timedelta(hours=-2), lasts=timedelta(hours=4),
    )

    published = StaffingRequestService(db_session).publish(req.id)

    assert published.status == RequestStatus.NOTIFIED


def test_renotify_rejects_ended_shift(db_session, seed):
    req = _request_row(
        db_session, seed, starts_in=timedelta(days=2), lasts=timedelta(hours=8),
        status=RequestStatus.NOTIFIED,
    )
    req.work_date = date.today() - timedelta(days=1)
    db_session.flush()

    with pytest.raises(HTTPException) as exc:
        StaffingRequestService(db_session).renotify(req.id, seed.org_admin.id)
    assert exc.value.status_code == 409
    assert 'already ended' in exc.value.detail


# ── worker paths: distinct past-vs-lead messages ─────────────────────────────

def test_release_already_started_gets_distinct_message(db_session, seed):
    original = _request_row(
        db_session, seed, starts_in=timedelta(hours=-1), lasts=timedelta(hours=8),
        status=RequestStatus.ASSIGNED,
    )
    db_session.add(Assignment(
        id=uuid4(), staffing_request_id=original.id, worker_user_id=seed.worker_a.id,
        assigned_by_user_id=seed.org_admin.id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    ))
    db_session.flush()

    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).release(
            original.id, AccessScope(user=seed.worker_a, tenant_id=seed.tenant.id), None,
        )
    assert exc.value.status_code == 409
    assert 'already started' in exc.value.detail


def test_report_absence_past_gets_distinct_message(db_session, seed):
    from app.schemas.replacement import AbsenceReportCreate

    payload = AbsenceReportCreate(
        organization_id=seed.org.id, role=RequestRole.EDUCATOR,
        work_date=date.today() - timedelta(days=1),
        start_time=time(20, 0), end_time=time(23, 0), reason='sick',
    )

    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).report_absence(
            payload, AccessScope(user=seed.worker_a, tenant_id=seed.tenant.id),
        )
    assert exc.value.status_code == 409
    assert 'already in the past' in exc.value.detail


# ── overnight end convention ─────────────────────────────────────────────────

def test_shift_end_utc_crosses_midnight_in_quebec(monkeypatch):
    """22h00–06h00 on July 1 Montréal ends July 2 06h00 EDT = 10h00 UTC."""
    monkeypatch.setattr(settings, 'shift_timezone', 'America/Toronto')

    ends = shift_end_utc(date(2026, 7, 1), time(22, 0), time(6, 0))

    assert ends == datetime(2026, 7, 2, 10, 0, tzinfo=timezone.utc)
