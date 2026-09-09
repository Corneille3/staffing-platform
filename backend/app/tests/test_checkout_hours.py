"""Check-out, worked hours, geofence, correction & coverage tile.

SPEC_CHECKOUT_HOURS §8 + the coverage-risk tile tests (SMS spec §2.4) — the
tile ships in the same batch because §4 surfaces "not checked in" through it.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.enums import (
    AssignmentStatus,
    OrganizationType,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
)
from app.models.organization import Organization
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.user import User
from app.services.export_service import ExportService

# Site coordinates for geofence tests (Montréal-ish). ~500 m north is well
# outside the default 250 m radius; ~50 m is well inside.
SITE = (45.500000, -73.570000)
INSIDE = (45.500400, -73.570000)   # ~44 m north
OUTSIDE = (45.505000, -73.570000)  # ~556 m north


def _request(session, seed, *, work_date=None, start=time(8, 0), end=time(16, 0),
             status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
             org=None) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=(org or seed.org).id,
        created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=origin, title='Shift', city='IntTestCity',
        work_date=work_date or date.today(), start_time=start, end_time=end,
    )
    session.add(req)
    session.flush()
    return req


def _assignment(session, seed, req, *, worker=None, status=AssignmentStatus.CONFIRMED,
                checked_in=None) -> Assignment:
    assignment = Assignment(
        id=uuid4(), staffing_request_id=req.id,
        worker_user_id=(worker or seed.worker_a).id,
        assigned_by_user_id=seed.org_admin.id, status=status,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
        checked_in_at=checked_in,
    )
    session.add(assignment)
    session.flush()
    return assignment


def _audit_entries(session, action, entity_id):
    return session.scalars(
        select(AuditLog).where(AuditLog.action == action, AuditLog.entity_id == entity_id)
    ).all()


# ── check-out ───────────────────────────────────────────────────────────────

def test_checkout_without_checkin_409(db_session, seed, worker_a_client):
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(f'/api/v1/assignments/{assignment.id}/check-out', json={})
    assert resp.status_code == 409
    assert 'check-in' in resp.json()['detail'].lower()


def test_checkout_completes_and_derives_hours(db_session, seed, worker_a_client):
    req = _request(db_session, seed)
    checked_in = datetime.now(timezone.utc) - timedelta(hours=7)
    assignment = _assignment(db_session, seed, req, checked_in=checked_in)

    resp = worker_a_client.post(f'/api/v1/assignments/{assignment.id}/check-out', json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'completed'
    assert body['completed_at'] == body['checked_out_at']
    assert body['worked_hours'] == pytest.approx(7.0, abs=0.02)


def test_checkout_is_idempotent(db_session, seed, worker_a_client):
    req = _request(db_session, seed)
    assignment = _assignment(
        db_session, seed, req, checked_in=datetime.now(timezone.utc) - timedelta(hours=2),
    )
    first = worker_a_client.post(f'/api/v1/assignments/{assignment.id}/check-out', json={})
    second = worker_a_client.post(f'/api/v1/assignments/{assignment.id}/check-out', json={})
    assert first.status_code == second.status_code == 200
    assert first.json()['checked_out_at'] == second.json()['checked_out_at']
    assert len(_audit_entries(db_session, 'assignment.checked_out', assignment.id)) == 1


def test_worker_cannot_check_out_someone_elses_shift(db_session, seed, worker_b_client):
    req = _request(db_session, seed)
    assignment = _assignment(
        db_session, seed, req, worker=seed.worker_a,
        checked_in=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    resp = worker_b_client.post(f'/api/v1/assignments/{assignment.id}/check-out', json={})
    assert resp.status_code == 403


def test_cancellation_clears_both_stamps_audit_retained(db_session, seed, org_admin_client):
    req = _request(db_session, seed)
    assignment = _assignment(
        db_session, seed, req, checked_in=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    # A cancel can only hit an active assignment, so stamp check-out fields
    # directly (the completed→cancel path is forbidden by design).
    assignment.checked_out_latitude = None
    resp = org_admin_client.post(
        f'/api/v1/assignments/{assignment.id}/cancel', json={'reason': 'sick'},
    )
    assert resp.status_code == 200
    db_session.refresh(assignment)
    assert assignment.checked_in_at is None
    assert assignment.checked_out_at is None
    assert assignment.completed_at is None
    assert len(_audit_entries(db_session, 'assignment.checked_in', assignment.id)) == 0  # stamped directly, no event
    assert len(_audit_entries(db_session, 'assignment.cancelled', assignment.id)) == 1


# ── geofence ────────────────────────────────────────────────────────────────

def _geo_org(db_session, seed):
    seed.org.latitude, seed.org.longitude = SITE
    db_session.flush()
    return seed.org


def test_checkin_inside_radius_audits_geo_ok(db_session, seed, worker_a_client):
    _geo_org(db_session, seed)
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(
        f'/api/v1/assignments/{assignment.id}/check-in',
        json={'latitude': INSIDE[0], 'longitude': INSIDE[1]},
    )
    assert resp.status_code == 200
    (entry,) = _audit_entries(db_session, 'assignment.checked_in', assignment.id)
    assert entry.payload['geo_ok'] is True
    assert entry.payload['distance_m'] <= 250


def test_outside_radius_permissive_allows_and_flags(db_session, seed, worker_a_client):
    _geo_org(db_session, seed)
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(
        f'/api/v1/assignments/{assignment.id}/check-in',
        json={'latitude': OUTSIDE[0], 'longitude': OUTSIDE[1]},
    )
    assert resp.status_code == 200, 'permissive mode records, never blocks'
    (entry,) = _audit_entries(db_session, 'assignment.checked_in', assignment.id)
    assert entry.payload['geo_ok'] is False
    assert entry.payload['distance_m'] > 250


def test_outside_radius_enforced_422_with_distance(db_session, seed, worker_a_client, monkeypatch):
    monkeypatch.setattr(settings, 'geofence_enforce', True)
    _geo_org(db_session, seed)
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(
        f'/api/v1/assignments/{assignment.id}/check-in',
        json={'latitude': OUTSIDE[0], 'longitude': OUTSIDE[1]},
    )
    assert resp.status_code == 422
    assert 'outside_site_radius' in resp.json()['detail']
    assert 'm from the site' in resp.json()['detail']
    db_session.refresh(assignment)
    assert assignment.checked_in_at is None, 'blocked stamp must not persist'


def test_missing_coords_allowed_and_noted(db_session, seed, worker_a_client, monkeypatch):
    monkeypatch.setattr(settings, 'geofence_enforce', True)
    _geo_org(db_session, seed)
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(f'/api/v1/assignments/{assignment.id}/check-in', json={})
    assert resp.status_code == 200, 'a denied browser position is never fatal'
    (entry,) = _audit_entries(db_session, 'assignment.checked_in', assignment.id)
    assert entry.payload['geo_ok'] is None
    assert entry.payload['geo_note'] == 'geo_unavailable'


def test_per_org_radius_overrides_default(db_session, seed, worker_a_client):
    org = _geo_org(db_session, seed)
    org.geofence_radius_m = 1000  # rural site, big lot — OUTSIDE is now inside
    db_session.flush()
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = worker_a_client.post(
        f'/api/v1/assignments/{assignment.id}/check-in',
        json={'latitude': OUTSIDE[0], 'longitude': OUTSIDE[1]},
    )
    assert resp.status_code == 200
    (entry,) = _audit_entries(db_session, 'assignment.checked_in', assignment.id)
    assert entry.payload['geo_ok'] is True


# ── not-checked-in (absence signal) ─────────────────────────────────────────

def _dashboard(client):
    resp = client.get('/api/v1/admin/dashboard')
    assert resp.status_code == 200
    return resp.json()


def test_not_checked_in_appears_after_grace_and_clears_on_checkin(
    db_session, seed, org_admin_client, monkeypatch,
):
    # Shift started well past the grace window, worker never stamped. The
    # dashboard scopes on today's date, so clamp to 00:00 rather than let the
    # subtraction roll into yesterday just after midnight (CI runs on UTC).
    now = datetime.now()
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    started = max(now - timedelta(minutes=settings.checkin_grace_minutes + 30), midnight)
    if started == midnight:
        monkeypatch.setattr(settings, 'checkin_grace_minutes', 0)
    req = _request(db_session, seed, start=time(started.hour, started.minute))
    assignment = _assignment(db_session, seed, req)

    dash = _dashboard(org_admin_client)
    assert dash['coverage_forward']['not_checked_in_today'] == 1
    roster = {r['name']: r['status'] for r in dash['roster_today']}
    assert roster['Worker Alpha'] == 'not_checked_in'

    assignment.checked_in_at = datetime.now(timezone.utc)
    db_session.flush()
    dash = _dashboard(org_admin_client)
    assert dash['coverage_forward']['not_checked_in_today'] == 0
    assert {r['name']: r['status'] for r in dash['roster_today']}['Worker Alpha'] == 'on_site'


def test_future_shift_is_arriving_not_absent(db_session, seed, org_admin_client):
    # Same clamp on the other side: "three hours from now" must stay on
    # today's date, so cap it at 23:59 (fails from 21:00 UTC otherwise).
    now = datetime.now()
    later = min(now + timedelta(hours=3), now.replace(hour=23, minute=59, second=0, microsecond=0))
    req = _request(db_session, seed, start=time(later.hour, later.minute))
    _assignment(db_session, seed, req)
    dash = _dashboard(org_admin_client)
    assert dash['coverage_forward']['not_checked_in_today'] == 0
    assert {r['name']: r['status'] for r in dash['roster_today']}['Worker Alpha'] == 'arriving'


# ── coordinator time correction ─────────────────────────────────────────────

def test_correction_requires_reason(db_session, seed, org_admin_client):
    req = _request(db_session, seed)
    assignment = _assignment(
        db_session, seed, req, checked_in=datetime.now(timezone.utc) - timedelta(hours=6),
    )
    resp = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': datetime.now(timezone.utc).isoformat()},
    )
    assert resp.status_code == 422  # pydantic: reason is mandatory


def test_correction_rejects_inverted_and_overlong_windows(db_session, seed, org_admin_client):
    req = _request(db_session, seed)
    checked_in = datetime.now(timezone.utc) - timedelta(hours=6)
    assignment = _assignment(db_session, seed, req, checked_in=checked_in)

    inverted = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': (checked_in - timedelta(hours=1)).isoformat(), 'reason': 'oops'},
    )
    assert inverted.status_code == 400

    overlong = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': (checked_in + timedelta(hours=30)).isoformat(), 'reason': 'oops'},
    )
    assert overlong.status_code == 400
    assert '24' in overlong.json()['detail']


def test_correction_closes_forgotten_checkout_and_audits_old_new(db_session, seed, org_admin_client):
    req = _request(db_session, seed)
    checked_in = datetime.now(timezone.utc) - timedelta(hours=9)
    assignment = _assignment(db_session, seed, req, checked_in=checked_in)
    out = checked_in + timedelta(hours=8)

    resp = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': out.isoformat(), 'reason': 'Worker forgot to tap Done'},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body['status'] == 'completed'
    assert body['worked_hours'] == pytest.approx(8.0, abs=0.02)
    assert body['hours_adjustment_reason'] == 'Worker forgot to tap Done'
    assert body['hours_adjusted_by_user_id'] == str(seed.org_admin.id)

    (entry,) = _audit_entries(db_session, 'assignment.times_corrected', assignment.id)
    assert entry.payload['old_checked_out_at'] is None
    assert entry.payload['new_checked_out_at'] is not None
    assert entry.payload['reason'] == 'Worker forgot to tap Done'


def test_correction_without_any_checkin_409(db_session, seed, org_admin_client):
    req = _request(db_session, seed)
    assignment = _assignment(db_session, seed, req)
    resp = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': datetime.now(timezone.utc).isoformat(), 'reason': 'x'},
    )
    assert resp.status_code == 409


def _foreign_tenant_assignment(db_session, seed):
    other_tenant = Tenant(id=uuid4(), name='Other', slug=f'other-{uuid4().hex[:8]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Other Org',
        type=OrganizationType.CHILDCARE, city='Elsewhere',
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()
    req = _request(db_session, seed, org=other_org)
    return _assignment(
        db_session, seed, req, checked_in=datetime.now(timezone.utc) - timedelta(hours=2),
    )


def test_correction_is_tenant_isolated(db_session, seed, org_admin_client):
    assignment = _foreign_tenant_assignment(db_session, seed)
    resp = org_admin_client.patch(
        f'/api/v1/admin/assignments/{assignment.id}/times',
        json={'checked_out_at': datetime.now(timezone.utc).isoformat(), 'reason': 'x'},
    )
    assert resp.status_code == 404, 'foreign assignments look nonexistent, not forbidden'


# ── coverage-risk tile ──────────────────────────────────────────────────────

def _coverage(client):
    return _dashboard(client)['coverage_forward']


def test_coverage_window_boundaries(db_session, seed, org_admin_client):
    _request(db_session, seed, work_date=date.today(), status=RequestStatus.OPEN)          # day 0: in
    _request(db_session, seed, work_date=date.today() + timedelta(days=13),
             status=RequestStatus.OPEN)                                                    # day 13: in
    _request(db_session, seed, work_date=date.today() + timedelta(days=14),
             status=RequestStatus.OPEN)                                                    # day 14: out
    _request(db_session, seed, work_date=date.today() - timedelta(days=1),
             status=RequestStatus.OPEN)                                                    # yesterday: out
    cov = _coverage(org_admin_client)
    assert len(cov['days']) == 14
    assert cov['uncovered_total'] == 2
    assert cov['days'][0]['open'] == 1
    assert cov['days'][13]['open'] == 1


def test_coverage_buckets(db_session, seed, org_admin_client):
    tomorrow = date.today() + timedelta(days=1)
    far = date.today() + timedelta(days=10)

    _request(db_session, seed, work_date=tomorrow, status=RequestStatus.OPEN)
    _request(db_session, seed, work_date=far, status=RequestStatus.OPEN,
             origin=RequestOrigin.WORKER_REPLACEMENT)                         # released
    covered = _request(db_session, seed, work_date=far, status=RequestStatus.ASSIGNED)
    _assignment(db_session, seed, covered)
    pending = _request(db_session, seed, work_date=far, status=RequestStatus.RESPONSES_RECEIVED)
    db_session.add(RequestResponse(
        id=uuid4(), staffing_request_id=pending.id, worker_user_id=seed.worker_a.id,
        status=ResponseStatus.ACCEPTED,
    ))
    db_session.flush()

    cov = _coverage(org_admin_client)
    day1 = cov['days'][1]
    day10 = cov['days'][9] if cov['days'][9]['date'] == far.isoformat() else cov['days'][10]
    assert day1['open'] == 1
    assert day10['released'] == 1
    assert day10['covered'] == 1
    assert day10['pending_approval'] == 1
    assert cov['uncovered_total'] == 3
    assert cov['urgent_48h'] == 1  # only tomorrow's open falls in the 48 h band


def test_released_then_claimed_lands_in_covered(db_session, seed, org_admin_client):
    far = date.today() + timedelta(days=5)
    req = _request(db_session, seed, work_date=far, status=RequestStatus.ASSIGNED,
                   origin=RequestOrigin.WORKER_REPLACEMENT)
    _assignment(db_session, seed, req, worker=seed.worker_b)
    cov = _coverage(org_admin_client)
    assert cov['uncovered_total'] == 0
    assert sum(d['covered'] for d in cov['days']) == 1


def test_coverage_is_tenant_isolated(db_session, seed, org_admin_client):
    _foreign_tenant_assignment(db_session, seed)  # foreign CONFIRMED assignment + request today
    cov = _coverage(org_admin_client)
    assert cov['uncovered_total'] == 0
    assert all(d['covered'] == 0 for d in cov['days'])
    assert cov['not_checked_in_today'] == 0


def test_empty_window_renders_zeros(db_session, seed, org_admin_client):
    cov = _coverage(org_admin_client)
    assert cov['uncovered_total'] == 0
    assert cov['urgent_48h'] == 0
    assert len(cov['days']) == 14


# ── payroll export ──────────────────────────────────────────────────────────

def _rows(csv_bytes: bytes) -> list[list[str]]:
    import csv as csv_mod
    import io
    # utf-8-sig strips the Excel BOM; ';' matches the fr-Excel delimiter.
    return list(csv_mod.reader(io.StringIO(csv_bytes.decode('utf-8-sig')), delimiter=';'))


def test_worked_hours_export_includes_open_shifts_and_flags_corrections(db_session, seed):
    yesterday = date.today() - timedelta(days=1)
    # Closed, corrected shift.
    done_req = _request(db_session, seed, work_date=yesterday)
    checked_in = datetime.now(timezone.utc) - timedelta(days=1, hours=8)
    done = _assignment(db_session, seed, done_req, checked_in=checked_in,
                       status=AssignmentStatus.COMPLETED)
    done.checked_out_at = checked_in + timedelta(hours=7, minutes=30)
    done.completed_at = done.checked_out_at
    done.hours_adjusted_by_user_id = seed.org_admin.id
    done.hours_adjusted_at = datetime.now(timezone.utc)
    done.hours_adjustment_reason = 'Rounded to schedule'
    # Never-checked-in shift — must appear, not be silently dropped.
    open_req = _request(db_session, seed, work_date=yesterday, start=time(9, 0))
    _assignment(db_session, seed, open_req, worker=seed.worker_b)
    db_session.flush()

    scope = AccessScope(user=seed.org_admin, tenant_id=seed.tenant.id, org_ids=[seed.org.id])
    csv_bytes, count = ExportService(db_session).generate_worked_hours_csv(
        scope, yesterday, date.today(), None,
    )
    assert count == 2
    header, *rows = _rows(csv_bytes)
    by_worker = {r[header.index('worker_name')]: r for r in rows}

    corrected = by_worker['Worker Alpha']
    assert corrected[header.index('worked_hours')] == '7.5'
    assert corrected[header.index('scheduled_hours')] == '8.0'
    assert corrected[header.index('variance_hours')] == '-0.5'
    assert corrected[header.index('corrected')] == 'yes'
    assert corrected[header.index('corrected_by')] == 'Org Admin'
    assert corrected[header.index('reason')] == 'Rounded to schedule'
    assert corrected[header.index('status')] == 'ok'

    absent = by_worker['Worker Beta']
    assert absent[header.index('actual_in')] == ''
    assert absent[header.index('actual_out')] == ''
    assert absent[header.index('worked_hours')] == ''
    assert absent[header.index('status')] == 'non pointé'
    assert absent[header.index('corrected')] == 'no'


def test_worked_hours_export_is_tenant_scoped(db_session, seed):
    _foreign_tenant_assignment(db_session, seed)
    scope = AccessScope(user=seed.org_admin, tenant_id=seed.tenant.id, org_ids=[seed.org.id])
    csv_bytes, count = ExportService(db_session).generate_worked_hours_csv(
        scope, date.today() - timedelta(days=1), date.today() + timedelta(days=1), None,
    )
    assert count == 0
