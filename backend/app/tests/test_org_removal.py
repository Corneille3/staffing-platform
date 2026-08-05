"""Organization removal — soft-delete, one level below tenant removal.

Deactivates the org + its OrganizationMemberships (people stay active),
preserves request/assignment/audit history, refuses while dispatch is live,
and vanishes from every org listing.
"""
from datetime import date, time, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.models.enums import (
    OrganizationType,
    RequestRole,
    RequestStatus,
    RequestType,
    UserRole,
)
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.staffing_request import StaffingRequest


def _make_org(db_session, tenant_id, name='Removable Org') -> Organization:
    org = Organization(
        id=uuid4(), tenant_id=tenant_id, name=name,
        type=OrganizationType.CHILDCARE, city='IntTestCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add(org)
    db_session.flush()
    return org


def _make_request(db_session, org_id, creator_id, status) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=org_id, created_by_user_id=creator_id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, title='Quart', city='IntTestCity',
        work_date=date.today() + timedelta(days=7),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    db_session.add(req)
    db_session.flush()
    return req


def test_remove_org_deactivates_and_unlists(db_session, apf_client, seed):
    org = _make_org(db_session, seed.tenant.id)
    membership = OrganizationMembership(
        id=uuid4(), user_id=seed.org_admin.id, organization_id=org.id,
        role=UserRole.ORG_ADMIN, is_active=True,
    )
    db_session.add(membership)
    db_session.flush()

    resp = apf_client.delete(f'/api/v1/organizations/{org.id}')
    assert resp.status_code == 200, resp.text
    assert resp.json()['is_active'] is False

    db_session.refresh(membership)
    assert membership.is_active is False  # tie cut…
    db_session.refresh(seed.org_admin)
    assert seed.org_admin.is_active is True  # …but the person survives

    listed = apf_client.get('/api/v1/organizations').json()['items']
    assert str(org.id) not in [o['id'] for o in listed]


def test_remove_org_blocked_while_requests_live(db_session, apf_client, seed):
    org = _make_org(db_session, seed.tenant.id, name='Busy Org')
    _make_request(db_session, org.id, seed.apf.id, RequestStatus.OPEN)

    resp = apf_client.delete(f'/api/v1/organizations/{org.id}')
    assert resp.status_code == 409
    assert 'live request' in resp.json()['detail']

    db_session.refresh(org)
    assert org.is_active is True


def test_remove_org_allowed_with_only_closed_requests(db_session, apf_client, seed):
    org = _make_org(db_session, seed.tenant.id, name='History Org')
    done = _make_request(db_session, org.id, seed.apf.id, RequestStatus.COMPLETED)
    draft = _make_request(db_session, org.id, seed.apf.id, RequestStatus.DRAFT)

    resp = apf_client.delete(f'/api/v1/organizations/{org.id}')
    assert resp.status_code == 200, resp.text

    # History rows survive the removal untouched.
    db_session.refresh(done)
    db_session.refresh(draft)
    assert done.status == RequestStatus.COMPLETED
    assert draft.status == RequestStatus.DRAFT


def test_remove_org_twice_is_404(db_session, apf_client, seed):
    org = _make_org(db_session, seed.tenant.id, name='Twice Org')
    assert apf_client.delete(f'/api/v1/organizations/{org.id}').status_code == 200
    assert apf_client.delete(f'/api/v1/organizations/{org.id}').status_code == 404


def test_org_admin_cannot_remove_org(org_admin_client, seed):
    resp = org_admin_client.delete(f'/api/v1/organizations/{seed.org.id}')
    assert resp.status_code == 403


def test_worker_cannot_remove_org(worker_a_client, seed):
    resp = worker_a_client.delete(f'/api/v1/organizations/{seed.org.id}')
    assert resp.status_code == 403


def test_cannot_remove_org_of_another_tenant(db_session, apf_client, seed):
    from app.models.tenant import Tenant
    other = Tenant(id=uuid4(), name='Other Net', slug=f'other-{uuid4().hex[:8]}')
    db_session.add(other)
    db_session.flush()
    foreign_org = _make_org(db_session, other.id, name='Foreign Org')

    resp = apf_client.delete(f'/api/v1/organizations/{foreign_org.id}')
    assert resp.status_code == 403
    db_session.refresh(foreign_org)
    assert foreign_org.is_active is True


def test_removed_org_gone_from_apf_snapshot(db_session, apf_client, seed):
    from app.api.v1.apf import _invalidate_snapshot_cache

    org = _make_org(db_session, seed.tenant.id, name='Snapshot Org')
    _invalidate_snapshot_cache()
    before = apf_client.get('/api/v1/apf/snapshot').json()
    assert 'Snapshot Org' in [o['name'] for o in before['org_activity']]

    assert apf_client.delete(f'/api/v1/organizations/{org.id}').status_code == 200
    _invalidate_snapshot_cache()
    after = apf_client.get('/api/v1/apf/snapshot').json()
    assert 'Snapshot Org' not in [o['name'] for o in after['org_activity']]
