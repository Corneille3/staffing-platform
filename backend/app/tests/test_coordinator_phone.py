"""PATCH /coordinators/{id} — the network admin edits a coordinator's phone
(parked #7). Self-service (PATCH /auth/profile) already exists; this is the
APF side, for the admin who notices a no-show SMS went nowhere.
"""
from uuid import uuid4

from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User


def _patch(client, coordinator_id, phone):
    return client.patch(f'/api/v1/coordinators/{coordinator_id}', json={'phone': phone})


def _audit_rows(db_session, user_id):
    return list(db_session.scalars(
        select(AuditLog).where(AuditLog.action == 'user.profile_updated', AuditLog.entity_id == user_id)
    ).all())


def test_apf_sets_phone_normalized_and_audited(apf_client, seed, db_session):
    resp = _patch(apf_client, seed.org_admin.id, '(514) 555-0101')
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body['id'] == str(seed.org_admin.id)
    assert body['phone'] == '+15145550101'
    # Same shape as the listing row, so the cell can re-adopt it as is.
    assert [o['id'] for o in body['organizations']] == [str(seed.org.id)]

    db_session.refresh(seed.org_admin)
    assert seed.org_admin.phone == '+15145550101'

    rows = _audit_rows(db_session, seed.org_admin.id)
    assert len(rows) == 1
    assert rows[0].actor_user_id == seed.apf.id  # the APF admin, not the coordinator
    assert rows[0].payload['fields']['phone'] == {'from': None, 'to': '+15145550101'}


def test_same_number_is_a_noop_and_empty_clears(apf_client, seed, db_session):
    assert _patch(apf_client, seed.org_admin.id, '+15145550102').status_code == 200
    assert _patch(apf_client, seed.org_admin.id, '514-555-0102').status_code == 200
    assert len(_audit_rows(db_session, seed.org_admin.id)) == 1  # same E.164 → nothing written

    resp = _patch(apf_client, seed.org_admin.id, '')
    assert resp.status_code == 200, resp.text
    assert resp.json()['phone'] is None
    db_session.refresh(seed.org_admin)
    assert seed.org_admin.phone is None
    assert _audit_rows(db_session, seed.org_admin.id)[-1].payload['fields']['phone'] == {
        'from': '+15145550102', 'to': None,
    }


def test_phone_field_is_required(apf_client, seed):
    resp = apf_client.patch(f'/api/v1/coordinators/{seed.org_admin.id}', json={})
    assert resp.status_code == 422


def test_coordinator_of_another_network_is_404(apf_client, seed, db_session):
    other_tenant = Tenant(id=uuid4(), name='Other Network', slug=f'other-{uuid4().hex[:8]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Other Org',
        type=OrganizationType.CHILDCARE, city='Elsewhere', preferred_language='fr', is_active=True,
    )
    other_coord = User(
        id=uuid4(), first_name='Other', last_name='Coord',
        email=f'other-{uuid4().hex[:8]}@example.org', role=UserRole.ORG_ADMIN, preferred_language='fr',
        phone='+15145550199',
    )
    db_session.add_all([other_tenant, other_org, other_coord])
    db_session.flush()
    db_session.add(TenantMembership(id=uuid4(), user_id=other_coord.id, tenant_id=other_tenant.id, role=UserRole.ORG_ADMIN))
    db_session.add(OrganizationMembership(
        id=uuid4(), user_id=other_coord.id, organization_id=other_org.id, role=UserRole.ORG_ADMIN, is_active=True,
    ))
    db_session.flush()

    resp = _patch(apf_client, other_coord.id, '+15145550100')
    assert resp.status_code == 404, resp.text
    db_session.refresh(other_coord)
    assert other_coord.phone == '+15145550199'
    assert _audit_rows(db_session, other_coord.id) == []


def test_worker_and_unknown_ids_are_404(apf_client, seed):
    assert _patch(apf_client, seed.worker_a.id, '+15145550100').status_code == 404
    assert _patch(apf_client, uuid4(), '+15145550100').status_code == 404


def test_removed_coordinator_is_404(apf_client, seed, monkeypatch):
    from app.notifications import email_service

    monkeypatch.setattr(
        email_service.EmailNotificationService, 'send',
        lambda self, message: {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email},
    )
    invited = apf_client.post('/api/v1/coordinators/invite', json={
        'first_name': 'Casey', 'last_name': 'Manager',
        'email': f'casey-{uuid4().hex[:8]}@example.org', 'preferred_language': 'en',
        'org_ids': [str(seed.org.id)],
    })
    assert invited.status_code == 201, invited.text
    casey_id = invited.json()['id']
    assert _patch(apf_client, casey_id, '+15145550103').status_code == 200

    assert apf_client.delete(f'/api/v1/users/{casey_id}').status_code == 200
    assert _patch(apf_client, casey_id, '+15145550104').status_code == 404


def test_org_admin_cannot_edit_coordinators(org_admin_client, seed):
    resp = _patch(org_admin_client, seed.org_admin.id, '+15145550100')
    assert resp.status_code == 403, resp.text
