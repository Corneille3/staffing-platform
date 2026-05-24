"""Coordinator activity timeline: buckets, KPIs, filters, scope guards."""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.models.tenant import Tenant
from app.tests.conftest import request_payload


def _create_published_request(client, seed):
    rid = client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.org_admin.id)).json()['id']
    client.post(f'/api/v1/requests/{rid}/publish')
    return rid


def test_admin_activity_shape_and_events(org_admin_client, seed):
    rid = _create_published_request(org_admin_client, seed)
    org_admin_client.post(f'/api/v1/requests/{rid}/cancel', json={'reason': 'test'})

    resp = org_admin_client.get('/api/v1/admin/activity')
    assert resp.status_code == 200
    data = resp.json()

    # Shape the UI relies on.
    assert set(data['counts']) == {
        'all', 'posted', 'accepted', 'declined', 'assigned',
        'completed', 'cancelled', 'expired', 'invited',
    }
    assert set(data['kpis']) == {
        'posted', 'filled', 'cancelled', 'expired', 'fill_rate', 'avg_time_to_fill_minutes', 'sites',
    }
    assert data['counts']['posted'] >= 1
    assert data['counts']['cancelled'] >= 1
    actions = {r['action'] for r in data['items']}
    assert 'staffing_request.published' in actions
    assert 'staffing_request.cancelled' in actions
    # KPI "posted" counts non-draft requests (the published one).
    assert data['kpis']['posted'] >= 1


def test_admin_activity_filter_posted(org_admin_client, seed):
    _create_published_request(org_admin_client, seed)
    resp = org_admin_client.get('/api/v1/admin/activity?filter=posted')
    assert resp.status_code == 200
    actions = {r['action'] for r in resp.json()['items']}
    assert actions <= {'staffing_request.published'}


def test_admin_activity_403_for_site_outside_scope(org_admin_client, db_session):
    other_tenant = Tenant(id=uuid4(), name='Other-Act', slug=f'other-act-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside-Act',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    resp = org_admin_client.get(f'/api/v1/admin/activity?site_id={other_org.id}')
    assert resp.status_code == 403
