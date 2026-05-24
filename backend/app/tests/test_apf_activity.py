"""APF activity feed: filter chips, cursor pagination, tenant scoping."""
from app.tests.conftest import request_payload


def _create_published_request(client, seed):
    rid = client.post('/api/v1/requests', json=request_payload(seed.org.id, seed.apf.id)).json()['id']
    client.post(f'/api/v1/requests/{rid}/publish')
    return rid


def test_activity_default_filter_returns_all(apf_client, seed):
    rid = _create_published_request(apf_client, seed)
    apf_client.post(f'/api/v1/requests/{rid}/cancel', json={'reason': 'test'})

    resp = apf_client.get('/api/v1/apf/activity')
    assert resp.status_code == 200
    data = resp.json()
    assert data['counts']['all'] >= 3  # created + published + cancelled (and possibly notifications)
    assert data['counts']['cancelled'] >= 1
    actions = {r['action'] for r in data['items']}
    assert 'staffing_request.created' in actions
    assert 'staffing_request.published' in actions
    assert 'staffing_request.cancelled' in actions


def test_activity_filter_cancelled_excludes_creates(apf_client, seed):
    rid = _create_published_request(apf_client, seed)
    apf_client.post(f'/api/v1/requests/{rid}/cancel', json={'reason': 'test'})

    resp = apf_client.get('/api/v1/apf/activity?filter=cancelled')
    assert resp.status_code == 200
    data = resp.json()
    assert all(r['action'] != 'staffing_request.created' for r in data['items'])
    assert all(r['action'] != 'staffing_request.published' for r in data['items'])
    assert any(r['action'] == 'staffing_request.cancelled' for r in data['items'])


def test_activity_filter_invitations(apf_client, seed):
    invite_resp = apf_client.post(
        '/api/v1/coordinators/invite',
        json={
            'first_name': 'Activity',
            'last_name': 'Test',
            'email': 'activity-test-coord@inttest.example',
            'preferred_language': 'fr',
            'org_ids': [str(seed.org.id)],
        },
    )
    assert invite_resp.status_code in (200, 201), f'invite failed: {invite_resp.text}'

    resp = apf_client.get('/api/v1/apf/activity?filter=invitations')
    data = resp.json()
    assert data['counts']['invitations'] >= 1
    assert all(r['action'] in {'coordinator.invited', 'worker.invited'} for r in data['items'])


def test_activity_cursor_pagination_no_overlap(apf_client, seed):
    # Generate a handful of audit events.
    for _ in range(6):
        _create_published_request(apf_client, seed)

    page1 = apf_client.get('/api/v1/apf/activity?limit=4').json()
    assert len(page1['items']) == 4
    cursor = page1['next_cursor']
    assert cursor is not None

    page2 = apf_client.get(f'/api/v1/apf/activity?limit=4&cursor={cursor}').json()
    page1_ids = {r['id'] for r in page1['items']}
    page2_ids = {r['id'] for r in page2['items']}
    assert not (page1_ids & page2_ids), 'pages must not overlap'


def test_activity_resolves_actor_and_org_and_request_title(apf_client, seed):
    rid = _create_published_request(apf_client, seed)

    resp = apf_client.get('/api/v1/apf/activity')
    items = resp.json()['items']

    created = next(r for r in items if r['action'] == 'staffing_request.created')
    assert created['actor'] is not None
    assert created['actor']['first_name'] == seed.apf.first_name
    assert created['organization'] is not None
    assert created['organization']['id'] == str(seed.org.id)
    assert created['request_title'] == 'Integration test shift'
    assert created['entity_id'] == rid


def test_activity_forbidden_for_worker(worker_a_client):
    resp = worker_a_client.get('/api/v1/apf/activity')
    assert resp.status_code == 403
