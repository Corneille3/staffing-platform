"""Shift duration guard (2026-10-18 prod finding): 15:30 → 12:00 was accepted
as a 20h30 overnight shift. End before start stays legal (overnight), but a
shift longer than MAX_SHIFT_DURATION (16 h) is rejected at create, at publish
and on a post-publish edit — never on a draft autosave."""
from datetime import time, timedelta

from app.core.timeutil import MAX_SHIFT_DURATION, shift_duration
from app.tests.conftest import request_payload


def test_shift_duration_crosses_midnight():
    assert shift_duration(time(8, 0), time(16, 0)) == timedelta(hours=8)
    assert shift_duration(time(22, 0), time(6, 0)) == timedelta(hours=8)
    assert shift_duration(time(15, 30), time(12, 0)) == timedelta(hours=20, minutes=30)
    # Equal times read as a full day under the convention.
    assert shift_duration(time(9, 0), time(9, 0)) == timedelta(hours=24)


def _draft(client, seed, **overrides):
    payload = {**request_payload(seed.org.id, seed.apf.id), **overrides}
    return client.post('/api/v1/admin/requests', json=payload)


def test_create_rejects_shift_over_max(apf_client, seed):
    resp = _draft(apf_client, seed, start_time='15:30:00', end_time='12:00:00')
    assert resp.status_code == 422
    assert '16 hours' in resp.json()['detail']


def test_create_rejects_equal_start_and_end(apf_client, seed):
    resp = _draft(apf_client, seed, start_time='09:00:00', end_time='09:00:00')
    assert resp.status_code == 422


def test_create_accepts_overnight_and_exact_max(apf_client, seed):
    assert _draft(apf_client, seed, start_time='22:00:00', end_time='06:00:00').status_code == 201
    assert MAX_SHIFT_DURATION == timedelta(hours=16)
    assert _draft(apf_client, seed, start_time='06:00:00', end_time='22:00:00').status_code == 201


def test_draft_autosave_tolerates_transient_bad_window_but_publish_rejects(apf_client, seed):
    rid = _draft(apf_client, seed).json()['id']
    # Coordinator types the start first: 15:30 with the old end still in place.
    patch = apf_client.patch(f'/api/v1/admin/requests/{rid}', json={'start_time': '15:30:00', 'end_time': '12:00:00'})
    assert patch.status_code == 200, patch.text

    publish = apf_client.post(f'/api/v1/requests/{rid}/publish')
    assert publish.status_code == 422
    assert apf_client.get(f'/api/v1/requests/{rid}').json()['status'] == 'draft'

    apf_client.patch(f'/api/v1/admin/requests/{rid}', json={'end_time': '18:00:00'})
    assert apf_client.post(f'/api/v1/requests/{rid}/publish').status_code == 200


def test_edit_after_publish_rejects_shift_over_max(apf_client, seed):
    rid = _draft(apf_client, seed).json()['id']
    apf_client.post(f'/api/v1/requests/{rid}/publish')

    patch = apf_client.patch(f'/api/v1/admin/requests/{rid}', json={'start_time': '15:30:00', 'end_time': '12:00:00'})
    assert patch.status_code == 422
    data = apf_client.get(f'/api/v1/requests/{rid}').json()
    # Rejected edit leaves the stored window untouched.
    assert (data['start_time'], data['end_time']) != ('15:30:00', '12:00:00')
