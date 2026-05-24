"""APF snapshot endpoint + 60s memoization."""
import time

from app.api.v1.apf import _invalidate_snapshot_cache
from app.tests.conftest import request_payload


def test_apf_snapshot_shape_and_kpis(apf_client, seed):
    _invalidate_snapshot_cache()

    apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    resp = apf_client.get('/api/v1/apf/snapshot')
    assert resp.status_code == 200
    data = resp.json()

    assert set(data.keys()) >= {
        'kpis',
        'status_breakdown',
        'shortage_cities',
        'org_activity',
        'recent_closed_requests',
    }

    kpis = data['kpis']
    assert kpis['total_requests'] >= 1
    assert kpis['organizations_count'] == 1
    assert kpis['active_substitutes'] >= 2

    org_rows = data['org_activity']
    assert len(org_rows) == 1
    row = org_rows[0]
    assert row['name'] == seed.org.name
    assert row['total'] >= 1
    assert row['type'] == 'childcare'


def test_apf_snapshot_org_activity_zero_when_no_requests(apf_client, seed):
    _invalidate_snapshot_cache()

    resp = apf_client.get('/api/v1/apf/snapshot')
    data = resp.json()
    org_rows = data['org_activity']
    assert len(org_rows) == 1
    assert org_rows[0]['total'] == 0
    assert org_rows[0]['filled'] == 0
    assert org_rows[0]['open'] == 0


def test_apf_snapshot_cache_hits_within_ttl(apf_client, seed):
    _invalidate_snapshot_cache()

    first = apf_client.get('/api/v1/apf/snapshot').json()

    # Post a new request — would change total_requests if no cache.
    apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    second = apf_client.get('/api/v1/apf/snapshot').json()
    # Cache hit — payload unchanged despite the new request.
    assert second['kpis']['total_requests'] == first['kpis']['total_requests']

    # After invalidation, the new request shows up.
    _invalidate_snapshot_cache()
    third = apf_client.get('/api/v1/apf/snapshot').json()
    assert third['kpis']['total_requests'] == first['kpis']['total_requests'] + 1


def test_apf_snapshot_forbidden_for_org_admin(org_admin_client):
    _invalidate_snapshot_cache()

    resp = org_admin_client.get('/api/v1/apf/snapshot')
    assert resp.status_code == 403


def test_apf_snapshot_forbidden_for_worker(worker_a_client):
    _invalidate_snapshot_cache()

    resp = worker_a_client.get('/api/v1/apf/snapshot')
    assert resp.status_code == 403


# Touch the time import so static analysis doesn't drop it; useful if we later
# want to monkeypatch time.monotonic() for TTL expiry tests.
_ = time
