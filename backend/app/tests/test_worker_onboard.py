"""Worker onboarding regression tests.

E2E bug #1 (2026-05-31): onboarding with preferred_language="bilingual" raised
StringDataRightTruncation (users.preferred_language was String(5)) -> unhandled
500. Migration 20260531_0009 widens the column to String(20). These tests pin
the behaviour so it can't regress.
"""
from uuid import uuid4

from app.models.enums import UserRole
from app.models.tenant_membership import TenantMembership
from app.models.user import User


def _fresh_worker(db_session, seed) -> User:
    """A profile-less worker so onboard() runs (seeded workers already have one)."""
    user = User(
        id=uuid4(), clerk_user_id=f'int-fresh-{uuid4().hex[:8]}',
        first_name='Fresh', last_name='Worker',
        email=f'fresh.{uuid4().hex[:8]}@inttest.example',
        role=UserRole.WORKER, preferred_language='fr',
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(TenantMembership(
        id=uuid4(), user_id=user.id, tenant_id=seed.tenant.id, role=UserRole.WORKER,
    ))
    db_session.flush()
    return user


def test_onboard_with_bilingual_language_persists(apf_client, seed, db_session):
    worker = _fresh_worker(db_session, seed)
    resp = apf_client.post(
        f'/api/v1/workers/{worker.id}/onboard',
        json={
            'supported_cities': ['IntTestCity'],
            'qualifications': ['ECE_LEVEL_1'],
            'certifications': [],
            'preferred_language': 'bilingual',
        },
    )

    assert resp.status_code == 201, resp.text
    refreshed = db_session.get(User, worker.id)
    assert refreshed.preferred_language == 'bilingual'


def test_onboard_rejects_unknown_language_value(apf_client, seed, db_session):
    """Values outside the allow-list are ignored, not persisted."""
    worker = _fresh_worker(db_session, seed)
    resp = apf_client.post(
        f'/api/v1/workers/{worker.id}/onboard',
        json={
            'supported_cities': ['IntTestCity'],
            'qualifications': ['ECE_LEVEL_1'],
            'certifications': [],
            'preferred_language': 'klingon',
        },
    )

    assert resp.status_code == 201, resp.text
    refreshed = db_session.get(User, worker.id)
    # Fresh worker seeds as 'fr'; an unknown value leaves it untouched.
    assert refreshed.preferred_language == 'fr'
