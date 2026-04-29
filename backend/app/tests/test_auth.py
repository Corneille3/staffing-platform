import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_me_requires_authentication() -> None:
    response = client.get('/api/v1/auth/me')

    assert response.status_code == 401


def test_sync_requires_authentication() -> None:
    response = client.post('/api/v1/auth/sync')

    assert response.status_code == 401


PROTECTED_GETS = [
    '/api/v1/organizations',
    '/api/v1/users',
    '/api/v1/workers',
    '/api/v1/requests',
    '/api/v1/assignments',
    '/api/v1/notifications',
    '/api/v1/reports/network-summary',
    '/api/v1/audit-logs',
]


@pytest.mark.parametrize('path', PROTECTED_GETS)
def test_protected_get_requires_authentication(path: str) -> None:
    response = client.get(path)

    assert response.status_code == 401, f'{path} should require auth, got {response.status_code}'


def test_create_request_requires_authentication() -> None:
    response = client.post('/api/v1/requests', json={})

    assert response.status_code == 401


def test_health_is_public() -> None:
    response = client.get('/health')

    assert response.status_code == 200
