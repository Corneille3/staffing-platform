"""Platform-operator tier (MULTITENANCY_HANDOFF §5) — aggregate reads, invite,
lifecycle, and the privacy/permission boundary."""
from uuid import uuid4

from app.models.enums import TenantStatus


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
        'lead_segment', 'lead_source',  # tier-0 data: the sales lead it came from
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
    # Suspension targets a LIVE tenant (a pending one gets revoked, not
    # suspended — guarded since the 2026-10-25 lifecycle review), so walk it
    # through onboarding first.
    tenant2 = db_session.scalar(select(Tenant).where(Tenant.id == tid2))
    tenant2.status = TenantStatus.ACTIVE
    db_session.flush()
    # Can't suspend-then-revoke (revoke only for pending).
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/suspend').json()['status'] == 'suspended'
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/reactivate').json()['status'] == 'active'
    # Revoking a non-pending tenant is a 409.
    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid2}/revoke').status_code == 409


def test_console_lists_suspended_but_not_removed(platform_admin_client, seed, db_session):
    """Suspension must stay visible — its Reactivate button lives in that list
    (2026-08-06 regression: filtering on is_active hid suspended tenants).
    REMOVED is the only state the console forgets."""
    from sqlalchemy import select
    from app.models.tenant import Tenant

    suffix = uuid4().hex[:8]
    tid = platform_admin_client.post('/api/v1/platform/tenants', json={
        'name': f'Vis {suffix}', 'slug': f'vis-{suffix}',
        'admin_first_name': 'Vi', 'admin_last_name': 'Sible',
        'admin_email': f'vi-{suffix}@net.example',
    }).json()['id']
    # Only a live tenant can be suspended (2026-10-25 lifecycle guards) —
    # walk the invite through onboarding first.
    db_session.scalar(select(Tenant).where(Tenant.id == tid)).status = TenantStatus.ACTIVE
    db_session.flush()

    platform_admin_client.post(f'/api/v1/platform/tenants/{tid}/suspend')
    listed = platform_admin_client.get('/api/v1/platform/tenants').json()['tenants']
    row = next((r for r in listed if r['id'] == tid), None)
    assert row is not None, 'suspended tenant must stay listed'
    assert row['status'] == 'suspended'

    # Removing a SUSPENDED tenant works and takes it off the console.
    resp = platform_admin_client.delete(f'/api/v1/networks/{tid}')
    assert resp.status_code == 200, resp.text
    assert resp.json()['status'] == 'removed'
    listed_after = platform_admin_client.get('/api/v1/platform/tenants').json()['tenants']
    assert all(r['id'] != tid for r in listed_after)


def test_platform_endpoints_forbidden_for_network_admin(apf_client):
    assert apf_client.get('/api/v1/platform/tenants').status_code == 403
    assert apf_client.post('/api/v1/platform/tenants', json={
        'name': 'X', 'slug': 'x-net', 'admin_first_name': 'A',
        'admin_last_name': 'B', 'admin_email': 'a@b.example',
    }).status_code == 403


# ── suspension must actually bite (E2E finding 2026-06-06) ────────────────────
# Suspend used to be cosmetic: scope resolution never checked tenant status,
# so a suspended tenant's users (and grant visitors) kept full access.

def _suspend_in_db(db_session, tenant) -> None:
    from app.models.enums import TenantStatus
    tenant.status = TenantStatus.SUSPENDED
    tenant.is_active = False
    db_session.flush()


def test_suspension_locks_out_network_admin(apf_client, seed, db_session):
    assert apf_client.get('/api/v1/tenant/profile').status_code == 200
    _suspend_in_db(db_session, seed.tenant)
    locked = apf_client.get('/api/v1/tenant/profile')
    assert locked.status_code == 403
    assert 'suspended' in locked.json()['detail'].lower()


def test_suspension_locks_out_worker(worker_a_client, seed, db_session):
    assert worker_a_client.get('/api/v1/assignments').status_code == 200
    _suspend_in_db(db_session, seed.tenant)
    locked = worker_a_client.get('/api/v1/assignments')
    assert locked.status_code == 403
    assert 'suspended' in locked.json()['detail'].lower()


def test_suspending_own_tenant_keeps_platform_console_alive(platform_admin_client, seed):
    """The operator must keep /platform (to reactivate!) — their own suspended
    tenant just drops out of scope (profile 404 → workspace nav disappears)."""
    tid = str(seed.tenant.id)
    assert platform_admin_client.get('/api/v1/tenant/profile').status_code == 200

    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid}/suspend').status_code == 200
    assert platform_admin_client.get('/api/v1/platform/tenants').status_code == 200
    assert platform_admin_client.get('/api/v1/tenant/profile').status_code == 404

    assert platform_admin_client.post(f'/api/v1/platform/tenants/{tid}/reactivate').status_code == 200
    assert platform_admin_client.get('/api/v1/tenant/profile').status_code == 200
