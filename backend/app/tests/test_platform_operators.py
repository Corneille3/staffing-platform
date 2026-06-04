"""Operators & access — list/invite/role-change/remove with the lock-out rules
(PLATFORM_HANDOFF §2.1) + the platform audit trail (§4)."""
from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import select, update

from app.models.enums import PlatformOperatorRole, UserRole
from app.models.platform_audit_log import PlatformAuditLog
from app.models.platform_operator import PlatformOperator
from app.models.user import User
from app.tests.conftest import _make_test_client


def _add_operator(db_session, role: PlatformOperatorRole, clerk_sub: str | None = None) -> tuple:
    """A platform_admin user + PlatformOperator row. clerk_sub=None → pending."""
    user = User(
        id=uuid4(), clerk_user_id=clerk_sub, first_name='Tier', last_name='Zero',
        email=f'op-{uuid4().hex[:8]}@staffig.example', role=UserRole.PLATFORM_ADMIN,
        preferred_language='en',
    )
    db_session.add(user)
    db_session.flush()
    operator = PlatformOperator(id=uuid4(), user_id=user.id, role=role)
    db_session.add(operator)
    db_session.flush()
    return operator, user


@contextmanager
def _client_for(db_session, clerk_sub: str):
    client = _make_test_client(db_session, clerk_sub, 'platform_admin')
    try:
        yield client
    finally:
        from app.api.deps import get_db_session
        from app.main import app
        app.dependency_overrides.pop(get_db_session, None)


def _audit_actions(db_session) -> list[str]:
    return list(db_session.scalars(select(PlatformAuditLog.action)))


# ── list ──────────────────────────────────────────────────────────────────────

def test_owner_lists_operators(platform_admin_client, seed):
    resp = platform_admin_client.get('/api/v1/platform/operators')
    assert resp.status_code == 200, resp.text
    ops = resp.json()['operators']
    me = next(o for o in ops if o['email'] == seed.apf.email)
    assert me['role'] == 'owner'
    assert me['status'] == 'active'  # clerk_user_id is linked


def test_operator_can_list_but_support_cannot(db_session, seed):
    _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-lister')
    _add_operator(db_session, PlatformOperatorRole.SUPPORT, clerk_sub='int-op-support')

    with _client_for(db_session, 'int-op-lister') as client:
        assert client.get('/api/v1/platform/operators').status_code == 200
    with _client_for(db_session, 'int-op-support') as client:
        assert client.get('/api/v1/platform/operators').status_code == 403


# ── invite ────────────────────────────────────────────────────────────────────

def test_owner_invites_operator_pending_with_audit(platform_admin_client, seed, db_session):
    email = f'new-{uuid4().hex[:6]}@staffig.example'
    resp = platform_admin_client.post('/api/v1/platform/operators', json={
        'email': email, 'role': 'operator', 'first_name': 'New', 'last_name': 'Op',
    })
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data['status'] == 'pending'  # no Clerk identity yet
    assert data['role'] == 'operator'

    # DB-owns-roles: the user exists with platform_admin (surface gate)
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None and user.role == UserRole.PLATFORM_ADMIN
    assert 'operator.invited' in _audit_actions(db_session)


def test_invite_duplicate_email_409(platform_admin_client, seed):
    resp = platform_admin_client.post('/api/v1/platform/operators', json={
        'email': seed.apf.email, 'role': 'support', 'first_name': 'Dup', 'last_name': 'E',
    })
    assert resp.status_code == 409


def test_non_owner_operator_cannot_mutate(db_session, seed):
    target, _ = _add_operator(db_session, PlatformOperatorRole.SUPPORT, clerk_sub='int-op-target')
    _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-nonowner')

    with _client_for(db_session, 'int-op-nonowner') as client:
        assert client.post('/api/v1/platform/operators', json={
            'email': 'x@staffig.example', 'role': 'support',
            'first_name': 'X', 'last_name': 'Y',
        }).status_code == 403
        assert client.patch(
            f'/api/v1/platform/operators/{target.id}', json={'role': 'operator'},
        ).status_code == 403
        assert client.delete(f'/api/v1/platform/operators/{target.id}').status_code == 403


# ── lock-out rules ────────────────────────────────────────────────────────────

def test_cannot_remove_self(platform_admin_client, seed, db_session):
    my_op = db_session.scalar(
        select(PlatformOperator).where(PlatformOperator.user_id == seed.apf.id)
    )
    resp = platform_admin_client.delete(f'/api/v1/platform/operators/{my_op.id}')
    assert resp.status_code == 400
    assert 'yourself' in resp.json()['detail'].lower()


def test_cannot_demote_last_owner(platform_admin_client, seed, db_session):
    # Hermetic guard: tests run against the dev DB (savepoint-rolled-back), which
    # may hold committed owners. Demote them inside this transaction so the
    # seeded platform admin really is the last owner.
    db_session.execute(
        update(PlatformOperator)
        .where(
            PlatformOperator.role == PlatformOperatorRole.OWNER,
            PlatformOperator.user_id != seed.apf.id,
        )
        .values(role=PlatformOperatorRole.OPERATOR)
    )
    db_session.flush()
    my_op = db_session.scalar(
        select(PlatformOperator).where(PlatformOperator.user_id == seed.apf.id)
    )
    resp = platform_admin_client.patch(
        f'/api/v1/platform/operators/{my_op.id}', json={'role': 'operator'},
    )
    assert resp.status_code == 409
    assert 'last owner' in resp.json()['detail'].lower()


def test_can_remove_other_owner_when_two_exist(platform_admin_client, seed, db_session):
    other, other_user = _add_operator(db_session, PlatformOperatorRole.OWNER)
    resp = platform_admin_client.delete(f'/api/v1/platform/operators/{other.id}')
    assert resp.status_code == 204
    # Soft-deleted: user deactivated + email tombstoned, operator row gone
    db_session.refresh(other_user)
    assert other_user.is_active is False
    assert db_session.get(PlatformOperator, other.id) is None
    assert 'operator.removed' in _audit_actions(db_session)


def test_role_change_writes_audit(platform_admin_client, seed, db_session):
    target, _ = _add_operator(db_session, PlatformOperatorRole.SUPPORT)
    resp = platform_admin_client.patch(
        f'/api/v1/platform/operators/{target.id}', json={'role': 'operator'},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()['role'] == 'operator'
    assert 'operator.role_changed' in _audit_actions(db_session)


# ── resend ────────────────────────────────────────────────────────────────────

def test_resend_pending_ok_active_409(platform_admin_client, seed, db_session):
    pending, _ = _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub=None)
    active, _ = _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-act')

    assert platform_admin_client.post(
        f'/api/v1/platform/operators/{pending.id}/resend'
    ).status_code == 200
    assert platform_admin_client.post(
        f'/api/v1/platform/operators/{active.id}/resend'
    ).status_code == 409
