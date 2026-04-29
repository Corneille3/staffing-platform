from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_me_requires_authentication() -> None:
    response = client.get('/api/v1/auth/me')

    assert response.status_code == 401


def test_sync_requires_authentication() -> None:
    response = client.post('/api/v1/auth/sync')

    assert response.status_code == 401
