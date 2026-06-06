"""Platform settings + reserved slugs + owner-gating (PLATFORM_HANDOFF §2.3-2.4)."""
from uuid import uuid4

from app.models.enums import PlatformOperatorRole, UserRole
from app.models.platform_operator import PlatformOperator
from app.models.user import User
from app.tests.conftest import _make_test_client


def test_get_settings_has_defaults_and_reserved_slugs(platform_admin_client, seed):
    resp = platform_admin_client.get('/api/v1/platform/settings')
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['default_language'] == 'fr'
    assert data['trial_length_days'] == 30
    assert 'os' in data['reserved_slugs'] and 'admin' in data['reserved_slugs']


def test_owner_can_update_settings(platform_admin_client, seed):
    resp = platform_admin_client.patch('/api/v1/platform/settings', json={
        'trial_length_days': 45, 'reserved_slugs': ['os', 'app', 'mine'],
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data['trial_length_days'] == 45
    assert set(data['reserved_slugs']) == {'os', 'app', 'mine'}


def test_non_owner_operator_cannot_update_settings(db_session, seed):
    """A platform operator who is not an owner gets 403 on owner-only edits."""
    op = User(id=uuid4(), clerk_user_id='int-op-operator', first_name='Op', last_name='Two',
              email=f'op2-{uuid4().hex[:6]}@staffig.example', role=UserRole.PLATFORM_ADMIN,
              preferred_language='en')
    db_session.add(op)
    db_session.flush()
    db_session.add(PlatformOperator(id=uuid4(), user_id=op.id, role=PlatformOperatorRole.OPERATOR))
    db_session.flush()

    client = _make_test_client(db_session, 'int-op-operator', 'platform_admin')
    try:
        # can read
        assert client.get('/api/v1/platform/settings').status_code == 200
        # cannot edit
        assert client.patch('/api/v1/platform/settings', json={'trial_length_days': 10}).status_code == 403
    finally:
        from app.api.deps import get_db_session
        from app.main import app
        app.dependency_overrides.pop(get_db_session, None)


def test_create_network_rejects_reserved_slug(platform_admin_client, seed):
    resp = platform_admin_client.post('/api/v1/networks', json={
        'name': 'Reserved Test', 'slug': 'admin',
        'admin_first_name': 'A', 'admin_last_name': 'B',
        'admin_email': f'res-{uuid4().hex[:6]}@x.example',
    })
    assert resp.status_code == 409
    assert 'reserved' in resp.json()['detail'].lower()
