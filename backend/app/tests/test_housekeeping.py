"""Housekeeping orphan scan + cleanup (2026-06-06 E2E finding #4).

Clerk's Backend API is monkeypatched at the housekeeping-service import site —
no network. Assertions are containment-based, not exact counts: tests run
against the dev DB (savepoint-rolled-back), which may hold committed rows
that legitimately scan as orphans.
"""
from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import select

from app.models.enums import PlatformOperatorRole, UserRole
from app.models.platform_audit_log import PlatformAuditLog
from app.models.platform_operator import PlatformOperator
from app.models.user import User
from app.tests.conftest import _make_test_client

SCAN_URL = '/api/v1/platform/housekeeping/orphans'
REMOVE_URL = '/api/v1/platform/housekeeping/orphans/remove'
SERVICE = 'app.services.housekeeping_service'


def _clerk_record(clerk_id: str, email: str | None, **extra) -> dict:
    record = {
        'id': clerk_id,
        'first_name': 'Stray',
        'last_name': 'Account',
        'created_at': 1765000000000,  # epoch ms
        'last_sign_in_at': None,
    }
    if email:
        record['primary_email_address_id'] = 'em_1'
        record['email_addresses'] = [{'id': 'em_1', 'email_address': email}]
    record.update(extra)
    return record


def _add_db_orphan(db_session) -> User:
    """An active user with no memberships and no operator row — the species
    invisible to every management listing."""
    user = User(
        id=uuid4(), clerk_user_id=None, first_name='Or', last_name='Phan',
        email=f'orphan-{uuid4().hex[:8]}@inttest.example', role=UserRole.WORKER,
        preferred_language='en',
    )
    db_session.add(user)
    db_session.flush()
    return user


@contextmanager
def _support_client(db_session):
    user = User(
        id=uuid4(), clerk_user_id='int-hk-support', first_name='Sup', last_name='Port',
        email=f'support-{uuid4().hex[:8]}@staffig.example', role=UserRole.PLATFORM_ADMIN,
        preferred_language='en',
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(PlatformOperator(
        id=uuid4(), user_id=user.id, role=PlatformOperatorRole.SUPPORT, mfa_enabled=True,
    ))
    db_session.flush()
    client = _make_test_client(db_session, 'int-hk-support', 'platform_admin')
    try:
        yield client
    finally:
        from app.api.deps import get_db_session
        from app.main import app
        app.dependency_overrides.pop(get_db_session, None)


# ── scan ──────────────────────────────────────────────────────────────────────

def test_scan_classifies_clerk_only_orphans(platform_admin_client, seed, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: [
        # Linked by clerk_user_id → not an orphan.
        _clerk_record('int-worker-a', 'somewhere-else@inttest.example'),
        # Linked by email (Clerk id unknown to the DB) → not an orphan.
        _clerk_record('user_unknown_id', seed.worker_b.email),
        # Matches nothing → the uninvited-sign-up species.
        _clerk_record('user_stray', 'uninvited@inttest.example', last_sign_in_at=1765100000000),
    ])

    resp = platform_admin_client.get(SCAN_URL)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['clerk_available'] is True

    clerk_ids = [o['id'] for o in data['clerk_only']]
    assert 'user_stray' in clerk_ids
    assert 'int-worker-a' not in clerk_ids
    assert 'user_unknown_id' not in clerk_ids

    stray = next(o for o in data['clerk_only'] if o['id'] == 'user_stray')
    assert stray['email'] == 'uninvited@inttest.example'
    assert stray['kind'] == 'clerk'
    assert stray['created_at'] is not None
    assert stray['last_sign_in_at'] is not None


def test_scan_finds_db_only_orphans_but_not_members_or_operators(
    platform_admin_client, seed, db_session, monkeypatch,
):
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: [])
    orphan = _add_db_orphan(db_session)

    resp = platform_admin_client.get(SCAN_URL)
    assert resp.status_code == 200, resp.text
    db_ids = [o['id'] for o in resp.json()['db_only']]

    assert str(orphan.id) in db_ids
    # Membership holders and platform operators are reachable → never flagged.
    assert str(seed.worker_a.id) not in db_ids
    assert str(seed.org_admin.id) not in db_ids
    assert str(seed.apf.id) not in db_ids  # operator row (platform_admin_client fixture)


def test_scan_marks_clerk_unavailable(platform_admin_client, seed, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: None)

    resp = platform_admin_client.get(SCAN_URL)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['clerk_available'] is False
    assert data['clerk_only'] == []


def test_support_cannot_scan(db_session, seed, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: [])
    with _support_client(db_session) as client:
        assert client.get(SCAN_URL).status_code == 403


# ── remove: clerk kind ────────────────────────────────────────────────────────

def test_remove_clerk_orphan_deletes_and_audits(platform_admin_client, seed, db_session, monkeypatch):
    deleted: list[str] = []
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: [])
    monkeypatch.setattr(
        f'{SERVICE}.fetch_user_details',
        lambda uid: _clerk_record(uid, 'uninvited@inttest.example'),
    )
    monkeypatch.setattr(f'{SERVICE}.delete_clerk_user', lambda uid: deleted.append(uid) or True)

    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'clerk', 'id': 'user_stray'})
    assert resp.status_code == 200, resp.text
    assert deleted == ['user_stray']
    # The response is a fresh scan, so the UI list stays honest.
    assert 'clerk_only' in resp.json()

    audit = db_session.scalar(select(PlatformAuditLog).where(
        PlatformAuditLog.action == 'housekeeping.clerk_orphan_removed',
    ))
    assert audit is not None
    assert audit.payload['email'] == 'uninvited@inttest.example'


def test_remove_clerk_orphan_409_when_linked_to_active_user(
    platform_admin_client, seed, monkeypatch,
):
    monkeypatch.setattr(f'{SERVICE}.delete_clerk_user', lambda uid: (_ for _ in ()).throw(AssertionError('must not delete')))

    # Stale scan result: the account got linked between scan and click.
    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'clerk', 'id': 'int-worker-a'})
    assert resp.status_code == 409
    assert 'linked' in resp.json()['detail']


def test_remove_clerk_orphan_409_when_email_now_active(platform_admin_client, seed, monkeypatch):
    monkeypatch.setattr(
        f'{SERVICE}.fetch_user_details',
        lambda uid: _clerk_record(uid, seed.worker_a.email),
    )
    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'clerk', 'id': 'user_now_invited'})
    assert resp.status_code == 409
    assert 'belongs to an active user' in resp.json()['detail']


def test_remove_clerk_orphan_502_when_clerk_rejects(platform_admin_client, seed, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.fetch_user_details', lambda uid: {})
    monkeypatch.setattr(f'{SERVICE}.delete_clerk_user', lambda uid: False)

    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'clerk', 'id': 'user_stray'})
    assert resp.status_code == 502


# ── remove: db kind ───────────────────────────────────────────────────────────

def test_remove_db_orphan_tombstones_user(platform_admin_client, seed, db_session, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.list_clerk_users', lambda: [])
    orphan = _add_db_orphan(db_session)
    original_email = orphan.email

    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'db', 'id': str(orphan.id)})
    assert resp.status_code == 200, resp.text

    db_session.refresh(orphan)
    assert orphan.is_active is False
    assert orphan.email != original_email  # tombstoned, email freed for re-invite

    # Gone from the fresh scan in the response.
    assert str(orphan.id) not in [o['id'] for o in resp.json()['db_only']]


def test_remove_db_orphan_409_when_reachable(platform_admin_client, seed):
    # worker_a holds an active TenantMembership — not an orphan, and this
    # endpoint must not double as a general user-removal API.
    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'db', 'id': str(seed.worker_a.id)})
    assert resp.status_code == 409
    assert 'reachable' in resp.json()['detail']


def test_remove_db_orphan_invalid_uuid_422(platform_admin_client, seed):
    resp = platform_admin_client.post(REMOVE_URL, json={'kind': 'db', 'id': 'not-a-uuid'})
    assert resp.status_code == 422


def test_support_cannot_remove(db_session, seed, monkeypatch):
    monkeypatch.setattr(f'{SERVICE}.fetch_user_details', lambda uid: {})
    monkeypatch.setattr(f'{SERVICE}.delete_clerk_user', lambda uid: True)
    with _support_client(db_session) as client:
        resp = client.post(REMOVE_URL, json={'kind': 'clerk', 'id': 'user_stray'})
        assert resp.status_code == 403
