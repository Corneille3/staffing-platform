"""GET /workers/{id}/responses — one round-trip for a worker's own rows
(the Boîte's replacement for one GET /requests/{id}/responses per request)."""

from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from app.models.enums import (
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    ResponseStatus,
)
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest


def _request_with_response(session, seed, worker, title, response_status):
    request = StaffingRequest(
        id=uuid4(), organization_id=seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=RequestStatus.NOTIFIED, origin=RequestOrigin.COORDINATOR,
        title=title, city='IntTestCity',
        work_date=date.today() + timedelta(days=7),
        start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(request)
    session.flush()
    session.add(RequestResponse(
        id=uuid4(), staffing_request_id=request.id, worker_user_id=worker.id,
        status=response_status, created_at=datetime.now(timezone.utc),
    ))
    session.flush()
    return request


def test_worker_lists_only_their_own_rows(worker_a_client, db_session, seed):
    mine_new = _request_with_response(db_session, seed, seed.worker_a, 'Mine · new', ResponseStatus.NOTIFIED)
    mine_declined = _request_with_response(db_session, seed, seed.worker_a, 'Mine · declined', ResponseStatus.DECLINED)
    _request_with_response(db_session, seed, seed.worker_b, 'Theirs', ResponseStatus.NOTIFIED)

    resp = worker_a_client.get(f'/api/v1/workers/{seed.worker_a.id}/responses')

    assert resp.status_code == 200
    items = resp.json()['items']
    assert {item['staffing_request_id'] for item in items} == {str(mine_new.id), str(mine_declined.id)}
    assert all(item['worker_user_id'] == str(seed.worker_a.id) for item in items)
    assert {item['status'] for item in items} == {'notified', 'declined'}


def test_worker_cannot_read_another_workers_rows(worker_a_client, db_session, seed):
    _request_with_response(db_session, seed, seed.worker_b, 'Theirs', ResponseStatus.NOTIFIED)

    resp = worker_a_client.get(f'/api/v1/workers/{seed.worker_b.id}/responses')

    assert resp.status_code == 403


def test_admin_can_read_a_workers_rows(org_admin_client, db_session, seed):
    request = _request_with_response(db_session, seed, seed.worker_b, 'Theirs', ResponseStatus.ACCEPTED)

    resp = org_admin_client.get(f'/api/v1/workers/{seed.worker_b.id}/responses')

    assert resp.status_code == 200
    assert [item['staffing_request_id'] for item in resp.json()['items']] == [str(request.id)]


def test_empty_when_never_notified(worker_a_client, seed):
    resp = worker_a_client.get(f'/api/v1/workers/{seed.worker_a.id}/responses')

    assert resp.status_code == 200
    assert resp.json()['items'] == []
