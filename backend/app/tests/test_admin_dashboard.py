"""Admin Coverage Desk dashboard: one-round-trip shape + scoped counts."""
from app.tests.conftest import request_payload


def test_dashboard_shape(org_admin_client, seed):
    resp = org_admin_client.get('/api/v1/admin/dashboard')
    assert resp.status_code == 200
    d = resp.json()
    assert d['coordinator']['first_name'] == seed.org_admin.first_name
    assert set(d['kpis']) == {
        'fill_rate_week', 'fill_rate_delta', 'avg_time_to_fill_minutes', 'open_count', 'substitutes_ready',
    }
    assert isinstance(d['live_requests'], list)
    assert len(d['week_fill_rate']) == 7
    assert isinstance(d['roster_today'], list)


def test_dashboard_open_count_reflects_published(org_admin_client, seed):
    before = org_admin_client.get('/api/v1/admin/dashboard').json()['kpis']['open_count']
    rid = org_admin_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.org_admin.id)).json()['id']
    org_admin_client.post(f'/api/v1/requests/{rid}/publish')
    after = org_admin_client.get('/api/v1/admin/dashboard').json()['kpis']['open_count']
    assert after == before + 1
