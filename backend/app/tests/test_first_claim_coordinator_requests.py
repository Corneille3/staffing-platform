"""First come, first served on coordinator-created requests (2026-09-12).

A coordinator can publish a request with ``auto_assign`` on: it stays OPEN,
the first eligible substitute to claim it — in-app or by texting 1 — is
assigned on the spot. Off (the default), nothing changes: accept → the
coordinator picks.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.enums import (
    AssignmentStatus, RequestOrigin, RequestRole, RequestStatus, RequestType, ResponseStatus,
)
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.notifications.notification_dispatcher import NotificationDispatcher
from app.services.inbound_sms_service import InboundSmsService
from app.services.replacement_service import ReplacementService
from app.tests.test_sms_claim_hint import _body, channels, twilio_on  # noqa: F401 — fixtures


def _open_coordinator_request(session, seed, *, auto_assign: bool) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.OPEN, origin=RequestOrigin.COORDINATOR, auto_assign=auto_assign,
        urgency_level=3, title='Couverture matin', city='IntTestCity',
        work_date=date.today() + timedelta(days=21), start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(req)
    session.flush()
    return req


def test_first_claim_coordinator_request_is_claimable_once(db_session, seed):
    req = _open_coordinator_request(db_session, seed, auto_assign=True)

    won = ReplacementService(db_session).claim(req.id, seed.worker_a.id, seed.tenant.id)
    assert won.status == AssignmentStatus.CONFIRMED
    assert won.assigned_by_user_id == seed.worker_a.id
    db_session.refresh(req)
    assert req.status == RequestStatus.ASSIGNED
    assert req.assigned_worker_user_id == seed.worker_a.id

    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).claim(req.id, seed.worker_b.id, seed.tenant.id)
    assert exc.value.status_code == 409


def test_classic_coordinator_request_still_not_claimable(db_session, seed):
    req = _open_coordinator_request(db_session, seed, auto_assign=False)
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).claim(req.id, seed.worker_a.id, seed.tenant.id)
    assert exc.value.status_code == 409


def test_publish_keeps_a_first_claim_request_open(db_session, seed, org_admin_client):
    payload = {
        'organization_id': str(seed.org.id), 'request_type': 'urgent_replacement',
        'title': 'Premier arrivé', 'city': 'IntTestCity',
        'work_date': (date.today() + timedelta(days=3)).isoformat(),
        'start_time': '08:00', 'end_time': '12:00', 'urgency_level': 3,
    }
    draft = org_admin_client.post('/api/v1/admin/requests', json=payload).json()
    assert org_admin_client.patch(f"/api/v1/admin/requests/{draft['id']}", json={'auto_assign': True}).json()['auto_assign'] is True

    published = org_admin_client.post(f"/api/v1/requests/{draft['id']}/publish").json()
    assert published['status'] == 'open'          # claimable, not 'notified'
    assert published['auto_assign'] is True
    rows = db_session.query(RequestResponse).filter_by(staffing_request_id=draft['id']).all()
    assert rows and all(r.status == ResponseStatus.NOTIFIED for r in rows)

    # Same flow without the checkbox → the classic dispatch.
    classic = org_admin_client.post('/api/v1/admin/requests', json=payload).json()
    assert org_admin_client.post(f"/api/v1/requests/{classic['id']}/publish").json()['status'] == 'notified'


def test_claim_route_assigns_the_first_eligible_worker(db_session, seed, org_admin_client, worker_a_client, worker_b_client):
    payload = {
        'organization_id': str(seed.org.id), 'request_type': 'urgent_replacement',
        'title': 'Premier arrivé', 'city': 'IntTestCity',
        'work_date': (date.today() + timedelta(days=3)).isoformat(),
        'start_time': '08:00', 'end_time': '12:00', 'urgency_level': 3,
    }
    draft = org_admin_client.post('/api/v1/admin/requests', json=payload).json()
    org_admin_client.patch(f"/api/v1/admin/requests/{draft['id']}", json={'auto_assign': True})
    org_admin_client.post(f"/api/v1/requests/{draft['id']}/publish")

    first = worker_a_client.post(f"/api/v1/requests/{draft['id']}/claim")
    assert first.status_code == 200, first.text
    second = worker_b_client.post(f"/api/v1/requests/{draft['id']}/claim")
    assert second.status_code == 409
    assert org_admin_client.get(f"/api/v1/requests/{draft['id']}").json()['assigned_worker_user_id'] == str(seed.worker_a.id)


def test_first_claim_request_sms_invites_a_take(db_session, seed, channels, twilio_on):
    seed.worker_a.phone = '+15145550001'
    req = _open_coordinator_request(db_session, seed, auto_assign=True)
    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])
    assert 'Reply 1 to take it.' in _body(channels)


def test_reply_1_claims_a_first_claim_coordinator_request(db_session, seed):
    phone = '+15145550099'
    seed.worker_b.phone = phone
    req = _open_coordinator_request(db_session, seed, auto_assign=True)
    db_session.add(RequestResponse(
        id=uuid4(), staffing_request_id=req.id, worker_user_id=seed.worker_b.id,
        status=ResponseStatus.NOTIFIED, created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    ))
    db_session.flush()

    reply = InboundSmsService(db_session).handle(phone, '1')

    assert "You're in" in reply or "C'est a toi" in reply
    db_session.refresh(req)
    assert req.status == RequestStatus.ASSIGNED
    assert req.assigned_worker_user_id == seed.worker_b.id
