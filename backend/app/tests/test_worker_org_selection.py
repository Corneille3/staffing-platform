"""Worker org-selection (worker_organizations opt-in).

The opt-out model: a worker with NO active selection is open to every org in
the tenant; once they select orgs, the matching gate restricts eligibility —
and therefore broadcasts, reach counts and ranking — to those orgs only.
"""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.services.matching_service import MatchingService
from app.tests.conftest import request_payload


def _second_org(db_session, seed) -> Organization:
    org_b = Organization(
        id=uuid4(), tenant_id=seed.tenant.id, name='Second Site',
        type=OrganizationType.CHILDCARE, city='IntTestCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add(org_b)
    db_session.flush()
    return org_b


def _select_orgs(client, worker_id, org_ids):
    return client.put(
        f'/api/v1/workers/{worker_id}/organizations',
        json={'organization_ids': [str(o) for o in org_ids]},
    )


# ── endpoints ─────────────────────────────────────────────────────────────────

def test_list_defaults_to_unrestricted(worker_a_client, seed):
    resp = worker_a_client.get(f'/api/v1/workers/{seed.worker_a.id}/organizations')
    assert resp.status_code == 200
    data = resp.json()
    assert data['restricted'] is False
    assert [item['name'] for item in data['items']] == ['Integration Test Org']
    assert data['items'][0]['selected'] is False


def test_select_and_deselect_roundtrip(worker_a_client, db_session, seed):
    org_b = _second_org(db_session, seed)

    resp = _select_orgs(worker_a_client, seed.worker_a.id, [org_b.id])
    assert resp.status_code == 200
    data = resp.json()
    assert data['restricted'] is True
    selected = {i['name'] for i in data['items'] if i['selected']}
    assert selected == {'Second Site'}

    # Empty list = back to open-to-all
    resp = _select_orgs(worker_a_client, seed.worker_a.id, [])
    assert resp.status_code == 200
    assert resp.json()['restricted'] is False


def test_reselect_reuses_row_under_unique_constraint(worker_a_client, seed):
    for _ in range(2):
        assert _select_orgs(worker_a_client, seed.worker_a.id, [seed.org.id]).status_code == 200
        assert _select_orgs(worker_a_client, seed.worker_a.id, []).status_code == 200


def test_rejects_org_outside_tenant(worker_a_client, db_session, seed):
    from app.models.tenant import Tenant
    other_tenant = Tenant(id=uuid4(), name='Other', slug=f'other-{uuid4().hex[:8]}')
    db_session.add(other_tenant)
    db_session.flush()
    foreign_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Foreign Org',
        type=OrganizationType.CHILDCARE, city='Elsewhere',
        preferred_language='fr', is_active=True,
    )
    db_session.add(foreign_org)
    db_session.flush()

    resp = _select_orgs(worker_a_client, seed.worker_a.id, [foreign_org.id])
    assert resp.status_code == 400


def test_worker_cannot_edit_another_workers_selection(worker_b_client, seed):
    resp = _select_orgs(worker_b_client, seed.worker_a.id, [seed.org.id])
    assert resp.status_code == 403
    assert worker_b_client.get(
        f'/api/v1/workers/{seed.worker_a.id}/organizations'
    ).status_code == 403


def test_admin_can_read_worker_selection(apf_client, seed):
    resp = apf_client.get(f'/api/v1/workers/{seed.worker_a.id}/organizations')
    assert resp.status_code == 200


# ── matching gate ─────────────────────────────────────────────────────────────

def test_gate_no_selection_is_open_to_all(db_session, worker_a_client, apf_client, seed):
    org_b = _second_org(db_session, seed)
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(org_b.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    assert {r['worker_user_id'] for r in responses} == {
        str(seed.worker_a.id), str(seed.worker_b.id),
    }


def test_gate_selection_excludes_other_orgs_broadcast(db_session, worker_a_client, apf_client, seed):
    """Worker A opts into org A only → org B's publish must skip them,
    while unrestricted worker B still gets notified."""
    org_b = _second_org(db_session, seed)
    assert _select_orgs(worker_a_client, seed.worker_a.id, [seed.org.id]).status_code == 200

    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(org_b.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    assert {r['worker_user_id'] for r in responses} == {str(seed.worker_b.id)}


def test_gate_selected_org_still_notifies(db_session, worker_a_client, apf_client, seed):
    """The selection restricts to OTHER orgs — the selected org still reaches
    the worker."""
    _second_org(db_session, seed)  # exists but unselected
    assert _select_orgs(worker_a_client, seed.worker_a.id, [seed.org.id]).status_code == 200

    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    assert str(seed.worker_a.id) in {r['worker_user_id'] for r in responses}


def test_gate_reason_label(db_session, worker_a_client, seed):
    org_b = _second_org(db_session, seed)
    assert _select_orgs(worker_a_client, seed.worker_a.id, [seed.org.id]).status_code == 200

    from app.models.staffing_request import StaffingRequest
    from app.models.enums import RequestStatus, RequestType
    from datetime import date, time, timedelta
    request = StaffingRequest(
        id=uuid4(), organization_id=org_b.id, created_by_user_id=seed.apf.id,
        request_type=RequestType.URGENT_REPLACEMENT, status=RequestStatus.OPEN,
        title='Org B shift', city='IntTestCity',
        work_date=date.today() + timedelta(days=7),
        start_time=time(8, 0), end_time=time(16, 0), urgency_level=2,
    )
    db_session.add(request)
    db_session.flush()

    result = MatchingService(db=db_session).eligibility_result(request, seed.worker_a)
    assert result.eligible is False
    assert any(r.label == 'Organization not selected' for r in result.reasons)


def test_gate_deselect_restores_eligibility(db_session, worker_a_client, apf_client, seed):
    org_b = _second_org(db_session, seed)
    assert _select_orgs(worker_a_client, seed.worker_a.id, [seed.org.id]).status_code == 200
    assert _select_orgs(worker_a_client, seed.worker_a.id, []).status_code == 200

    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(org_b.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    assert str(seed.worker_a.id) in {r['worker_user_id'] for r in responses}
