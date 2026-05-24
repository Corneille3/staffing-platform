"""Admin substitutes directory: list + ranking-against + scope guards."""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.models.tenant import Tenant
from app.tests.conftest import request_payload


def test_list_admin_substitutes_unranked(apf_client, seed):
    resp = apf_client.get('/api/v1/admin/substitutes')
    assert resp.status_code == 200
    data = resp.json()
    assert data['rank_against'] is None
    assert len(data['items']) == 2
    ids = {r['worker']['id'] for r in data['items']}
    assert str(seed.worker_a.id) in ids
    assert str(seed.worker_b.id) in ids
    assert all(r['match_score'] is None for r in data['items'])


def test_list_admin_substitutes_ranked_against_request(apf_client, seed):
    rid = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']

    resp = apf_client.get(f'/api/v1/admin/substitutes?rank_against_request_id={rid}')
    assert resp.status_code == 200
    data = resp.json()

    assert data['rank_against'] is not None
    assert data['rank_against']['id'] == rid
    assert data['rank_against']['title'] == 'Integration test shift'
    assert data['rank_against']['city'] == 'IntTestCity'

    # Sorted by score desc.
    scores = [r['match_score'] for r in data['items']]
    assert scores == sorted(scores, reverse=True)
    assert all(0 <= (s or 0) <= 100 for s in scores)

    # Both seed workers should be eligible (city + qual match).
    eligible_count = sum(1 for r in data['items'] if r['eligible'])
    assert eligible_count == 2


def test_list_admin_substitutes_404_for_unknown_request(apf_client):
    resp = apf_client.get(f'/api/v1/admin/substitutes?rank_against_request_id={uuid4()}')
    assert resp.status_code == 404


def test_list_admin_substitutes_403_for_request_outside_scope(apf_client, db_session, seed):
    other_tenant = Tenant(id=uuid4(), name='Other-Sub', slug=f'other-sub-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside-Sub',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    # Build a staffing_request directly in the other tenant.
    from app.models.staffing_request import StaffingRequest
    from datetime import date, time
    other_request = StaffingRequest(
        id=uuid4(),
        organization_id=other_org.id,
        created_by_user_id=seed.apf.id,
        request_type='urgent_replacement',
        title='Outside shift',
        city='OtherCity',
        work_date=date(2026, 8, 1),
        start_time=time(8, 0),
        end_time=time(16, 0),
        urgency_level=2,
        status='draft',
    )
    db_session.add(other_request)
    db_session.flush()

    resp = apf_client.get(f'/api/v1/admin/substitutes?rank_against_request_id={other_request.id}')
    assert resp.status_code == 403


def test_list_admin_substitutes_forbidden_for_worker(worker_a_client):
    resp = worker_a_client.get('/api/v1/admin/substitutes')
    assert resp.status_code == 403
