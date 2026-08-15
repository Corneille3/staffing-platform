"""A byte-identical subject to the same mailbox gets folded into one thread.

Mail clients group by subject + participants. The worker invite subject was a
constant, so every invitation ever sent to one mailbox collapsed into a single
already-read conversation — a re-invited substitute never sees the new message
arrive. The coordinator and tenant invites already name their org or network.
"""
from uuid import uuid4

from app.notifications.email_service import EmailNotificationService


def _capture_sent(monkeypatch) -> list:
    sent = []

    def fake_send(self, message):
        sent.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    monkeypatch.setattr(EmailNotificationService, 'send', fake_send)
    return sent


def test_worker_invite_subject_names_the_network(apf_client, seed, monkeypatch):
    sent = _capture_sent(monkeypatch)

    resp = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Sophie', 'last_name': 'Lavoie',
        'email': f'sophie-{uuid4().hex[:8]}@example.org',
        'preferred_language': 'fr',
    })
    assert resp.status_code == 201, resp.text

    assert len(sent) == 1
    assert seed.tenant.name in sent[0].subject


def test_two_invites_to_the_same_network_still_differ_by_recipient(
    apf_client, seed, monkeypatch
):
    """Same network means the same subject — that's intended, and it's why the
    RFC-compliant Message-ID added alongside matters: two invitations remain
    distinct messages even when their subject matches."""
    sent = _capture_sent(monkeypatch)

    for _ in range(2):
        resp = apf_client.post('/api/v1/workers/invite', json={
            'first_name': 'Sophie', 'last_name': 'Lavoie',
            'email': f'sophie-{uuid4().hex[:8]}@example.org',
            'preferred_language': 'fr',
        })
        assert resp.status_code == 201, resp.text

    assert len(sent) == 2
    assert sent[0].to_email != sent[1].to_email
    assert all(seed.tenant.name in m.subject for m in sent)


def test_invite_email_still_sends_without_a_network_name(seed, db_session, monkeypatch):
    """The name is looked up, not required: a missing tenant must not cost the
    invitee their email — invite delivery is best-effort and already swallows
    errors, which would turn a lookup failure into silence."""
    sent = _capture_sent(monkeypatch)
    from app.services.worker_service import WorkerService

    WorkerService(db_session)._send_invite_email(seed.worker_a, None)

    assert len(sent) == 1
    assert 'bassin de remplaçant' in sent[0].subject or 'substitute pool' in sent[0].subject
