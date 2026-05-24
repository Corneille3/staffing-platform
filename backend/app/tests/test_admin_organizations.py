"""Admin multi-site organizations screen: list + metrics + edit + scope guards."""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.models.tenant import Tenant


def test_org_admin_sees_their_sites_with_metrics(org_admin_client, seed):
    resp = org_admin_client.get('/api/v1/admin/organizations')
    assert resp.status_code == 200
    items = resp.json()['items']
    # org_admin is a member of exactly the seed org.
    assert len(items) == 1
    site = items[0]
    assert site['id'] == str(seed.org.id)
    # Structure the UI relies on.
    assert set(site['metrics']) == {'fill_rate_30d', 'requests_30d', 'filled_30d', 'open_requests'}
    assert set(site['roster_today']) == {'on_site', 'substitutes_arriving'}
    coord_ids = {c['id'] for c in site['coordinators']}
    assert str(seed.org_admin.id) in coord_ids


def test_network_admin_sees_all_tenant_orgs(apf_client, seed):
    resp = apf_client.get('/api/v1/admin/organizations')
    assert resp.status_code == 200
    ids = {s['id'] for s in resp.json()['items']}
    assert str(seed.org.id) in ids


def test_patch_updates_site_fields(org_admin_client, seed):
    resp = org_admin_client.patch(
        f'/api/v1/admin/organizations/{seed.org.id}',
        json={'capacity': 80, 'enrolled_count': 75, 'hours_label': 'Lun–Ven · 08:00 → 17:00'},
    )
    assert resp.status_code == 200
    site = resp.json()
    assert site['capacity'] == 80
    assert site['enrolled_count'] == 75
    assert site['hours_label'] == 'Lun–Ven · 08:00 → 17:00'


def test_patch_403_for_site_outside_scope(org_admin_client, db_session):
    other_tenant = Tenant(id=uuid4(), name='Other-Org', slug=f'other-org-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside CPE',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    resp = org_admin_client.patch(
        f'/api/v1/admin/organizations/{other_org.id}', json={'capacity': 10},
    )
    assert resp.status_code == 403
