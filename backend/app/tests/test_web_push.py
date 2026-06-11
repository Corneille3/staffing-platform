"""Web Push (PWA): subscription endpoints, delivery service, dispatcher wiring.

The endpoint URL is the natural key — re-subscribing upserts, and a device
that switches accounts must follow the current user. Delivery prunes
subscriptions the push service reports gone (404/410) and skips entirely when
VAPID keys are unset (mirrors the Twilio-less SMS posture).
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import RequestRole, RequestStatus, RequestType
from app.models.push_subscription import PushSubscription
from app.models.staffing_request import StaffingRequest
from app.notifications import email_service, web_push_service
from app.notifications.notification_dispatcher import NotificationDispatcher
from app.notifications.web_push_service import WebPushService


def _payload(endpoint: str = 'https://push.example/ep-1') -> dict:
    return {
        'endpoint': endpoint,
        'keys': {'p256dh': 'p-key', 'auth': 'a-key'},
        'user_agent': 'pytest',
    }


# ── subscription endpoints ────────────────────────────────────────────────────

def test_subscribe_creates_then_upserts_by_endpoint(worker_a_client, db_session, seed):
    url = f'/api/v1/workers/{seed.worker_a.id}/push/subscribe'

    resp = worker_a_client.post(url, json=_payload())
    assert resp.status_code == 201

    resp = worker_a_client.post(url, json={**_payload(), 'keys': {'p256dh': 'p2', 'auth': 'a2'}})
    assert resp.status_code == 201

    rows = db_session.scalars(select(PushSubscription)).all()
    assert len(rows) == 1
    assert rows[0].user_id == seed.worker_a.id
    assert rows[0].p256dh == 'p2'


def test_device_switching_accounts_follows_current_user(worker_a_client, worker_b_client, db_session, seed):
    worker_a_client.post(f'/api/v1/workers/{seed.worker_a.id}/push/subscribe', json=_payload())
    worker_b_client.post(f'/api/v1/workers/{seed.worker_b.id}/push/subscribe', json=_payload())

    rows = db_session.scalars(select(PushSubscription)).all()
    assert len(rows) == 1
    assert rows[0].user_id == seed.worker_b.id


def test_worker_cannot_subscribe_for_another(worker_b_client, seed):
    resp = worker_b_client.post(f'/api/v1/workers/{seed.worker_a.id}/push/subscribe', json=_payload())
    assert resp.status_code == 403


def test_unsubscribe_is_idempotent(worker_a_client, db_session, seed):
    worker_a_client.post(f'/api/v1/workers/{seed.worker_a.id}/push/subscribe', json=_payload())

    url = f'/api/v1/workers/{seed.worker_a.id}/push/unsubscribe'
    resp = worker_a_client.post(url, json={'endpoint': _payload()['endpoint']})
    assert resp.status_code == 200
    assert resp.json() == {'removed': True}
    assert db_session.scalars(select(PushSubscription)).all() == []

    resp = worker_a_client.post(url, json={'endpoint': _payload()['endpoint']})
    assert resp.json() == {'removed': False}


def test_public_key_endpoint_reflects_settings(worker_a_client, monkeypatch):
    monkeypatch.setattr(settings, 'vapid_public_key', 'BTestKey')
    resp = worker_a_client.get('/api/v1/workers/push/public-key')
    assert resp.status_code == 200
    assert resp.json() == {'public_key': 'BTestKey'}

    monkeypatch.setattr(settings, 'vapid_public_key', '')
    assert worker_a_client.get('/api/v1/workers/push/public-key').json() == {'public_key': ''}


# ── delivery service ──────────────────────────────────────────────────────────

def _subscription(db_session, user_id, endpoint):
    row = PushSubscription(
        id=uuid4(), user_id=user_id, endpoint=endpoint, p256dh='p', auth='a',
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_service_skips_when_unconfigured(db_session, seed, monkeypatch):
    monkeypatch.setattr(settings, 'vapid_public_key', '')
    monkeypatch.setattr(settings, 'vapid_private_key', '')
    _subscription(db_session, seed.worker_a.id, 'https://push.example/skip')

    result = WebPushService().send_to_user(db_session, seed.worker_a.id, {'title': 'x'})
    assert result == {'sent': 0, 'pruned': 0, 'failed': 0}


def test_service_sends_and_prunes_dead_endpoints(db_session, seed, monkeypatch):
    monkeypatch.setattr(settings, 'vapid_public_key', 'BTestKey')
    monkeypatch.setattr(settings, 'vapid_private_key', 'priv')
    alive = _subscription(db_session, seed.worker_a.id, 'https://push.example/alive')
    _subscription(db_session, seed.worker_a.id, 'https://push.example/dead')

    import pywebpush

    calls = []

    def fake_webpush(subscription_info, data=None, **kwargs):
        calls.append(kwargs)
        if subscription_info['endpoint'].endswith('/dead'):
            raise pywebpush.WebPushException(
                'gone', response=SimpleNamespace(status_code=410),
            )
        return SimpleNamespace(status_code=201)

    monkeypatch.setattr(pywebpush, 'webpush', fake_webpush)

    result = WebPushService().send_to_user(db_session, seed.worker_a.id, {'title': 'x'})
    assert result == {'sent': 1, 'pruned': 1, 'failed': 0}
    rows = db_session.scalars(select(PushSubscription)).all()
    assert [r.id for r in rows] == [alive.id]
    # Urgency: high on every send — Android Doze batches normal-priority
    # pushes until the phone wakes, which defeats a first-claim-wins race.
    assert all(call['headers'] == {'Urgency': 'high'} for call in calls)


# ── dispatcher wiring ─────────────────────────────────────────────────────────

@pytest.fixture
def pushes(monkeypatch):
    """Capture dispatcher pushes; silence the email channel."""
    captured: list[tuple] = []

    monkeypatch.setattr(
        email_service.EmailNotificationService, 'send',
        lambda self, message: {'channel': 'email', 'delivery_status': 'sent'},
    )

    def fake_send_to_user(self, db, user_id, payload):
        captured.append((user_id, payload))
        return {'sent': 1, 'pruned': 0, 'failed': 0}

    monkeypatch.setattr(web_push_service.WebPushService, 'send_to_user', fake_send_to_user)
    return captured


def _request(session, seed, *, urgency: int) -> StaffingRequest:
    start = datetime.now(timezone.utc) + timedelta(days=10)
    req = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.NOTIFIED, urgency_level=urgency,
        title='Couverture', city='IntTestCity',
        work_date=start.date(), start_time=start.time().replace(microsecond=0),
        end_time=start.time().replace(microsecond=0),
    )
    session.add(req)
    session.flush()
    return req


def test_broadcast_pushes_in_worker_language(db_session, seed, pushes):
    seed.worker_a.preferred_language = 'fr'
    seed.worker_b.preferred_language = 'en'
    req = _request(db_session, seed, urgency=1)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a, seed.worker_b])

    by_user = {user_id: payload for user_id, payload in pushes}
    fr = by_user[seed.worker_a.id]
    en = by_user[seed.worker_b.id]
    assert fr['title'] == 'Nouveau remplacement'
    assert fr['url'] == f'/fr/worker/requests/{req.id}'
    assert en['title'] == 'New coverage'
    assert en['url'] == f'/en/worker/requests/{req.id}'
    assert 'Couverture' in fr['body']


def test_urgent_broadcast_flags_title(db_session, seed, pushes):
    req = _request(db_session, seed, urgency=3)

    NotificationDispatcher(db_session).notify_workers(req, [seed.worker_a])

    (_, payload), = pushes
    assert payload['title'].startswith('Urgent')


def test_assignment_confirmed_deep_links_to_accepted(db_session, seed, pushes):
    req = _request(db_session, seed, urgency=1)

    NotificationDispatcher(db_session).notify_assignment_confirmed(req, seed.worker_a)

    (_, payload), = pushes
    assert payload['url'] == f'/fr/worker/requests/{req.id}/accepted'
    assert payload['title'] == 'Affectation confirmée'
