"""APF coordinators listing must not show removed (soft-deleted) accounts.

Follow-up to finding #13: the "Inactive · removed" rows on /apf/coordinators
were audit decoration — the trail already lives in the audit log
(``user.removed``), and a removed account cannot be reactivated.
"""
from uuid import uuid4


def _invite(apf_client, seed):
    resp = apf_client.post('/api/v1/coordinators/invite', json={
        'first_name': 'Casey',
        'last_name': 'Manager',
        'email': f'casey-{uuid4().hex[:8]}@example.org',
        'preferred_language': 'en',
        'org_ids': [str(seed.org.id)],
    })
    assert resp.status_code == 201, resp.text
    return resp.json()['id']


def _listed_ids(apf_client) -> dict[str, dict]:
    resp = apf_client.get('/api/v1/coordinators')
    assert resp.status_code == 200, resp.text
    return {row['id']: row for row in resp.json()['items']}


def test_removed_coordinator_hidden_from_apf_list(apf_client, monkeypatch, seed):
    from app.notifications import email_service

    monkeypatch.setattr(
        email_service.EmailNotificationService, 'send',
        lambda self, message: {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email},
    )

    casey_id = _invite(apf_client, seed)
    before = _listed_ids(apf_client)
    assert casey_id in before
    assert str(seed.org_admin.id) in before
    assert before[casey_id]['organizations'][0]['id'] == str(seed.org.id)

    resp = apf_client.delete(f'/api/v1/users/{casey_id}')
    assert resp.status_code == 200, resp.text
    assert resp.json()['is_active'] is False

    after = _listed_ids(apf_client)
    assert casey_id not in after
    assert str(seed.org_admin.id) in after
    assert all(row['is_active'] for row in after.values())
