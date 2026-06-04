"""Tenant onboarding (MULTITENANCY_HANDOFF §6) — profile read/update, the
pending->onboarding flip on first sign-in, and onboarding->active completion."""
from uuid import uuid4

from app.models.enums import TenantStatus, UserRole
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User


def test_tenant_profile_get_and_update(apf_client, seed, db_session):
    got = apf_client.get('/api/v1/tenant/profile')
    assert got.status_code == 200, got.text
    assert got.json()['slug'] == seed.tenant.slug

    patched = apf_client.patch('/api/v1/tenant/profile', json={
        'name': 'Renamed Network', 'region': 'Estrie', 'preferred_language': 'bilingual',
    })
    assert patched.status_code == 200, patched.text
    data = patched.json()
    assert data['name'] == 'Renamed Network'
    assert data['region'] == 'Estrie'
    assert data['preferred_language'] == 'bilingual'


def test_onboarding_complete_activates(apf_client, seed, db_session):
    seed.tenant.status = TenantStatus.ONBOARDING
    seed.tenant.activated_at = None
    db_session.flush()

    resp = apf_client.post('/api/v1/tenant/onboarding/complete')
    assert resp.status_code == 200, resp.text
    assert resp.json()['status'] == 'active'

    db_session.refresh(seed.tenant)
    assert seed.tenant.status == TenantStatus.ACTIVE
    assert seed.tenant.activated_at is not None


def test_auth_sync_flips_pending_tenant_to_onboarding(seed, db_session):
    """First sign-in of an invited tenant admin starts onboarding."""
    from app.api.v1.auth import _start_onboarding_if_pending

    tenant = Tenant(id=uuid4(), name='Pending Co', slug=f'pending-{uuid4().hex[:6]}',
                    status=TenantStatus.PENDING)
    admin = User(id=uuid4(), first_name='New', last_name='Admin',
                 email=f'new-{uuid4().hex[:6]}@ex.example', role=UserRole.NETWORK_ADMIN)
    db_session.add_all([tenant, admin])
    db_session.flush()
    db_session.add(TenantMembership(
        id=uuid4(), user_id=admin.id, tenant_id=tenant.id,
        role=UserRole.NETWORK_ADMIN, is_active=True,
    ))
    db_session.flush()

    _start_onboarding_if_pending(db_session, admin)
    db_session.flush()
    db_session.refresh(tenant)
    assert tenant.status == TenantStatus.ONBOARDING


def test_tenant_profile_forbidden_for_worker(worker_a_client):
    assert worker_a_client.get('/api/v1/tenant/profile').status_code == 403
