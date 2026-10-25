"""Lifecycle guards from the 2026-10-25 /platform review (findings P1–P4).

P1 — the generic user-remove routes must not bypass PlatformOperatorService
     (last-owner lock-out, operator-row cleanup, platform audit).
P2 — REMOVED is terminal (no resurrection via suspend/reactivate) and
     suspend/reactivate only move between the states they were built for.
P3 — removing a tenant closes its §2.2 access grants; an ACTIVE visit must
     not keep authorizing reads on the tombstoned data.
P4 — tenant.invite_resent must actually be committed, not rolled back with
     the request session.
"""
from uuid import uuid4

from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.enums import (
    PlatformOperatorRole,
    TenantAccessGrantStatus,
    TenantStatus,
    UserRole,
)
from app.models.platform_operator import PlatformOperator
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.models.tenant_membership import TenantMembership
from app.models.user import User


def _make_operator(db_session, *, role=PlatformOperatorRole.SUPPORT) -> tuple[User, PlatformOperator]:
    """A second, membership-less tier-0 operator."""
    user = User(
        id=uuid4(), clerk_user_id=f'int-guard-op-{uuid4().hex[:6]}',
        first_name='Olli', last_name='Perator',
        email=f'guard-op-{uuid4().hex[:6]}@staffig.example',
        role=UserRole.PLATFORM_ADMIN, preferred_language='en',
    )
    db_session.add(user)
    db_session.flush()
    operator = PlatformOperator(id=uuid4(), user_id=user.id, role=role, mfa_enabled=True)
    db_session.add(operator)
    db_session.flush()
    return user, operator


def _make_tenant(db_session, status: TenantStatus) -> Tenant:
    tenant = Tenant(
        id=uuid4(), name=f'Guard Net {uuid4().hex[:6]}', slug=f'guard-{uuid4().hex[:8]}',
        status=status, is_active=status not in (TenantStatus.SUSPENDED, TenantStatus.REMOVED),
    )
    db_session.add(tenant)
    db_session.flush()
    return tenant


# ── P1 — operators leave through /platform/operators only ─────────────────────

def test_users_routes_refuse_a_platform_operator(platform_admin_client, db_session, seed):
    target, _op = _make_operator(db_session)

    resp = platform_admin_client.delete(f'/api/v1/users/{target.id}')
    assert resp.status_code == 409, resp.text
    assert 'Operators screen' in resp.json()['detail']

    resp = platform_admin_client.post('/api/v1/users/remove-by-email', json={'email': target.email})
    assert resp.status_code == 409, resp.text

    # Neither attempt touched the account.
    db_session.refresh(target)
    assert target.is_active is True


def test_operator_route_still_removes_them(platform_admin_client, db_session, seed):
    target, operator = _make_operator(db_session)
    resp = platform_admin_client.delete(f'/api/v1/platform/operators/{operator.id}')
    assert resp.status_code == 204, resp.text
    db_session.expire_all()
    assert db_session.get(PlatformOperator, operator.id) is None
    assert db_session.get(User, target.id).is_active is False


def test_platform_admin_without_operator_row_stays_removable(platform_admin_client, db_session, seed):
    """The db-orphan species (role=platform_admin, no operator row) must keep
    flowing through the generic remove — housekeeping routes through it."""
    orphan = User(
        id=uuid4(), first_name='Orphe', last_name='Lin',
        email=f'guard-orphan-{uuid4().hex[:6]}@staffig.example',
        role=UserRole.PLATFORM_ADMIN, preferred_language='en',
    )
    db_session.add(orphan)
    db_session.flush()
    resp = platform_admin_client.delete(f'/api/v1/users/{orphan.id}')
    assert resp.status_code == 200, resp.text
    db_session.refresh(orphan)
    assert orphan.is_active is False


# ── P2 — no resurrection, no nonsense transitions ─────────────────────────────

def test_suspend_refuses_pending_and_removed(platform_admin_client, db_session, seed):
    pending = _make_tenant(db_session, TenantStatus.PENDING)
    resp = platform_admin_client.post(f'/api/v1/platform/tenants/{pending.id}/suspend')
    assert resp.status_code == 409, resp.text

    removed = _make_tenant(db_session, TenantStatus.REMOVED)
    resp = platform_admin_client.post(f'/api/v1/platform/tenants/{removed.id}/suspend')
    assert resp.status_code == 404, resp.text
    db_session.refresh(removed)
    assert removed.status == TenantStatus.REMOVED  # stayed buried


def test_reactivate_refuses_pending_and_removed(platform_admin_client, db_session, seed):
    pending = _make_tenant(db_session, TenantStatus.PENDING)
    resp = platform_admin_client.post(f'/api/v1/platform/tenants/{pending.id}/reactivate')
    assert resp.status_code == 409, resp.text
    db_session.refresh(pending)
    assert pending.status == TenantStatus.PENDING  # no onboarding skip

    removed = _make_tenant(db_session, TenantStatus.REMOVED)
    resp = platform_admin_client.post(f'/api/v1/platform/tenants/{removed.id}/reactivate')
    assert resp.status_code == 404, resp.text


def test_suspend_then_reactivate_still_works(platform_admin_client, db_session, seed):
    tenant = _make_tenant(db_session, TenantStatus.ACTIVE)
    assert platform_admin_client.post(
        f'/api/v1/platform/tenants/{tenant.id}/suspend'
    ).json()['status'] == 'suspended'
    assert platform_admin_client.post(
        f'/api/v1/platform/tenants/{tenant.id}/reactivate'
    ).json()['status'] == 'active'


def test_remove_refuses_already_removed(platform_admin_client, db_session, seed):
    removed = _make_tenant(db_session, TenantStatus.REMOVED)
    resp = platform_admin_client.delete(f'/api/v1/networks/{removed.id}')
    assert resp.status_code == 404, resp.text


# ── P3 — removal closes the §2.2 grants ───────────────────────────────────────

def test_remove_tenant_closes_its_access_grants(platform_admin_client, db_session, seed):
    from datetime import datetime, timedelta, timezone

    tenant = _make_tenant(db_session, TenantStatus.ACTIVE)
    visitor, _ = _make_operator(db_session)
    requester, _ = _make_operator(db_session)

    active = TenantAccessGrant(
        id=uuid4(), operator_user_id=visitor.id, tenant_id=tenant.id,
        reason='Review visit', status=TenantAccessGrantStatus.ACTIVE,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=4),
    )
    requested = TenantAccessGrant(
        id=uuid4(), operator_user_id=requester.id, tenant_id=tenant.id,
        reason='Review request', status=TenantAccessGrantStatus.REQUESTED,
    )
    db_session.add_all([active, requested])
    db_session.flush()

    # The visiting operator can read the tenant through the grant…
    from app.tests.conftest import _make_test_client
    visitor_client = _make_test_client(db_session, visitor.clerk_user_id, 'platform_admin')
    assert visitor_client.get('/api/v1/tenant/profile').status_code == 200

    # …until the tenant is removed.
    resp = platform_admin_client.delete(f'/api/v1/networks/{tenant.id}')
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    assert db_session.get(TenantAccessGrant, active.id).status == TenantAccessGrantStatus.EXPIRED
    assert db_session.get(TenantAccessGrant, requested.id).status == TenantAccessGrantStatus.DENIED
    assert visitor_client.get('/api/v1/tenant/profile').status_code == 404


def test_scope_ignores_grant_on_removed_tenant(platform_admin_client, db_session, seed):
    """Belt to the suspender above: even a grant row left ACTIVE on a removed
    tenant must not authorize scope."""
    from datetime import datetime, timedelta, timezone

    tenant = _make_tenant(db_session, TenantStatus.REMOVED)
    visitor, _ = _make_operator(db_session)
    db_session.add(TenantAccessGrant(
        id=uuid4(), operator_user_id=visitor.id, tenant_id=tenant.id,
        reason='Zombie grant', status=TenantAccessGrantStatus.ACTIVE,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=4),
    ))
    db_session.flush()

    from app.tests.conftest import _make_test_client
    visitor_client = _make_test_client(db_session, visitor.clerk_user_id, 'platform_admin')
    assert visitor_client.get('/api/v1/tenant/profile').status_code == 404


# ── P4 — resend writes a durable audit row ────────────────────────────────────

def test_resend_invite_audit_row_is_committed(platform_admin_client, db_session, seed):
    tenant = _make_tenant(db_session, TenantStatus.PENDING)
    admin = User(
        id=uuid4(), first_name='Pending', last_name='Admin',
        email=f'guard-pending-{uuid4().hex[:6]}@net.example',
        role=UserRole.NETWORK_ADMIN, preferred_language='en',
    )
    db_session.add(admin)
    db_session.flush()
    db_session.add(TenantMembership(
        id=uuid4(), user_id=admin.id, tenant_id=tenant.id, role=UserRole.NETWORK_ADMIN,
    ))
    db_session.flush()
    db_session.commit()  # settle the fixtures on a savepoint of their own

    resp = platform_admin_client.post(f'/api/v1/platform/tenants/{tenant.id}/resend')
    assert resp.status_code == 200, resp.text

    # Anything the route left uncommitted disappears here — exactly how the
    # bug hid: the row was flushed, read back fine, then rolled back with the
    # session when the request ended.
    db_session.rollback()

    row = db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == 'tenant.invite_resent',
            AuditLog.entity_id == tenant.id,
        )
    )
    assert row is not None, 'tenant.invite_resent must survive the session'
