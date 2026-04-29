from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_me_requires_authentication() -> None:
    response = client.get('/api/v1/auth/me')

    assert response.status_code == 401
