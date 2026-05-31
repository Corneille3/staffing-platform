"""Integration tests: full request lifecycle.

Covers: create → publish → accept/decline → assign → cancel → renotify.
Each test is isolated by the savepoint rollback in the db_session fixture.
"""
import pytest

from app.tests.conftest import request_payload


# ── create ────────────────────────────────────────────────────────────────────

def test_create_request_returns_draft(apf_client, seed):
    resp = apf_client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id))

    assert resp.status_code == 201
    data = resp.json()
    assert data['status'] == 'draft'
    assert data['title'] == 'Integration test shift'
    assert data['city'] == 'IntTestCity'
    assert data['organization_id'] == str(seed.org.id)


# ── publish ───────────────────────────────────────────────────────────────────

def test_publish_notifies_eligible_workers(apf_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']

    resp = apf_client.post(f'/api/v1/requests/{request_id}/publish')

    assert resp.status_code == 200
    assert resp.json()['status'] == 'notified'

    # Both workers are eligible — each should have a 'notified' response
    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    assert len(responses) == 2
    assert all(r['status'] == 'notified' for r in responses)
    worker_ids = {r['worker_user_id'] for r in responses}
    assert str(seed.worker_a.id) in worker_ids
    assert str(seed.worker_b.id) in worker_ids


def test_publish_excludes_unavailable_worker(apf_client, worker_a_client, seed):
    # Worker A sets themselves unavailable
    worker_a_client.patch(
        f'/api/v1/workers/{seed.worker_a.id}/availability',
        json={'availability_status': 'unavailable'},
    )

    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    # Only worker B should be notified
    assert len(responses) == 1
    assert responses[0]['worker_user_id'] == str(seed.worker_b.id)


# ── accept / decline ──────────────────────────────────────────────────────────

def test_worker_accepts_request(apf_client, worker_a_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    resp = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )

    assert resp.status_code == 200
    assert resp.json()['status'] == 'accepted'

    # Request status should advance to responses_received
    request_data = apf_client.get(f'/api/v1/requests/{request_id}').json()
    assert request_data['status'] == 'responses_received'


def test_worker_declines_with_reason(apf_client, worker_b_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    resp = worker_b_client.post(
        f'/api/v1/requests/{request_id}/responses/decline',
        json={'worker_user_id': str(seed.worker_b.id), 'decline_reason': 'not_available'},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'declined'
    assert data['decline_reason'] == 'not_available'


def test_mark_viewed_sets_viewed_at(apf_client, worker_a_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    resp = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/view',
        json={'worker_user_id': str(seed.worker_a.id)},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'viewed'
    assert data['viewed_at'] is not None


def test_mark_viewed_is_idempotent(apf_client, worker_a_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/view',
        json={'worker_user_id': str(seed.worker_a.id)},
    )
    # Second call should not error
    resp = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/view',
        json={'worker_user_id': str(seed.worker_a.id)},
    )
    assert resp.status_code == 200


def test_last_reviewed_at_bumps_while_viewed_at_freezes(apf_client, worker_a_client, seed):
    """Banner-clear mechanism (#6 follow-up): viewed_at freezes on first view,
    but last_reviewed_at advances each open — so an edit between views leaves
    last_reviewed_at ahead of viewed_at."""
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    first = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/view',
        json={'worker_user_id': str(seed.worker_a.id)},
    ).json()
    assert first['viewed_at'] is not None
    assert first['last_reviewed_at'] is not None

    # Coordinator edits the published request, then the worker opens it again.
    apf_client.patch(f'/api/v1/admin/requests/{request_id}', json={'location_name': 'Room B'})
    second = worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/view',
        json={'worker_user_id': str(seed.worker_a.id)},
    ).json()

    assert second['viewed_at'] == first['viewed_at']            # frozen at first view
    assert second['last_reviewed_at'] > first['last_reviewed_at']  # advanced on re-open


# ── assign ────────────────────────────────────────────────────────────────────

def test_assign_confirmed_worker(apf_client, worker_a_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')
    worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )

    resp = apf_client.post('/api/v1/assignments', json={
        'staffing_request_id': request_id,
        'worker_user_id': str(seed.worker_a.id),
        'assigned_by_user_id': str(seed.apf.id),
    })

    assert resp.status_code == 201
    data = resp.json()
    assert data['worker_user_id'] == str(seed.worker_a.id)
    assert data['status'] == 'confirmed'

    # Request should be marked assigned
    request_data = apf_client.get(f'/api/v1/requests/{request_id}').json()
    assert request_data['status'] == 'assigned'


def test_assign_requires_prior_acceptance(apf_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')
    # Do NOT accept — try to assign directly
    resp = apf_client.post('/api/v1/assignments', json={
        'staffing_request_id': request_id,
        'worker_user_id': str(seed.worker_a.id),
        'assigned_by_user_id': str(seed.apf.id),
    })

    assert resp.status_code == 409


# ── cancel + renotify ─────────────────────────────────────────────────────────

def test_cancel_assignment_resets_request_and_response(apf_client, worker_a_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')
    worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )
    assignment_id = apf_client.post('/api/v1/assignments', json={
        'staffing_request_id': request_id,
        'worker_user_id': str(seed.worker_a.id),
        'assigned_by_user_id': str(seed.apf.id),
    }).json()['id']

    resp = apf_client.post(f'/api/v1/assignments/{assignment_id}/cancel', json={
        'reason': 'worker_unavailable',
    })

    assert resp.status_code == 200
    assert resp.json()['status'] == 'cancelled'

    # Request rolls back to responses_received
    request_data = apf_client.get(f'/api/v1/requests/{request_id}').json()
    assert request_data['status'] == 'responses_received'

    # Worker A's response is reset to notified (so they can re-respond)
    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    worker_a_response = next(r for r in responses if r['worker_user_id'] == str(seed.worker_a.id))
    assert worker_a_response['status'] == 'notified'


def test_renotify_dispatches_to_eligible_workers(apf_client, worker_a_client, worker_b_client, seed):
    request_id = apf_client.post(
        '/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id),
    ).json()['id']
    apf_client.post(f'/api/v1/requests/{request_id}/publish')

    # Worker B declines
    worker_b_client.post(
        f'/api/v1/requests/{request_id}/responses/decline',
        json={'worker_user_id': str(seed.worker_b.id), 'decline_reason': 'not_available'},
    )
    # Worker A accepts, gets assigned, then assignment is cancelled
    worker_a_client.post(
        f'/api/v1/requests/{request_id}/responses/accept',
        json={'worker_user_id': str(seed.worker_a.id)},
    )
    assignment_id = apf_client.post('/api/v1/assignments', json={
        'staffing_request_id': request_id,
        'worker_user_id': str(seed.worker_a.id),
        'assigned_by_user_id': str(seed.apf.id),
    }).json()['id']
    apf_client.post(f'/api/v1/assignments/{assignment_id}/cancel', json={
        'reason': 'worker_unavailable',
    })

    # Renotify should re-open for both workers
    resp = apf_client.post(f'/api/v1/requests/{request_id}/renotify')

    assert resp.status_code == 200
    assert resp.json()['status'] == 'notified'

    # Both workers should now have notified responses (B's decline was reset)
    responses = apf_client.get(f'/api/v1/requests/{request_id}/responses').json()['items']
    statuses = {r['worker_user_id']: r['status'] for r in responses}
    assert statuses[str(seed.worker_a.id)] == 'notified'
    assert statuses[str(seed.worker_b.id)] == 'notified'
