"""APF org drill-in: snapshot endpoint + activity ?org_id= filter + scope guards."""
from uuid import uuid4

from app.models.enums import OrganizationType, UserRole
from app.models.organization import Organization
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import request_payload


def test_org_snapshot_shape(apf_client, seed):
    apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    resp = apf_client.get(f'/api/v1/apf/organizations/{seed.org.id}/snapshot')
    assert resp.status_code == 200
    data = resp.json()

    assert data['id'] == str(seed.org.id)
    assert data['name'] == seed.org.name
    assert data['type'] == 'childcare'
    assert set(data.keys()) >= {
        'kpis',
        'status_breakdown',
        'recent_closed_requests',
        'upcoming_open_requests',
    }
    assert data['kpis']['total_requests'] >= 1
    assert data['kpis']['active_substitutes_in_city'] >= 2  # both seed workers cover this city


def test_org_snapshot_404_for_unknown_org(apf_client):
    resp = apf_client.get(f'/api/v1/apf/organizations/{uuid4()}/snapshot')
    assert resp.status_code == 404


def test_org_snapshot_403_for_org_outside_tenant(apf_client, db_session):
    other_tenant = Tenant(id=uuid4(), name='Other', slug=f'other-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    resp = apf_client.get(f'/api/v1/apf/organizations/{other_org.id}/snapshot')
    assert resp.status_code == 403


def test_activity_org_id_filter_narrows_scope(apf_client, seed, db_session):
    # Create activity in the seed org.
    rid = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{rid}/publish')

    # Create a second org in the same tenant + activity there.
    other_org = Organization(
        id=uuid4(), tenant_id=seed.tenant.id, name='Sibling Org',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add(other_org)
    db_session.flush()
    apf_client.post(
        '/api/v1/requests',
        json=request_payload(other_org.id, seed.apf.id, city='OtherCity'),
    )

    # Without filter — both orgs visible.
    all_resp = apf_client.get('/api/v1/apf/activity').json()
    orgs_seen = {row['organization']['id'] for row in all_resp['items'] if row['organization']}
    assert str(seed.org.id) in orgs_seen
    assert str(other_org.id) in orgs_seen

    # With ?org_id= for the seed org — only seed org rows.
    scoped = apf_client.get(f'/api/v1/apf/activity?org_id={seed.org.id}').json()
    assert all(
        row['organization'] is None or row['organization']['id'] == str(seed.org.id)
        for row in scoped['items']
    )
    # Counts also reflect the scope: should not include the other-org create event.
    assert scoped['counts']['all'] < all_resp['counts']['all']


def test_activity_org_id_403_for_org_outside_tenant(apf_client, db_session):
    other_tenant = Tenant(id=uuid4(), name='Other2', slug=f'other2-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside2',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    resp = apf_client.get(f'/api/v1/apf/activity?org_id={other_org.id}')
    assert resp.status_code == 403


def test_org_snapshot_forbidden_for_worker(worker_a_client, seed):
    resp = worker_a_client.get(f'/api/v1/apf/organizations/{seed.org.id}/snapshot')
    assert resp.status_code == 403


# Touch imports so static analysis keeps them.
_ = (User, UserRole, TenantMembership)
