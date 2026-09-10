"""GET/PATCH /auth/profile — self-service phone + SMS preference (finding #3).

Coordinators only got a phone at invite time; the no-show SMS reads
``User.phone`` + ``sms_opt_out`` and silently skipped anyone without one.
"""
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.main import app
from app.models.audit_log import AuditLog


def test_profile_returns_own_row(org_admin_client, seed):
    resp = org_admin_client.get('/api/v1/auth/profile')
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['id'] == str(seed.org_admin.id)
    assert body['email'] == seed.org_admin.email
    assert body['phone'] is None
    assert body['sms_opt_out'] is False
    assert body['platform_operator_role'] is None


def test_patch_phone_is_normalized_and_audited(org_admin_client, seed, db_session):
    resp = org_admin_client.patch('/api/v1/auth/profile', json={'phone': '(514) 555-0001'})
    assert resp.status_code == 200, resp.text
    assert resp.json()['phone'] == '+15145550001'

    db_session.refresh(seed.org_admin)
    assert seed.org_admin.phone == '+15145550001'

    row = db_session.scalar(
        select(AuditLog).where(AuditLog.action == 'user.profile_updated', AuditLog.entity_id == seed.org_admin.id)
    )
    assert row is not None
    assert row.actor_user_id == seed.org_admin.id
    assert row.payload['fields']['phone'] == {'from': None, 'to': '+15145550001'}


def test_patch_sms_flag_leaves_phone_alone(org_admin_client, seed, db_session):
    org_admin_client.patch('/api/v1/auth/profile', json={'phone': '+15145550002'})

    resp = org_admin_client.patch('/api/v1/auth/profile', json={'sms_opt_out': True})
    assert resp.status_code == 200, resp.text
    assert resp.json()['sms_opt_out'] is True
    assert resp.json()['phone'] == '+15145550002'

    # Flipping back is just as cheap, and a no-op payload writes no audit row.
    assert org_admin_client.patch('/api/v1/auth/profile', json={'sms_opt_out': False}).json()['sms_opt_out'] is False
    before = db_session.scalars(select(AuditLog).where(AuditLog.action == 'user.profile_updated')).all()
    org_admin_client.patch('/api/v1/auth/profile', json={})
    after = db_session.scalars(select(AuditLog).where(AuditLog.action == 'user.profile_updated')).all()
    assert len(after) == len(before)


def test_patch_empty_phone_clears_it(org_admin_client, seed, db_session):
    org_admin_client.patch('/api/v1/auth/profile', json={'phone': '514-555-0003'})
    resp = org_admin_client.patch('/api/v1/auth/profile', json={'phone': ''})
    assert resp.status_code == 200, resp.text
    assert resp.json()['phone'] is None
    db_session.refresh(seed.org_admin)
    assert seed.org_admin.phone is None


def test_worker_may_edit_own_profile_only_fields_exposed(worker_a_client, seed):
    resp = worker_a_client.patch(
        '/api/v1/auth/profile',
        json={'phone': '+15145550004', 'sms_opt_out': True, 'role': 'network_admin', 'email': 'x@y.z'},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['phone'] == '+15145550004' and body['sms_opt_out'] is True
    # Extra keys are ignored — role and email are not self-service.
    assert body['role'] == 'worker'
    assert body['email'] == seed.worker_a.email


def test_profile_requires_authentication(monkeypatch):
    monkeypatch.setattr(settings, 'dev_auth_bypass', False)
    anon = TestClient(app)
    assert anon.get('/api/v1/auth/profile').status_code == 401
    assert anon.patch('/api/v1/auth/profile', json={'phone': '+15145550005'}).status_code == 401
