"""Email case-insensitivity (Finding #2, 2026-08-06 test round).

An invite created as `Name@X.com` must match a later Clerk sign-in of
`name@x.com` — Clerk lowercases sign-in emails, and phones autocapitalize,
so a stored capital sent the invitee to /not-invited. Invites normalize at
the schema boundary; /auth/sync compares normalized.
"""
from uuid import uuid4

from fastapi.testclient import TestClient
from jose import jwt as jose_jwt
from sqlalchemy import select

from app.api.deps import get_db_session
from app.main import app
from app.models.enums import UserRole
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.coordinator import CoordinatorInviteCreate
from app.schemas.worker import WorkerInviteCreate


# ── schema-level normalization (fast, no DB) ───────────────────────────────────

def test_worker_invite_lowercases_email():
    payload = WorkerInviteCreate(first_name='A', last_name='B', email='  MiXeD@CasE.CoM ')
    assert payload.email == 'mixed@case.com'


def test_coordinator_invite_lowercases_email():
    payload = CoordinatorInviteCreate(
        first_name='A', last_name='B', email='Coord@Example.CA', org_ids=[],
    )
    assert payload.email == 'coord@example.ca'


# ── the real bug: invite mixed-case, stored + guarded lowercase ────────────────

def test_worker_invited_mixed_case_stored_lowercase(apf_client, seed, db_session):
    email_typed = f'MiGuel.{uuid4().hex[:6]}@Example.COM'
    resp = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Miguel', 'last_name': 'Santos', 'email': email_typed,
    })
    assert resp.status_code == 201, resp.text
    row = db_session.scalar(select(User).where(User.id == resp.json()['id']))
    assert row.email == email_typed.lower()


def test_duplicate_invite_is_case_insensitive(apf_client, seed):
    base = f'dup.{uuid4().hex[:6]}@example.com'
    first = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Dup', 'last_name': 'One', 'email': base,
    })
    assert first.status_code == 201, first.text
    # Same address, different case → the uniqueness guard must still fire.
    second = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Dup', 'last_name': 'Two', 'email': base.upper(),
    })
    assert second.status_code == 409


def test_auth_sync_matches_case_insensitively(db_session, seed):
    """End-to-end repro: DB holds a mixed-case invite (legacy row, pre-schema-fix),
    Clerk signs in lowercase → /auth/sync must link, not 403."""
    typed = f'Legacy.{uuid4().hex[:6]}@Example.COM'
    invited = User(
        id=uuid4(), first_name='Legacy', last_name='Invite',
        email=typed,  # original case, as a pre-fix invite row would be
        role=UserRole.WORKER, preferred_language='fr',
    )
    db_session.add(invited)
    db_session.flush()
    db_session.add(TenantMembership(
        id=uuid4(), user_id=invited.id, tenant_id=seed.tenant.id, role=UserRole.WORKER,
    ))
    db_session.flush()

    # Clerk hands us the lowercase form + a fresh sub (no clerk link yet).
    token = jose_jwt.encode(
        {'sub': f'clerk-{uuid4().hex[:8]}', 'email': typed.lower(),
         'public_metadata': {'role': 'worker'}},
        'test-secret', algorithm='HS256',
    )
    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    try:
        client = TestClient(app, headers={'Authorization': f'Bearer {token}'})
        resp = client.post('/api/v1/auth/sync')
        assert resp.status_code == 200, resp.text
        assert resp.json()['id'] == str(invited.id)
    finally:
        app.dependency_overrides.pop(get_db_session, None)
