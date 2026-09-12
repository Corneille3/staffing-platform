"""Coordinator cancel → "request cancelled" fan-out.

Until now `POST /requests/{id}/cancel` flipped the status and wrote an audit
row; the substitutes who had been offered the shift learned nothing (the
coordinator page even claimed "Notified substitutes were told"). Same policy
as the post-fill fan-out: push for everyone still holding an open offer, one
closure SMS only for workers who had ACCEPTED, nobody for DECLINED / WITHDRAWN.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.enums import (
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
)
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.notifications import notification_dispatcher as nd
from app.notifications import web_push_service
from app.services.staffing_request_service import StaffingRequestService

CANCELLED_TITLES = ('Request cancelled', 'Demande annulée')


@pytest.fixture
def pushes(monkeypatch):
    sent = []

    def fake_push(self, db, user_id, payload):
        sent.append((user_id, payload))
        return {'sent': 1, 'pruned': 0, 'failed': 0}

    monkeypatch.setattr(web_push_service.WebPushService, 'send_to_user', fake_push)
    return sent


@pytest.fixture
def texts(monkeypatch):
    sent = []
    monkeypatch.setattr(
        nd.SmsNotificationService, 'send',
        lambda self, phone, body: sent.append((phone, body)) or {'delivery_status': 'sent'},
    )
    return sent


def _notified_request(session, seed) -> StaffingRequest:
    request = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.NOTIFIED, origin=RequestOrigin.COORDINATOR,
        title='Couverture', city='IntTestCity',
        work_date=date.today() + timedelta(days=3),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(request)
    session.flush()
    return request


def _offered_to(session, request, worker, status=ResponseStatus.NOTIFIED) -> RequestResponse:
    response = RequestResponse(
        id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
        status=status, created_at=datetime.now(timezone.utc),
    )
    session.add(response)
    session.flush()
    return response


def _cancelled_pushes(pushes):
    return [(uid, p) for uid, p in pushes if p.get('title') in CANCELLED_TITLES]


def test_open_responders_get_a_cancelled_push_and_no_text(db_session, seed, pushes, texts):
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a)
    _offered_to(db_session, request, seed.worker_b, status=ResponseStatus.VIEWED)
    seed.worker_a.phone = '+15145550101'
    seed.worker_b.phone = '+15145550102'
    db_session.flush()

    StaffingRequestService(db_session).cancel(request.id)

    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.CANCELLED
    pinged = _cancelled_pushes(pushes)
    assert sorted(uid for uid, _ in pinged) == sorted([seed.worker_a.id, seed.worker_b.id])
    # Same tag as the offer push: the banner is replaced, not stacked.
    assert all(p['tag'] == f'request-{request.id}' for _, p in pinged)
    assert texts == [], 'passive recipients are push-only — a text keeps meaning opportunity'


def test_a_worker_who_had_accepted_also_gets_one_closure_text(db_session, seed, pushes, texts):
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a, status=ResponseStatus.ACCEPTED)
    _offered_to(db_session, request, seed.worker_b)
    seed.worker_a.phone = '+15145550101'
    seed.worker_a.sms_opt_out = False
    seed.worker_b.phone = '+15145550102'
    db_session.flush()

    StaffingRequestService(db_session).cancel(request.id)

    assert len(_cancelled_pushes(pushes)) == 2
    assert [phone for phone, _ in texts] == ['+15145550101']
    assert 'annule' in texts[0][1]  # worker_a is fr; GSM-7, no accents


def test_stop_still_means_stop_for_the_closure_text(db_session, seed, pushes, texts):
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a, status=ResponseStatus.ACCEPTED)
    seed.worker_a.phone = '+15145550101'
    seed.worker_a.sms_opt_out = True
    db_session.flush()

    StaffingRequestService(db_session).cancel(request.id)

    assert len(_cancelled_pushes(pushes)) == 1
    assert texts == []


def test_declined_and_withdrawn_are_left_alone(db_session, seed, pushes):
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a, status=ResponseStatus.DECLINED)
    _offered_to(db_session, request, seed.worker_b, status=ResponseStatus.WITHDRAWN)

    StaffingRequestService(db_session).cancel(request.id)

    assert _cancelled_pushes(pushes) == []


def test_audit_row_records_how_many_were_told(db_session, seed, pushes):
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a)
    _offered_to(db_session, request, seed.worker_b)

    StaffingRequestService(db_session).cancel(request.id)

    entry = db_session.execute(
        select(AuditLog).where(
            AuditLog.action == 'staffing_request.cancelled',
            AuditLog.entity_id == request.id,
        )
    ).scalar_one()
    assert entry.payload == {'notified_worker_count': 2}


def test_a_failing_push_does_not_undo_the_cancel(db_session, seed, monkeypatch):
    def boom(self, db, user_id, payload):
        raise RuntimeError('push service down')

    monkeypatch.setattr(web_push_service.WebPushService, 'send_to_user', boom)
    request = _notified_request(db_session, seed)
    _offered_to(db_session, request, seed.worker_a)

    StaffingRequestService(db_session).cancel(request.id)

    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.CANCELLED
