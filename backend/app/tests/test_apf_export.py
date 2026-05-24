"""APF export job lifecycle + scope guards."""
from uuid import uuid4

from app.models.enums import OrganizationType
from app.models.organization import Organization
from app.models.tenant import Tenant
from app.services.export_service import _invalidate_jobs
from app.tests.conftest import request_payload


def test_export_creates_job_and_completes_inline(apf_client, seed):
    _invalidate_jobs()

    apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    resp = apf_client.post(
        '/api/v1/apf/export',
        json={'date_from': '2026-01-01', 'date_to': '2027-01-01', 'format': 'csv'},
    )
    assert resp.status_code == 202
    job = resp.json()
    assert job['id']

    # FastAPI TestClient runs BackgroundTasks synchronously after the response
    # returns, so by the time we issue the next request the job should be ready.
    status_resp = apf_client.get(f'/api/v1/apf/export/{job["id"]}')
    assert status_resp.status_code == 200
    ready = status_resp.json()
    assert ready['status'] == 'ready'
    assert ready['row_count'] >= 1
    assert ready['download_url']

    dl = apf_client.get(f'/api/v1/apf/export/{job["id"]}/download')
    assert dl.status_code == 200
    body = dl.text
    header_row = body.splitlines()[0]
    assert 'request_id' in header_row
    assert 'organization' in header_row
    assert 'Integration test shift' in body  # seed request title


def test_export_date_range_filters_rows(apf_client, seed):
    _invalidate_jobs()

    apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    # Date window doesn't include the seed request (work_date=2026-06-15).
    resp = apf_client.post(
        '/api/v1/apf/export',
        json={'date_from': '2030-01-01', 'date_to': '2030-12-31'},
    )
    job_id = resp.json()['id']
    ready = apf_client.get(f'/api/v1/apf/export/{job_id}').json()
    assert ready['status'] == 'ready'
    assert ready['row_count'] == 0


def test_export_rejects_org_outside_tenant(apf_client, seed, db_session):
    _invalidate_jobs()

    other_tenant = Tenant(id=uuid4(), name='Other-X', slug=f'other-x-{uuid4().hex[:6]}')
    other_org = Organization(
        id=uuid4(), tenant_id=other_tenant.id, name='Outside-X',
        type=OrganizationType.CHILDCARE, city='OtherCity',
        preferred_language='fr', is_active=True,
    )
    db_session.add_all([other_tenant, other_org])
    db_session.flush()

    resp = apf_client.post(
        '/api/v1/apf/export',
        json={
            'date_from': '2026-01-01',
            'date_to': '2027-01-01',
            'org_ids': [str(other_org.id)],
        },
    )
    # Job is queued; the failure surfaces on the job status (background task).
    assert resp.status_code == 202
    job_id = resp.json()['id']

    status_resp = apf_client.get(f'/api/v1/apf/export/{job_id}').json()
    assert status_resp['status'] == 'failed'
    assert 'access' in (status_resp['error'] or '').lower()


def test_export_invalid_date_range(apf_client):
    _invalidate_jobs()

    resp = apf_client.post(
        '/api/v1/apf/export',
        json={'date_from': '2027-01-01', 'date_to': '2026-01-01'},
    )
    assert resp.status_code == 400


def test_export_forbidden_for_worker(worker_a_client):
    _invalidate_jobs()
    resp = worker_a_client.post(
        '/api/v1/apf/export',
        json={'date_from': '2026-01-01', 'date_to': '2027-01-01'},
    )
    assert resp.status_code == 403


def test_export_get_404_for_unknown_job(apf_client):
    _invalidate_jobs()
    resp = apf_client.get(f'/api/v1/apf/export/{uuid4()}')
    assert resp.status_code == 404
