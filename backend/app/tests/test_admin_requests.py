"""Admin /admin/requests draft create + PATCH autosave."""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.models.tenant import Tenant
from app.tests.conftest import request_payload


def test_admin_create_returns_draft(apf_client, seed):
    resp = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data['status'] == 'draft'
    assert data['organization_id'] == str(seed.org.id)


def test_admin_patch_updates_draft_fields(apf_client, seed):
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={
            'title': 'Updated shift title',
            'urgency_level': 3,
            'arrival_instructions': 'Side door',
        },
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data['title'] == 'Updated shift title'
    assert data['urgency_level'] == 3
    assert data['arrival_instructions'] == 'Side door'
    # Fields not in payload should be unchanged.
    assert data['city'] == 'IntTestCity'


def test_admin_patch_with_date_and_time_fields(apf_client, seed):
    """Regression: PATCH of work_date/start_time/end_time used to 500 because
    raw date/time objects landed in the JSONB audit payload."""
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={
            'work_date': '2026-08-15',
            'start_time': '09:30',
            'end_time': '15:45',
            'coverage_type': 'planned_absence',
            'hourly_rate': '32.50',
        },
    )
    assert patch.status_code == 200
    data = patch.json()
    assert data['work_date'] == '2026-08-15'
    assert data['start_time'].startswith('09:30')
    assert data['end_time'].startswith('15:45')


def test_admin_patch_unset_fields_remain_unchanged(apf_client, seed):
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id, urgency_level=2),
    ).json()['id']

    # PATCH only title — urgency_level should stay at 2.
    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={'title': 'Just the title'},
    )
    assert patch.status_code == 200
    assert patch.json()['urgency_level'] == 2


def test_admin_patch_replaces_overlapping_qualifications(apf_client, seed):
    """Regression: PATCH replacing a quals list that contains a code already
    present (e.g. existing has ECE_LEVEL_1, new is [ECE_LEVEL_1, AEC_PETITE_ENFANCE])
    used to 500 because the unique constraint (request, type, code) tripped
    before SQLAlchemy deleted the orphans."""
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id, required_qualifications=['ECE_LEVEL_1']),
    ).json()['id']

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={'required_qualifications': ['ECE_LEVEL_1', 'AEC_PETITE_ENFANCE', 'PSW', 'NURSE']},
    )
    assert patch.status_code == 200
    quals = [
        q if isinstance(q, str) else q.get('code')
        for q in patch.json()['required_qualifications']
    ]
    assert set(quals) == {'ECE_LEVEL_1', 'AEC_PETITE_ENFANCE', 'PSW', 'NURSE'}


def test_admin_patch_replaces_qualifications_list(apf_client, seed):
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id, required_qualifications=['ECE_LEVEL_1']),
    ).json()['id']

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={'required_qualifications': ['PSW', 'NURSE']},
    )
    assert patch.status_code == 200
    quals = [
        q if isinstance(q, str) else q.get('code')
        for q in patch.json()['required_qualifications']
    ]
    assert set(quals) == {'PSW', 'NURSE'}


def test_admin_patch_rejects_after_publish(apf_client, seed):
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{rid}/publish')

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={'title': 'Too late'},
    )
    assert patch.status_code == 409


def test_admin_patch_404_for_unknown_request(apf_client):
    patch = apf_client.patch(
        f'/api/v1/admin/requests/{uuid4()}',
        json={'title': 'Nope'},
    )
    assert patch.status_code == 404


def test_admin_patch_403_for_request_outside_scope(apf_client, db_session, seed):
    other_tenant = Tenant(id=uuid4(), name='Other-Edit', slug=f'other-edit-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside-Edit',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    from datetime import date, time
    from app.models.staffing_request import StaffingRequest
    other_request = StaffingRequest(
        id=uuid4(),
        organization_id=other_org.id,
        created_by_user_id=seed.apf.id,
        request_type='urgent_replacement',
        title='Outside draft',
        city='OtherCity',
        work_date=date(2026, 8, 1),
        start_time=time(8, 0),
        end_time=time(16, 0),
        urgency_level=2,
        status='draft',
    )
    db_session.add(other_request)
    db_session.flush()

    patch = apf_client.patch(
        f'/api/v1/admin/requests/{other_request.id}',
        json={'title': 'Forbidden'},
    )
    assert patch.status_code == 403


def test_admin_patch_forbidden_for_worker(worker_a_client, apf_client, seed):
    rid = apf_client.post(
        '/api/v1/admin/requests',
        json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']

    patch = worker_a_client.patch(
        f'/api/v1/admin/requests/{rid}',
        json={'title': 'Nope'},
    )
    assert patch.status_code == 403
