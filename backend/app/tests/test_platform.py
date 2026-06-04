"""Platform-operator tier (MULTITENANCY_HANDOFF §5) — aggregate reads, invite,
lifecycle, and the privacy/permission boundary."""
from uuid import uuid4


def test_platform_tenants_overview_shape_and_counts(platform_admin_client, seed):
    resp = platform_admin_client.get('/api/v1/platform/tenants')
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data['kpis']) == {
        'active_tenants', 'total_orgs', 'total_substitutes', 'weighted_fill_rate',
    }
    row = next(r for r in data['tenants'] if r['slug'] == seed.tenant.slug)
    # Seed: one org, two substitutes (worker_a + worker_b TenantMemberships).
    assert row['org_count'] >= 1
    assert row['substitute_count'] >= 2
    assert row['status'] == 'active'
    # Privacy boundary: rows carry counts + admin identity only — never worker
    # names or request titles.
    assert set(row) == {
        'id', 'name', 'slug', 'region', 'status', 'org_count',
        'substitute_count', 'fill_rate_30d', 'admin_name', 'admin_email', 'since',
    }


def test_platform_invite_then_lifecycle(platform_admin_client, seed, db_session):
    from sqlalchemy import select
    from app.models.tenant import Tenant

    suffix = uuid4().hex[:8]
    created = platform_admin_client.post('/api/v1/platform/tenants', json={
        'name': f'Net {suffix}', 'slug': f'net-{suffix}', 'region': 'Québec',
        'admin_first_name': 'Dana', 'admin_last_name': 'Lead',
        'admin_email': f'dana-{suffix}@net.example', 'admin_preferred_language': 'en',
    })
    assert created.status_code == 201, created.text
    tid = created.json()['id']
    assert created.json()['status'] == 'pending'

    # Revoke is allowed while pending.
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid}/resend').status_code == 200
    revoked = platform_admin_client.post(f'/api/v1/platform/tenants/{tid}/revoke')
    assert revoked.status_code == 200

    # A fresh tenant for suspend/reactivate.
    suffix2 = uuid4().hex[:8]
    tid2 = platform_admin_client.post('/api/v1/platform/tenants', json={
        'name': f'Net {suffix2}', 'slug': f'net-{suffix2}',
        'admin_first_name': 'Sam', 'admin_last_name': 'Lead',
        'admin_email': f'sam-{suffix2}@net.example',
    }).json()['id']
    # Can't suspend-then-revoke (revoke only for pending).
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/suspend').json()['status'] == 'suspended'
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/reactivate').json()['status'] == 'active'
    # Revoking a non-pending tenant is a 409.
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/revoke').status_code == 409


def test_platform_endpoints_forbidden_for_network_admin(apf_client):
    assert apf_client.get('/api/v1/platform/tenants').status_code == 403
    assert apf_client.post('/api/v1/platform/tenants', json={
        'name': 'X', 'slug': 'x-net', 'admin_first_name': 'A',
        'admin_last_name': 'B', 'admin_email': 'a@b.example',
    }).status_code == 403
