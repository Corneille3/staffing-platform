"""Twilio webhook route: signature gate + TwiML reply.

This is the one route in the app with no Clerk JWT in front of it, so the
signature check is the entire door. These tests exist to make sure it stays
shut.
"""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.deps import get_db_session
from app.core.config import settings
from app.main import app
from app.models.enums import (
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
)
from app.models.inbound_sms import InboundSms
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.notifications.twilio_signature import expected_signature, public_url

PHONE = '+15145550001'
WEBHOOK = '/api/v1/webhooks/twilio/sms'
TOKEN = 'test-auth-token'


@pytest.fixture
def anon_client(db_session, seed, monkeypatch):
    """No Authorization header — the webhook must work without one."""
    monkeypatch.setattr(settings, 'twilio_auth_token', TOKEN)

    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    yield TestClient(app)
    app.dependency_overrides.pop(get_db_session, None)


def _signed(client, form: dict[str, str]) -> dict[str, str]:
    """Headers Twilio would send for this form body, arriving the way prod
    sees them: Cloudflare terminates TLS, so the app reads http:// while
    Twilio signed https://. X-Forwarded-Proto is what bridges the two."""
    url = public_url(f'https://testserver{WEBHOOK}', 'https')
    return {
        'X-Twilio-Signature': expected_signature(TOKEN, url, form),
        'X-Forwarded-Proto': 'https',
    }


def _claimable(session, seed, worker) -> StaffingRequest:
    request = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.worker_a.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.OPEN, origin=RequestOrigin.WORKER_REPLACEMENT,
        auto_assign=True, title='Couverture', city='IntTestCity',
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(request)
    session.flush()
    session.add(RequestResponse(
        id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
        status=ResponseStatus.NOTIFIED, created_at=datetime.now(timezone.utc),
    ))
    session.flush()
    return request


def test_missing_signature_is_rejected(anon_client, db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()

    resp = anon_client.post(WEBHOOK, data={'From': PHONE, 'Body': '1'})

    assert resp.status_code == 403
    # Nothing was recorded — the door closed before the service ran.
    assert db_session.scalar(select(InboundSms)) is None


def test_forged_signature_is_rejected(anon_client, db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()

    resp = anon_client.post(
        WEBHOOK,
        data={'From': PHONE, 'Body': '1'},
        headers={'X-Twilio-Signature': 'not-the-real-one'},
    )

    assert resp.status_code == 403


def test_signature_over_different_body_is_rejected(anon_client, db_session, seed):
    """Signing one payload and posting another must not pass — the params are
    part of the signed string, not just the URL."""
    seed.worker_b.phone = PHONE
    db_session.flush()
    headers = _signed(anon_client, {'From': PHONE, 'Body': 'STOP'})

    resp = anon_client.post(WEBHOOK, data={'From': PHONE, 'Body': '1'}, headers=headers)

    assert resp.status_code == 403


def test_valid_signature_claims_and_replies_twiml(anon_client, db_session, seed):
    seed.worker_b.phone = PHONE
    db_session.flush()
    request = _claimable(db_session, seed, seed.worker_b)
    form = {'From': PHONE, 'Body': '1', 'MessageSid': 'SM999'}

    resp = anon_client.post(WEBHOOK, data=form, headers=_signed(anon_client, form))

    assert resp.status_code == 200
    assert resp.headers['content-type'].startswith('application/xml')
    assert '<Response><Message>' in resp.text
    assert db_session.get(StaffingRequest, request.id).status == RequestStatus.ASSIGNED


def test_reply_is_xml_escaped(anon_client, db_session, seed):
    """An unknown sender gets a canned reply, but the TwiML must stay
    well-formed whatever ends up in it."""
    form = {'From': '+15149999999', 'Body': '<script>'}

    resp = anon_client.post(WEBHOOK, data=form, headers=_signed(anon_client, form))

    assert resp.status_code == 200
    assert '<script>' not in resp.text


def test_empty_auth_token_rejects_everything(anon_client, db_session, seed, monkeypatch):
    """Prod ran for months with blank Twilio config; a blank token must fail
    closed, never open."""
    form = {'From': PHONE, 'Body': '1'}
    headers = _signed(anon_client, form)
    monkeypatch.setattr(settings, 'twilio_auth_token', '')

    resp = anon_client.post(WEBHOOK, data=form, headers=headers)

    assert resp.status_code == 403
