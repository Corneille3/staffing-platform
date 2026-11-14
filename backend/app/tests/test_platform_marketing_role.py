"""Tier-0 `marketing` role (SPEC_PLATFORM_LEADS): the sales pipeline and
nothing else. A marketing operator is a platform_admin USER, so scope
resolution refuses it everywhere outside /platform/leads and /auth — these
tests pin that, plus the two legacy routes that used to accept any
platform_admin (support included)."""
import pytest

from app.models.enums import PlatformOperatorRole
from app.tests.test_platform_operators import _add_operator, _client_for

CONSOLE_GETS = [
    '/api/v1/platform/tenants',
    '/api/v1/platform/settings',
    '/api/v1/platform/operators',
    '/api/v1/platform/access-grants',
    '/api/v1/platform/housekeeping/orphans',
    '/api/v1/networks',
]

TENANT_GETS = [
    '/api/v1/organizations',
    '/api/v1/workers',
    '/api/v1/requests',
    '/api/v1/users',
    '/api/v1/coordinators',
    '/api/v1/apf/snapshot',
    '/api/v1/apf/activity',
    '/api/v1/audit-logs',
    '/api/v1/admin/dashboard',
    '/api/v1/tenant/profile',
]


@pytest.fixture
def marketing_client(db_session, seed):
    _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-marketing')
    with _client_for(db_session, 'int-op-marketing') as client:
        yield client


@pytest.mark.parametrize('path', CONSOLE_GETS)
def test_marketing_is_locked_out_of_the_console(marketing_client, path):
    assert marketing_client.get(path).status_code == 403


@pytest.mark.parametrize('path', TENANT_GETS)
def test_marketing_never_reads_tenant_data(marketing_client, seed, path):
    res = marketing_client.get(path)
    assert res.status_code == 403, f'{path} -> {res.status_code}'
    assert seed.org.name not in res.text
    assert seed.worker_a.email not in res.text


def test_marketing_cannot_request_tenant_access(marketing_client, seed):
    res = marketing_client.post(
        f'/api/v1/platform/tenants/{seed.tenant.id}/access-request',
        json={'reason': 'I would like to look around'},
    )
    assert res.status_code == 403


def test_marketing_cannot_create_or_remove_a_tenant(marketing_client, seed):
    payload = {
        'name': 'Sneaky Net', 'slug': 'sneaky-net', 'admin_first_name': 'A',
        'admin_last_name': 'B', 'admin_email': 'sneaky@inttest.example',
    }
    assert marketing_client.post('/api/v1/platform/tenants', json=payload).status_code == 403
    assert marketing_client.post('/api/v1/networks', json=payload).status_code == 403
    assert marketing_client.delete(f'/api/v1/networks/{seed.tenant.id}').status_code == 403


def test_owner_can_invite_and_assign_marketing(platform_admin_client, seed):
    res = platform_admin_client.post('/api/v1/platform/operators', json={
        'email': 'mk@staffig.example', 'role': 'marketing',
        'first_name': 'Mar', 'last_name': 'Keting',
    })
    assert res.status_code == 201, res.text
    assert res.json()['role'] == 'marketing'
    operator_id = res.json()['id']
    back = platform_admin_client.patch(
        f'/api/v1/platform/operators/{operator_id}', json={'role': 'support'},
    )
    assert back.status_code == 200 and back.json()['role'] == 'support'
    again = platform_admin_client.patch(
        f'/api/v1/platform/operators/{operator_id}', json={'role': 'marketing'},
    )
    assert again.status_code == 200 and again.json()['role'] == 'marketing'


def test_marketing_can_still_sign_in(marketing_client):
    res = marketing_client.post('/api/v1/auth/sync')
    assert res.status_code == 200, res.text
    assert res.json()['platform_operator_role'] == 'marketing'


# ── legacy routes that only carried the platform_admin surface gate ───────────

def test_support_cannot_create_a_tenant_through_the_legacy_route(db_session, seed):
    _add_operator(db_session, PlatformOperatorRole.SUPPORT, clerk_sub='int-op-support-legacy')
    with _client_for(db_session, 'int-op-support-legacy') as client:
        res = client.post('/api/v1/networks', json={
            'name': 'Legacy Net', 'slug': 'legacy-net', 'admin_first_name': 'A',
            'admin_last_name': 'B', 'admin_email': 'legacy@inttest.example',
        })
        assert res.status_code == 403
        gone = client.post('/api/v1/users/remove-by-email', json={'email': seed.worker_a.email})
        assert gone.status_code == 403
