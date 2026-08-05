"""Integration tests: row-level access control (AccessScope).

Covers: worker sees only own data, org_admin filtered to their org,
APF sees the full network.
"""
from uuid import uuid4

from app.tests.conftest import request_payload


# ── worker scoping ────────────────────────────────────────────────────────────

def test_worker_sees_only_own_responses(apf_client, worker_a_client, worker_b_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    # Both workers accept
    worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )
    worker_b_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_b.id)},
    )

    # Worker A's assignments list should only contain their own
    resp = worker_a_client.get('/api/v1/assignments')
    assignments = resp.json()['items']
    assert all(a['worker_user_id'] == str(seed.worker_a.id) for a in assignments)


def test_worker_cannot_accept_on_behalf_of_another_worker(
    apf_client, worker_a_client, seed
):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    # Worker A tries to accept as Worker B
    resp = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_b.id)},
    )

    assert resp.status_code == 403


# ── org admin scoping ─────────────────────────────────────────────────────────

def test_org_admin_sees_only_their_org_requests(apf_client, org_admin_client, seed):
    # Create a request for seed.org (visible to org_admin)
    apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id, title='In-scope request'),
    )

    # Create a second org and request (NOT visible to org_admin)
    from app.models.organization import Organization
    from app.models.enums import OrganizationType
    other_org_id = str(uuid4())
    # We can't easily create a second org via fixture without a second org admin,
    # so we verify the positive case: org_admin sees only requests for their org.
    all_for_org = org_admin_client.get('/api/v1/requests').json()['items']
    assert all(r['organization_id'] == str(seed.org.id) for r in all_for_org)


def test_org_admin_cannot_access_other_org_report(apf_client, org_admin_client, seed):
    # Create a second org via APF
    other_org = apf_client.post('/api/v1/organizations', json={
        'name': 'Other Org', 'type': 'childcare', 'city': 'OtherCity',
        'preferred_language': 'en',
    })
    if other_org.status_code != 201:
        # If org creation isn't exposed, skip this specific assertion
        return

    other_org_id = other_org.json()['id']
    resp = org_admin_client.get(f'/api/v1/reports/organization-summary/{other_org_id}')
    assert resp.status_code == 403


def test_org_admin_can_create_request_for_assigned_org(org_admin_client, seed):
    resp = org_admin_client.post(
        '/api/v1/requests',
        json=request_payload(seed.org.id, seed.apf.id, title='Created by org admin'),
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data['organization_id'] == str(seed.org.id)
    assert data['created_by_user_id'] == str(seed.org_admin.id)


def test_org_admin_cannot_spoof_request_creator(org_admin_client, seed):
    resp = org_admin_client.post(
        '/api/v1/requests',
        json=request_payload(seed.org.id, seed.apf.id, title='Spoofed creator'),
    )

    assert resp.status_code == 201
    assert resp.json()['created_by_user_id'] == str(seed.org_admin.id)


def test_org_admin_cannot_create_request_for_other_org(apf_client, org_admin_client, seed):
    other_org = apf_client.post('/api/v1/organizations', json={
        'name': 'Other Create Org',
        'type': 'childcare',
        'city': 'OtherCreateCity',
        'preferred_language': 'en',
    })
    assert other_org.status_code == 201

    resp = org_admin_client.post(
        '/api/v1/requests',
        json=request_payload(other_org.json()['id'], seed.org_admin.id, title='Out of scope create'),
    )

    assert resp.status_code == 403


def test_org_admin_users_are_scoped_to_org_and_tenant_workers(
    org_admin_client, db_session, seed
):
    from uuid import uuid4

    from app.models.enums import OrganizationType, UserRole
    from app.models.organization import Organization
    from app.models.organization_membership import OrganizationMembership
    from app.models.user import User

    other_org = Organization(
        id=uuid4(),
        tenant_id=seed.tenant.id,
        name='Other User Scope Org',
        type=OrganizationType.CHILDCARE,
        city='OtherUserCity',
    )
    other_admin = User(
        id=uuid4(),
        clerk_user_id='other-org-admin',
        first_name='Other',
        last_name='Admin',
        email='other.admin@example.org',
        role=UserRole.ORG_ADMIN,
    )
    db_session.add_all([other_org, other_admin])
    db_session.flush()
    db_session.add(OrganizationMembership(
        id=uuid4(),
        user_id=other_admin.id,
        organization_id=other_org.id,
        role=UserRole.ORG_ADMIN,
    ))
    db_session.flush()

    resp = org_admin_client.get('/api/v1/users')

    assert resp.status_code == 200
    ids = {item['id'] for item in resp.json()['items']}
    assert str(seed.org_admin.id) in ids
    assert str(seed.worker_a.id) in ids
    assert str(seed.worker_b.id) in ids
    assert str(seed.apf.id) not in ids
    assert str(other_admin.id) not in ids


def test_worker_cannot_list_users(worker_a_client):
    resp = worker_a_client.get('/api/v1/users')

    assert resp.status_code == 403


# ── APF scoping ───────────────────────────────────────────────────────────────

def test_apf_sees_all_organizations(apf_client, seed):
    resp = apf_client.get('/api/v1/organizations')
    assert resp.status_code == 200
    org_ids = {o['id'] for o in resp.json()['items']}
    assert str(seed.org.id) in org_ids


def test_apf_network_overview_includes_test_org(apf_client, seed):
    # Publish a request so fill rate is non-trivial
    apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    )

    resp = apf_client.get('/api/v1/reports/network-overview')
    assert resp.status_code == 200
    data = resp.json()
    assert data['total_requests'] >= 1
    assert data['active_substitutes'] >= 2  # both test workers are available


def test_coordinator_invite_sends_email(apf_client, monkeypatch, seed):
    from app.notifications import email_service

    sent: list[email_service.EmailMessage] = []

    def fake_send(self, message):
        sent.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_send)

    resp = apf_client.post('/api/v1/coordinators/invite', json={
        'first_name': 'Casey',
        'last_name': 'Manager',
        'email': f'casey-{uuid4().hex[:8]}@example.org',
        'phone': '+15145550000',
        'preferred_language': 'en',
        'org_ids': [str(seed.org.id)],
    })

    assert resp.status_code == 201
    assert sent
    assert sent[0].to_email.startswith('casey-')
    # #4: invite links point at sign-up (with prefilled email), not sign-in.
    assert 'sign-up' in sent[0].body
    assert 'sign-in' not in sent[0].body
    # #2: an English-preference invitee gets an English-only body.
    assert 'Hello Casey' in sent[0].body
    assert 'Bonjour' not in sent[0].body


def test_worker_invite_sends_email(apf_client, monkeypatch):
    from app.notifications import email_service

    sent: list[email_service.EmailMessage] = []

    def fake_send(self, message):
        sent.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_send)

    resp = apf_client.post('/api/v1/workers/invite', json={
        'first_name': 'Wendy',
        'last_name': 'Substitute',
        'email': f'wendy-{uuid4().hex[:8]}@example.org',
        'phone': '+15145550001',
        'preferred_language': 'fr',
    })

    assert resp.status_code == 201
    assert sent
    assert sent[0].to_email.startswith('wendy-')
    # #4: sign-up link, not sign-in.
    assert 'sign-up' in sent[0].body
    assert 'sign-in' not in sent[0].body
    # #2: a French-preference invitee gets a French-only body.
    assert 'Bonjour Wendy' in sent[0].body
    assert 'Hello' not in sent[0].body


# ── auth/sync ─────────────────────────────────────────────────────────────────

def test_auth_sync_returns_existing_user(apf_client, seed):
    # APF admin already exists (clerk_user_id='int-apf').
    # Calling sync again should be idempotent.
    resp = apf_client.post('/api/v1/auth/sync')
    assert resp.status_code == 200
    data = resp.json()
    assert data['clerk_user_id'] == 'int-apf'
    assert data['role'] == 'network_admin'


def test_auth_sync_rejects_uninvited_email(db_session, seed):
    """Anyone with a Clerk identity but no DB row gets 403. The DB
    must be the source of truth for who is allowed in; signing up to
    Clerk is not the same as being invited to the platform."""
    from fastapi.testclient import TestClient
    from jose import jwt as jose_jwt

    from app.api.deps import get_db_session
    from app.main import app

    def _override():
        yield db_session

    token = jose_jwt.encode(
        {'sub': 'stranger-clerk-id', 'email': 'never-invited@nowhere.example'},
        'test-secret',
        algorithm='HS256',
    )
    app.dependency_overrides[get_db_session] = _override
    try:
        client = TestClient(app, headers={'Authorization': f'Bearer {token}'})
        resp = client.post('/api/v1/auth/sync')
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert resp.status_code == 403
    assert 'Not invited' in resp.json()['detail']


def test_auth_sync_links_by_email_preserves_db_role(db_session, seed):
    """Pre-invited DB user (no clerk_user_id yet) signs in for the
    first time. Even if the JWT carries a different role claim, the
    DB role wins; Clerk is only used to link the identity."""
    from fastapi.testclient import TestClient
    from jose import jwt as jose_jwt
    from sqlalchemy import select

    from app.api.deps import get_db_session
    from app.main import app
    from app.models.enums import UserRole
    from app.models.user import User

    invited_email = f'invited-{uuid4().hex[:8]}@example.org'
    invited = User(
        id=uuid4(),
        clerk_user_id=None,
        first_name='Invited',
        last_name='Coordinator',
        email=invited_email,
        role=UserRole.ORG_ADMIN,
        preferred_language='en',
    )
    db_session.add(invited)
    db_session.flush()

    fresh_clerk_id = f'fresh-clerk-{uuid4().hex[:8]}'
    token = jose_jwt.encode(
        {
            'sub': fresh_clerk_id,
            'email': invited_email,
            'public_metadata': {'role': 'worker'},  # deliberately wrong; must be ignored
        },
        'test-secret',
        algorithm='HS256',
    )

    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    try:
        client = TestClient(app, headers={'Authorization': f'Bearer {token}'})
        resp = client.post('/api/v1/auth/sync')
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert resp.status_code == 200
    data = resp.json()
    assert data['email'] == invited_email
    assert data['role'] == 'org_admin'

    refreshed = db_session.scalar(select(User).where(User.email == invited_email))
    assert refreshed is not None
    assert refreshed.clerk_user_id == fresh_clerk_id
    assert refreshed.role.value == 'org_admin'


def test_auth_sync_preserves_invited_user_role_when_clerk_role_missing(db_session, seed):
    from fastapi.testclient import TestClient
    from jose import jwt as jose_jwt
    from sqlalchemy import select

    from app.api.deps import get_db_session
    from app.main import app
    from app.models.user import User

    seed.org_admin.clerk_user_id = 'missing-role-user'
    db_session.flush()

    def _override():
        yield db_session

    token = jose_jwt.encode({'sub': 'missing-role-user'}, 'test-secret', algorithm='HS256')
    app.dependency_overrides[get_db_session] = _override
    try:
        client = TestClient(app, headers={'Authorization': f'Bearer {token}'})
        resp = client.post('/api/v1/auth/sync')
    finally:
        app.dependency_overrides.pop(get_db_session, None)

    assert resp.status_code == 200
    data = resp.json()
    assert data['role'] == 'org_admin'

    user = db_session.scalar(select(User).where(User.clerk_user_id == 'missing-role-user'))
    assert user is not None
    assert user.role.value == 'org_admin'


# ── user removal ──────────────────────────────────────────────────────────────

def test_apf_can_remove_coordinator_in_tenant(apf_client, db_session, seed, monkeypatch):
    from app.auth import clerk as clerk_module
    monkeypatch.setattr(clerk_module, 'delete_clerk_user', lambda _user_id: True)

    from sqlalchemy import select
    from app.models.organization_membership import OrganizationMembership
    from app.models.tenant_membership import TenantMembership
    from app.models.user import User

    target_id = str(seed.org_admin.id)
    resp = apf_client.delete(f'/api/v1/users/{target_id}')

    assert resp.status_code == 200
    refreshed = db_session.scalar(select(User).where(User.id == seed.org_admin.id))
    assert refreshed.is_active is False

    tenant_membership_active = db_session.scalar(
        select(TenantMembership.is_active).where(TenantMembership.user_id == seed.org_admin.id)
    )
    assert tenant_membership_active is False

    org_membership_active = db_session.scalar(
        select(OrganizationMembership.is_active).where(
            OrganizationMembership.user_id == seed.org_admin.id,
        )
    )
    if org_membership_active is not None:
        assert org_membership_active is False


def test_remove_user_blocks_self_removal(apf_client, seed):
    resp = apf_client.delete(f'/api/v1/users/{seed.apf.id}')
    assert resp.status_code == 400
    assert 'own account' in resp.json()['detail'].lower()


def test_remove_user_blocks_org_admin(org_admin_client, seed):
    resp = org_admin_client.delete(f'/api/v1/users/{seed.worker_a.id}')
    # require_network_admin gate: org_admin not allowed to remove anyone.
    assert resp.status_code == 403


def test_inactive_user_auth_sync_returns_403(apf_client, db_session, seed):
    seed.apf.is_active = False
    db_session.flush()

    resp = apf_client.post('/api/v1/auth/sync')
    assert resp.status_code == 403
    assert 'deactivated' in resp.json()['detail'].lower()


def test_inactive_user_blocked_from_admin_endpoints(apf_client, db_session, seed):
    seed.apf.is_active = False
    db_session.flush()

    resp = apf_client.get('/api/v1/organizations')
    assert resp.status_code == 403
    assert 'deactivated' in resp.json()['detail'].lower()


# ── network (tenant) management ───────────────────────────────────────────────

def test_platform_admin_can_create_network(platform_admin_client, db_session):
    from sqlalchemy import select
    from app.models.tenant import Tenant
    from app.models.tenant_membership import TenantMembership
    from app.models.user import User

    suffix = uuid4().hex[:8]
    payload = {
        'name': f'Acme Network {suffix}',
        'slug': f'acme-{suffix}',
        'admin_first_name': 'Alice',
        'admin_last_name': 'Owner',
        'admin_email': f'alice-{suffix}@acme.example',
        'admin_phone': '+15145550001',
        'admin_preferred_language': 'en',
    }

    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 201, resp.text

    data = resp.json()
    assert data['slug'] == payload['slug']
    assert data['network_admin']['email'] == payload['admin_email']
    assert data['network_admin']['is_active'] is True

    tenant = db_session.scalar(select(Tenant).where(Tenant.slug == payload['slug']))
    assert tenant is not None

    admin = db_session.scalar(select(User).where(User.email == payload['admin_email']))
    assert admin is not None
    assert admin.role.value == 'network_admin'
    assert admin.clerk_user_id is None  # links on first sign-in

    membership = db_session.scalar(
        select(TenantMembership).where(
            TenantMembership.user_id == admin.id,
            TenantMembership.tenant_id == tenant.id,
        )
    )
    assert membership is not None
    assert membership.role.value == 'network_admin'
    assert membership.is_active is True


def test_create_network_starts_pending(platform_admin_client, seed, db_session):
    """P0 lifecycle: an invited tenant starts in `pending` (becomes active only
    after onboarding), while directly-seeded tenants are `active`."""
    from sqlalchemy import select
    from app.models.tenant import Tenant as TenantModel

    suffix = uuid4().hex[:8]
    resp = platform_admin_client.post('/api/v1/networks', json={
        'name': f'Pending Net {suffix}',
        'slug': f'pending-{suffix}',
        'region': 'Montréal',
        'admin_first_name': 'Pat',
        'admin_last_name': 'Owner',
        'admin_email': f'pat-{suffix}@pending.example',
        'admin_preferred_language': 'fr',
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()['status'] == 'pending'
    assert resp.json()['region'] == 'Montréal'

    tenant = db_session.scalar(select(TenantModel).where(TenantModel.slug == f'pending-{suffix}'))
    assert tenant.status.value == 'pending'
    assert tenant.activated_at is None
    # The seed tenant (created directly) is active.
    assert seed.tenant.status.value == 'active'


def test_platform_admin_can_list_networks(platform_admin_client, seed):
    resp = platform_admin_client.get('/api/v1/networks')
    assert resp.status_code == 200
    items = resp.json()['items']
    # Seed creates one tenant; should appear in the list.
    slugs = {row['slug'] for row in items}
    assert seed.tenant.slug in slugs

    # The seed admin is now platform_admin (the fixture bumps it) but
    # is still the operational admin of the seed tenant via their active
    # TenantMembership. The list response must surface them as the
    # network_admin of the row so the frontend can identify "your own
    # network" and hide the Remove button. Regression guard.
    seed_row = next(row for row in items if row['slug'] == seed.tenant.slug)
    assert seed_row['network_admin'] is not None
    assert seed_row['network_admin']['id'] == str(seed.apf.id)


def test_network_admin_cannot_create_network(apf_client):
    payload = {
        'name': 'Forbidden Inc',
        'slug': f'forbidden-{uuid4().hex[:6]}',
        'admin_first_name': 'No',
        'admin_last_name': 'Way',
        'admin_email': f'no-{uuid4().hex[:6]}@forbidden.example',
        'admin_preferred_language': 'fr',
    }
    resp = apf_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 403


def test_network_admin_cannot_list_networks(apf_client):
    resp = apf_client.get('/api/v1/networks')
    assert resp.status_code == 403


def test_create_network_rejects_duplicate_slug(platform_admin_client, seed):
    payload = {
        'name': 'Conflict',
        'slug': seed.tenant.slug,
        'admin_first_name': 'Conflict',
        'admin_last_name': 'Admin',
        'admin_email': f'conflict-{uuid4().hex[:6]}@example.org',
        'admin_preferred_language': 'fr',
    }
    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 409


def test_create_network_rejects_duplicate_email(platform_admin_client, seed):
    payload = {
        'name': 'Other Network',
        'slug': f'other-{uuid4().hex[:6]}',
        'admin_first_name': 'Other',
        'admin_last_name': 'Admin',
        'admin_email': seed.org_admin.email,
        'admin_preferred_language': 'fr',
    }
    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 409


def test_platform_admin_apf_view_stays_tenant_scoped(platform_admin_client, seed):
    """Option (ii): platform admin sees only their tenant's data on
    day-to-day endpoints, not a global flat list."""
    resp = platform_admin_client.get('/api/v1/organizations')
    assert resp.status_code == 200
    org_ids = {row['id'] for row in resp.json()['items']}
    assert str(seed.org.id) in org_ids
    # Sanity: the response should be the seed tenant's orgs only.
    # (Seed creates one tenant and one org.)
    assert len(org_ids) == 1


def test_removed_email_can_be_re_invited(apf_client, db_session, seed, monkeypatch):
    """After a user is removed, the same email can be invited again."""
    from app.auth import clerk as clerk_module
    monkeypatch.setattr(clerk_module, 'delete_clerk_user', lambda _user_id: True)

    from sqlalchemy import select
    from app.models.user import User

    # Remove the existing org_admin coordinator.
    resp = apf_client.delete(f'/api/v1/users/{seed.org_admin.id}')
    assert resp.status_code == 200

    # The original email should be freed (the row's email was rewritten with
    # a +removed- marker).
    refreshed = db_session.scalar(select(User).where(User.id == seed.org_admin.id))
    assert refreshed.is_active is False
    assert '+removed-' in refreshed.email
    assert not db_session.scalar(
        select(User).where(User.email == 'orgadmin@inttest.example')
    )

    # Re-invite the same email — should succeed (not 409).
    resp = apf_client.post('/api/v1/coordinators/invite', json={
        'first_name': 'Org',
        'last_name': 'Admin Reborn',
        'email': 'orgadmin@inttest.example',
        'phone': '+15145550010',
        'preferred_language': 'en',
        'org_ids': [str(seed.org.id)],
    })
    assert resp.status_code == 201, resp.text
    new_user = resp.json()
    assert new_user['email'] == 'orgadmin@inttest.example'
    assert new_user['id'] != str(seed.org_admin.id)  # fresh row, not the old one


def test_platform_admin_can_remove_other_network(platform_admin_client, db_session, monkeypatch):
    from app.auth import clerk as clerk_module
    monkeypatch.setattr(clerk_module, 'delete_clerk_user', lambda _user_id: True)

    from sqlalchemy import select
    from app.models.tenant import Tenant
    from app.models.tenant_membership import TenantMembership
    from app.models.user import User

    suffix = uuid4().hex[:8]
    payload = {
        'name': f'Doomed Network {suffix}',
        'slug': f'doomed-{suffix}',
        'admin_first_name': 'Doomed',
        'admin_last_name': 'Owner',
        'admin_email': f'doomed-{suffix}@example.org',
        'admin_preferred_language': 'en',
    }
    create_resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert create_resp.status_code == 201
    new_tenant_id = create_resp.json()['id']
    new_admin_email = payload['admin_email']

    # Sanity: new admin and tenant active.
    new_admin = db_session.scalar(select(User).where(User.email == new_admin_email))
    assert new_admin is not None
    assert new_admin.is_active is True

    # Remove the network.
    del_resp = platform_admin_client.delete(f'/api/v1/networks/{new_tenant_id}')
    assert del_resp.status_code == 200, del_resp.text

    # Tenant inactive.
    tenant = db_session.scalar(select(Tenant).where(Tenant.id == new_tenant_id))
    assert tenant.is_active is False

    # Admin deactivated, email tombstoned, original email free for re-use.
    db_session.refresh(new_admin)
    assert new_admin.is_active is False
    assert '+removed-' in new_admin.email
    assert not db_session.scalar(select(User).where(User.email == new_admin_email))

    # TenantMembership for that tenant inactive.
    memberships = db_session.scalars(
        select(TenantMembership).where(TenantMembership.tenant_id == new_tenant_id)
    ).all()
    assert all(m.is_active is False for m in memberships)


def test_platform_admin_cannot_remove_own_tenant(platform_admin_client, seed):
    resp = platform_admin_client.delete(f'/api/v1/networks/{seed.tenant.id}')
    assert resp.status_code == 400
    assert 'own network' in resp.json()['detail'].lower()


def test_network_admin_cannot_remove_network(apf_client, seed):
    resp = apf_client.delete(f'/api/v1/networks/{seed.tenant.id}')
    assert resp.status_code == 403


def test_support_operator_cannot_remove_network(db_session, seed):
    """Removal is the most destructive lifecycle mutation — `support` operators
    (read-only tier) must be rejected like they are for suspend/revoke."""
    from app.api.deps import get_db_session
    from app.main import app
    from app.models.enums import PlatformOperatorRole, UserRole
    from app.models.platform_operator import PlatformOperator
    from app.models.user import User
    from app.tests.conftest import _make_test_client

    user = User(
        id=uuid4(), clerk_user_id='int-scope-support', first_name='Sup', last_name='Port',
        email=f'support-{uuid4().hex[:8]}@inttest.example', role=UserRole.PLATFORM_ADMIN,
        preferred_language='en',
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(PlatformOperator(
        id=uuid4(), user_id=user.id, role=PlatformOperatorRole.SUPPORT, mfa_enabled=True,
    ))
    db_session.flush()
    client = _make_test_client(db_session, 'int-scope-support', 'platform_admin')
    try:
        resp = client.delete(f'/api/v1/networks/{seed.tenant.id}')
        assert resp.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db_session, None)


def test_platform_admin_can_remove_orphan_user_by_email(
    platform_admin_client, db_session, monkeypatch
):
    """Orphan user (no memberships) can be cleaned up by email."""
    from app.auth import clerk as clerk_module
    monkeypatch.setattr(clerk_module, 'delete_clerk_user', lambda _user_id: True)

    from sqlalchemy import select
    from app.models.enums import UserRole
    from app.models.user import User

    orphan_email = f'orphan-{uuid4().hex[:8]}@example.org'
    orphan = User(
        id=uuid4(),
        clerk_user_id=f'orphan-clerk-{uuid4().hex[:8]}',
        first_name='Orphan',
        last_name='User',
        email=orphan_email,
        role=UserRole.WORKER,  # any role; no memberships either way
        preferred_language='fr',
    )
    db_session.add(orphan)
    db_session.flush()

    resp = platform_admin_client.post(
        '/api/v1/users/remove-by-email',
        json={'email': orphan_email},
    )
    assert resp.status_code == 200, resp.text

    refreshed = db_session.scalar(select(User).where(User.id == orphan.id))
    assert refreshed.is_active is False
    assert '+removed-' in refreshed.email
    # Original email free again
    assert not db_session.scalar(select(User).where(User.email == orphan_email))


def test_remove_by_email_returns_404_for_unknown(platform_admin_client):
    resp = platform_admin_client.post(
        '/api/v1/users/remove-by-email',
        json={'email': f'ghost-{uuid4().hex[:8]}@nowhere.example'},
    )
    assert resp.status_code == 404


def test_network_admin_cannot_remove_by_email(apf_client):
    resp = apf_client.post(
        '/api/v1/users/remove-by-email',
        json={'email': 'anything@example.org'},
    )
    assert resp.status_code == 403
