"""APF NetworkPool: substitutes aggregate + bulk-invite + reliability recompute."""
from app.tests.conftest import request_payload


def test_network_pool_shape_and_kpis(apf_client, seed):
    resp = apf_client.get('/api/v1/apf/substitutes')
    assert resp.status_code == 200
    data = resp.json()

    assert set(data.keys()) == {'kpis', 'distribution', 'top_contributors'}
    kpis = data['kpis']
    assert kpis['total'] == 2  # seed has worker_a + worker_b
    assert kpis['available_now'] == 2
    assert 0 <= kpis['avg_reliability'] <= 100
    assert 0 <= kpis['multi_org_pct'] <= 100

    assert len(data['distribution']) == 1
    assert data['distribution'][0]['city'] == 'IntTestCity'
    assert data['distribution'][0]['total'] == 2
    assert data['distribution'][0]['coverage_pct'] == 100

    assert len(data['top_contributors']) == 2
    ids = {c['id'] for c in data['top_contributors']}
    assert str(seed.worker_a.id) in ids
    assert str(seed.worker_b.id) in ids


def test_network_pool_forbidden_for_worker(worker_a_client):
    resp = worker_a_client.get('/api/v1/apf/substitutes')
    assert resp.status_code == 403


def test_bulk_invite_creates_users(apf_client, seed):
    payload = {
        'invitees': [
            {'first_name': 'Ada', 'last_name': 'Bulk1', 'email': 'ada-bulk1@inttest.example', 'preferred_language': 'fr'},
            {'first_name': 'Bea', 'last_name': 'Bulk2', 'email': 'bea-bulk2@inttest.example', 'preferred_language': 'en'},
        ],
    }
    resp = apf_client.post('/api/v1/apf/substitutes/invite', json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data['invited_count'] == 2
    assert data['skipped_count'] == 0
    assert {o['status'] for o in data['outcomes']} == {'invited'}


def test_bulk_invite_skips_duplicates(apf_client, seed):
    payload = {
        'invitees': [
            {'first_name': 'Worker', 'last_name': 'Dup', 'email': seed.worker_a.email, 'preferred_language': 'fr'},
            {'first_name': 'New', 'last_name': 'Solo', 'email': 'new-solo@inttest.example', 'preferred_language': 'fr'},
        ],
    }
    resp = apf_client.post('/api/v1/apf/substitutes/invite', json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data['invited_count'] == 1
    assert data['skipped_count'] == 1
    statuses = {o['email']: o['status'] for o in data['outcomes']}
    assert statuses[seed.worker_a.email] == 'skipped'
    assert statuses['new-solo@inttest.example'] == 'invited'


def test_bulk_invite_forbidden_for_org_admin(org_admin_client):
    payload = {'invitees': [{'first_name': 'X', 'last_name': 'Y', 'email': 'x@y.example'}]}
    resp = org_admin_client.post('/api/v1/apf/substitutes/invite', json=payload)
    assert resp.status_code == 403


def test_recompute_reliability_runs_and_updates(apf_client, seed):
    # Trigger some response activity for worker_a so reliability is non-zero.
    rid = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{rid}/publish')
    apf_client.post(
        f'/api/v1/requests/{rid}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )

    resp = apf_client.post('/api/v1/apf/substitutes/recompute-reliability')
    assert resp.status_code == 200
    assert resp.json()['updated'] >= 2

    # Read back via network pool — worker_a should now have reliability > 0.
    pool = apf_client.get('/api/v1/apf/substitutes').json()
    worker_a_row = next(c for c in pool['top_contributors'] if c['id'] == str(seed.worker_a.id))
    assert worker_a_row['reliability'] > 0
