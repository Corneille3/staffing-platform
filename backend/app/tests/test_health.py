from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get('/health')

    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_health_ready_reports_migration_at_head(db_engine) -> None:
    """Readiness probe: 200 only when the DB is reachable AND migrations are at
    head. db_engine fixture runs `alembic upgrade head`, so it should be ready."""
    response = client.get('/health/ready')

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['status'] == 'ready'
    assert body['migration'] == 'at_head'
    assert body['revision']
