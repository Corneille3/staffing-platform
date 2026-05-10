"""Shared fixtures for integration tests.

Each test function gets:
  - a fresh DB session wrapped in a transaction that rolls back after the test
    (service-layer commits use SAVEPOINTs, so they're visible within the test
    but never reach the real DB)
  - a pre-seeded set of entities: tenant, org, network_admin, org_admin, worker_a, worker_b
  - per-role TestClient helpers that inject the test session via dependency override

Token strategy: CLERK_JWKS_URL is unset in test env, so decode_token() uses
jwt.get_unverified_claims() — any valid JWT structure is accepted.  We set the
`sub` claim to match the clerk_user_id of our seeded users so get_access_scope()
can resolve the identity.
"""
import os
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from jose import jwt as jose_jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from alembic import command as alembic_command
from alembic.config import Config

from app.api.deps import get_db_session
from app.main import app
from app.models.enums import AvailabilityStatus, OrganizationType, UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.models.worker_profile import WorkerProfile
from app.models.worker_qualification import WorkerQualification
from app.models.worker_region import WorkerRegion

# ── token helper ──────────────────────────────────────────────────────────────

def make_token(sub: str, role: str) -> str:
    return jose_jwt.encode(
        {'sub': sub, 'public_metadata': {'role': role}},
        'test-secret',
        algorithm='HS256',
    )


# ── engine (session-scoped — migrations run once per pytest session) ──────────

TEST_DATABASE_URL = os.environ.get(
    'DATABASE_URL',
    'postgresql+psycopg://postgres:postgres@localhost:5432/apf_staffing_test',
)


@pytest.fixture(scope='session')
def db_engine():
    # Ensure settings picks up the test DB URL so env.py routes alembic correctly.
    os.environ.setdefault('DATABASE_URL', TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL)
    # Re-read settings so the alembic env.py uses the test URL.
    from app.core.config import settings as _settings
    _settings.database_url = TEST_DATABASE_URL
    alembic_command.upgrade(Config('alembic.ini'), 'head')
    yield engine
    engine.dispose()


# ── session (function-scoped — savepoint isolation, auto-rollback) ────────────

@pytest.fixture
def db_session(db_engine):
    """Wraps each test in a transaction that is rolled back on teardown.

    Service code calls session.commit() which, under create_savepoint mode,
    releases the current SAVEPOINT and starts a new one — the outer connection
    transaction is never committed.  At teardown, transaction.rollback() undoes
    all test data cleanly.
    """
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode='create_savepoint')
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


# ── seed data ─────────────────────────────────────────────────────────────────

@pytest.fixture
def seed(db_session) -> SimpleNamespace:
    """Minimal set of entities for integration tests."""
    tenant = Tenant(id=uuid4(), name='Test Network', slug=f'test-network-{uuid4().hex[:8]}')

    org = Organization(
        id=uuid4(), tenant_id=tenant.id, name='Integration Test Org',
        type=OrganizationType.CHILDCARE, city='IntTestCity',
        preferred_language='fr', is_active=True,
    )
    apf = User(
        id=uuid4(), clerk_user_id='int-apf', first_name='APF', last_name='Admin',
        email='apf@inttest.example', role=UserRole.NETWORK_ADMIN, preferred_language='en',
    )
    org_admin = User(
        id=uuid4(), clerk_user_id='int-org-admin', first_name='Org', last_name='Admin',
        email='orgadmin@inttest.example', role=UserRole.ORG_ADMIN, preferred_language='en',
    )
    worker_a = User(
        id=uuid4(), clerk_user_id='int-worker-a', first_name='Worker', last_name='Alpha',
        email='worker.a@inttest.example', role=UserRole.WORKER, preferred_language='fr',
    )
    worker_b = User(
        id=uuid4(), clerk_user_id='int-worker-b', first_name='Worker', last_name='Beta',
        email='worker.b@inttest.example', role=UserRole.WORKER, preferred_language='fr',
    )

    db_session.add_all([tenant, org, apf, org_admin, worker_a, worker_b])
    db_session.flush()

    db_session.add(TenantMembership(
        id=uuid4(), user_id=apf.id, tenant_id=tenant.id, role=UserRole.NETWORK_ADMIN,
    ))
    # Mirror production: CoordinatorService.invite() creates a TenantMembership
    # alongside the per-org OrganizationMembership(s).
    db_session.add(TenantMembership(
        id=uuid4(), user_id=org_admin.id, tenant_id=tenant.id, role=UserRole.ORG_ADMIN,
    ))
    db_session.add(OrganizationMembership(
        id=uuid4(), user_id=org_admin.id, organization_id=org.id,
        role=UserRole.ORG_ADMIN, is_active=True,
    ))

    for worker in (worker_a, worker_b):
        db_session.add(TenantMembership(
            id=uuid4(), user_id=worker.id, tenant_id=tenant.id, role=UserRole.WORKER,
        ))
        profile = WorkerProfile(
            id=uuid4(), user_id=worker.id,
            availability_status=AvailabilityStatus.AVAILABLE,
            urgent_alert_opt_in=True,
        )
        db_session.add(profile)
        db_session.flush()
        db_session.add(WorkerRegion(id=uuid4(), worker_profile_id=profile.id, city='IntTestCity'))
        db_session.add(WorkerQualification(
            id=uuid4(), worker_profile_id=profile.id, qualification_code='ECE_LEVEL_1',
        ))

    db_session.flush()

    return SimpleNamespace(
        tenant=tenant, org=org, apf=apf, org_admin=org_admin,
        worker_a=worker_a, worker_b=worker_b,
    )


# ── per-role client fixtures ──────────────────────────────────────────────────

def _make_test_client(db_session: Session, sub: str, role: str) -> TestClient:
    token = make_token(sub, role)

    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    return TestClient(app, headers={'Authorization': f'Bearer {token}'})


@pytest.fixture
def apf_client(db_session, seed):
    yield _make_test_client(db_session, 'int-apf', 'network_admin')
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
def org_admin_client(db_session, seed):
    yield _make_test_client(db_session, 'int-org-admin', 'org_admin')
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
def worker_a_client(db_session, seed):
    yield _make_test_client(db_session, 'int-worker-a', 'worker')
    app.dependency_overrides.pop(get_db_session, None)


@pytest.fixture
def worker_b_client(db_session, seed):
    yield _make_test_client(db_session, 'int-worker-b', 'worker')
    app.dependency_overrides.pop(get_db_session, None)


# ── request payload helper ────────────────────────────────────────────────────

def request_payload(org_id, creator_id, **overrides) -> dict:
    base = {
        'organization_id': str(org_id),
        'created_by_user_id': str(creator_id),
        'request_type': 'urgent_replacement',
        'title': 'Integration test shift',
        'city': 'IntTestCity',
        'work_date': '2026-06-15',
        'start_time': '08:00',
        'end_time': '16:00',
        'urgency_level': 2,
        'required_qualifications': ['ECE_LEVEL_1'],
        'required_certifications': [],
    }
    base.update(overrides)
    return base
