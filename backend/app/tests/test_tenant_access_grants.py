"""Tenant access grants — the logged, consented, time-boxed exception
(PLATFORM_HANDOFF §2.2) + the 2FA gates (§1).

The acceptance walk (spec §6.3): a support operator requests access to a
tenant → the tenant admin approves → the operator gets read-only access that
auto-expires, with both audit trails written.
"""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

from sqlalchemy import select

from app.models.enums import (
    PlatformOperatorRole,
    TenantAccessGrantStatus,
    UserRole,
)
from app.models.platform_audit_log import PlatformAuditLog
from app.models.platform_operator import PlatformOperator
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import _make_test_client


@contextmanager
def _client_for(db_session, clerk_sub: str, role: str = 'platform_admin'):
    client = _make_test_client(db_session, clerk_sub, role)
    try:
        yield client
    finally:
        from app.api.deps import get_db_session
        from app.main import app
        app.dependency_overrides.pop(get_db_session, None)


def _setup(db_session, *, operator_role=PlatformOperatorRole.SUPPORT, mfa=True) -> SimpleNamespace:
    """A second tenant (with its own admin) + a membership-less operator."""
    tenant_b = Tenant(id=uuid4(), name='Grant Target Network', slug=f'grant-b-{uuid4().hex[:8]}')
    admin_b = User(
        id=uuid4(), clerk_user_id=f'int-tb-admin-{uuid4().hex[:6]}', first_name='Tia', last_name='Bee',
        email=f'tb-admin-{uuid4().hex[:6]}@inttest.example', role=UserRole.NETWORK_ADMIN,
        preferred_language='en',
    )
    operator = User(
        id=uuid4(), clerk_user_id=f'int-op-{uuid4().hex[:6]}', first_name='Sue', last_name='Port',
        email=f'op-sup-{uuid4().hex[:6]}@staffig.example', role=UserRole.PLATFORM_ADMIN,
        preferred_language='en',
    )
    db_session.add_all([tenant_b, admin_b, operator])
    db_session.flush()
    db_session.add(TenantMembership(
        id=uuid4(), user_id=admin_b.id, tenant_id=tenant_b.id, role=UserRole.NETWORK_ADMIN,
    ))
    db_session.add(PlatformOperator(
        id=uuid4(), user_id=operator.id, role=operator_role, mfa_enabled=mfa,
    ))
    db_session.flush()
    return SimpleNamespace(tenant_b=tenant_b, admin_b=admin_b, operator=operator)


# ── the §6.3 acceptance walk ──────────────────────────────────────────────────

def test_request_approve_readonly_then_block_writes(db_session, seed):
    ctx = _setup(db_session)

    # 1. support operator requests access with a reason
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        resp = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Debugging a stuck request for support ticket #42'},
        )
        assert resp.status_code == 201, resp.text
        grant_id = resp.json()['id']
        assert resp.json()['status'] == 'requested'

        # no access yet — scope has no tenant
        assert op_client.get('/api/v1/tenant/profile').status_code == 404

    # both audit trails recorded the ask
    assert 'access.requested' in set(db_session.scalars(select(PlatformAuditLog.action)))

    # 2. the tenant admin sees + approves it from inside the tenant
    with _client_for(db_session, ctx.admin_b.clerk_user_id, 'network_admin') as tb_client:
        listing = tb_client.get('/api/v1/tenant/access-grants')
        assert listing.status_code == 200
        assert any(g['id'] == grant_id for g in listing.json()['grants'])

        approved = tb_client.post(f'/api/v1/tenant/access-grants/{grant_id}/approve')
        assert approved.status_code == 200, approved.text
        assert approved.json()['status'] == 'active'
        assert approved.json()['expires_at'] is not None

        # membership access — the admin's own workspace, not a grant visit
        own_profile = tb_client.get('/api/v1/tenant/profile')
        assert own_profile.status_code == 200
        assert own_profile.json()['via_grant'] is False

    # 3. the operator now reads the tenant — and only reads
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        profile = op_client.get('/api/v1/tenant/profile')
        assert profile.status_code == 200
        assert profile.json()['name'] == ctx.tenant_b.name
        # flagged as a grant visit so the workspace UI shows read-only chrome
        assert profile.json()['via_grant'] is True

        # writes are blocked centrally — read-only grant
        assert op_client.patch(
            '/api/v1/tenant/profile', json={'name': 'Hijacked'},
        ).status_code == 403
        # ...including consenting on the tenant's behalf
        assert op_client.post(
            f'/api/v1/tenant/access-grants/{grant_id}/approve',
        ).status_code == 403

    # 4. the grant auto-expires → access is gone
    grant = db_session.get(TenantAccessGrant, grant_id)
    grant.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.flush()

    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        assert op_client.get('/api/v1/tenant/profile').status_code == 404
        # the platform list reflects the lazy sweep + a zero active count
        grants_resp = op_client.get('/api/v1/platform/access-grants')
        assert grants_resp.status_code == 200
        body = grants_resp.json()
        assert body['active_count'] == 0
        mine = next(g for g in body['grants'] if g['id'] == grant_id)
        assert mine['status'] == 'expired'


# ── request guards ────────────────────────────────────────────────────────────

def test_operator_without_mfa_cannot_request(db_session, seed):
    ctx = _setup(db_session, mfa=False)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        resp = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'No MFA — should be rejected'},
        )
        assert resp.status_code == 403
        assert 'two-factor' in resp.json()['detail'].lower()


def test_suspension_cuts_grant_access(db_session, seed):
    """Suspending a tenant must also cut an operator's ACTIVE grant — the
    operator keeps /platform but the granted workspace drops out of scope
    (E2E finding 2026-06-06: suspension used to be cosmetic)."""
    from app.models.enums import TenantStatus

    ctx = _setup(db_session)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        grant_id = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Investigating ticket #99'},
        ).json()['id']
    with _client_for(db_session, ctx.admin_b.clerk_user_id, 'network_admin') as tb_client:
        assert tb_client.post(f'/api/v1/tenant/access-grants/{grant_id}/approve').status_code == 200
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        assert op_client.get('/api/v1/tenant/profile').status_code == 200

        # platform owner suspends the tenant (status flipped directly — the
        # endpoint itself is covered in test_platform)
        ctx.tenant_b.status = TenantStatus.SUSPENDED
        ctx.tenant_b.is_active = False
        db_session.flush()

        assert op_client.get('/api/v1/tenant/profile').status_code == 404
        # the platform surface stays usable
        assert op_client.get('/api/v1/platform/tenants').status_code == 200


def test_mfa_gate_relaxed_when_not_enforced(db_session, seed, monkeypatch):
    """PLATFORM_MFA_ENFORCED=false lets a no-MFA operator through the 2FA
    gate (Clerk MFA is a paid feature — pre-client deployments defer it).
    Role gates are untouched."""
    from app.core.config import settings as app_settings
    monkeypatch.setattr(app_settings, 'platform_mfa_enforced', False)
    ctx = _setup(db_session, mfa=False)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        resp = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'MFA gate relaxed — should pass'},
        )
        assert resp.status_code == 201


def test_cannot_request_own_tenant(platform_admin_client, seed):
    """The seeded platform admin is a member of the seed tenant — pointless grant."""
    resp = platform_admin_client.post(
        f'/api/v1/platform/tenants/{seed.tenant.id}/access-request',
        json={'reason': 'I already live here'},
    )
    assert resp.status_code == 409
    assert 'member' in resp.json()['detail'].lower()


def test_duplicate_request_409(db_session, seed):
    ctx = _setup(db_session)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        first = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'First request for ticket #1'},
        )
        assert first.status_code == 201
        second = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Second request for ticket #2'},
        )
        assert second.status_code == 409


# ── consent guards ────────────────────────────────────────────────────────────

def test_deny_flow(db_session, seed):
    ctx = _setup(db_session)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        grant_id = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Will be denied'},
        ).json()['id']

    with _client_for(db_session, ctx.admin_b.clerk_user_id, 'network_admin') as tb_client:
        denied = tb_client.post(f'/api/v1/tenant/access-grants/{grant_id}/deny')
        assert denied.status_code == 200
        assert denied.json()['status'] == 'denied'
        # a settled request can't be approved afterwards
        assert tb_client.post(
            f'/api/v1/tenant/access-grants/{grant_id}/approve'
        ).status_code == 409

    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        assert op_client.get('/api/v1/tenant/profile').status_code == 404


def test_foreign_tenant_admin_cannot_approve(db_session, seed):
    """The seed tenant's admin must not act on another tenant's grant (404)."""
    ctx = _setup(db_session)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        grant_id = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Foreign admin should not see this'},
        ).json()['id']

    # seed.apf is the admin of the *seed* tenant, not tenant B
    with _client_for(db_session, 'int-apf', 'network_admin') as foreign_admin:
        resp = foreign_admin.post(f'/api/v1/tenant/access-grants/{grant_id}/approve')
        assert resp.status_code == 404


# ── auto-approve toggle (§2.2 Require approval = OFF) ────────────────────────

def test_auto_approve_when_toggle_off(db_session, seed, platform_admin_client):
    resp = platform_admin_client.patch(
        '/api/v1/platform/settings', json={'access_requires_approval': False},
    )
    assert resp.status_code == 200 and resp.json()['access_requires_approval'] is False

    ctx = _setup(db_session)
    with _client_for(db_session, ctx.operator.clerk_user_id) as op_client:
        granted = op_client.post(
            f'/api/v1/platform/tenants/{ctx.tenant_b.id}/access-request',
            json={'reason': 'Auto-approved — toggle is off'},
        )
        assert granted.status_code == 201, granted.text
        assert granted.json()['status'] == 'active'
        assert granted.json()['expires_at'] is not None
        # immediate read-only access, no tenant-admin step
        assert op_client.get('/api/v1/tenant/profile').status_code == 200


# ── 2FA gates on sensitive tier-0 actions (§1) ────────────────────────────────

def test_owner_without_mfa_blocked_from_sensitive_actions(db_session, seed):
    owner = User(
        id=uuid4(), clerk_user_id='int-owner-nomfa', first_name='No', last_name='Mfa',
        email=f'owner-nomfa-{uuid4().hex[:6]}@staffig.example', role=UserRole.PLATFORM_ADMIN,
        preferred_language='en',
    )
    db_session.add(owner)
    db_session.flush()
    db_session.add(PlatformOperator(
        id=uuid4(), user_id=owner.id, role=PlatformOperatorRole.OWNER, mfa_enabled=False,
    ))
    db_session.flush()

    with _client_for(db_session, 'int-owner-nomfa') as client:
        # reads still fine
        assert client.get('/api/v1/platform/settings').status_code == 200
        assert client.get('/api/v1/platform/operators').status_code == 200
        # sensitive actions blocked until 2FA is on
        resp = client.patch('/api/v1/platform/settings', json={'trial_length_days': 7})
        assert resp.status_code == 403
        assert 'two-factor' in resp.json()['detail'].lower()
        assert client.post('/api/v1/platform/operators', json={
            'email': 'x@staffig.example', 'role': 'support',
            'first_name': 'X', 'last_name': 'Y',
        }).status_code == 403
        assert client.post(
            f'/api/v1/platform/tenants/{seed.tenant.id}/suspend'
        ).status_code == 403


def test_support_cannot_touch_tenant_lifecycle(db_session, seed):
    """§1 capability table: support can't invite/suspend tenants even with 2FA."""
    ctx = _setup(db_session, operator_role=PlatformOperatorRole.SUPPORT, mfa=True)
    with _client_for(db_session, ctx.operator.clerk_user_id) as client:
        assert client.post(
            f'/api/v1/platform/tenants/{seed.tenant.id}/suspend'
        ).status_code == 403

