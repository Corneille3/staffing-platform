"""GET /platform/audit-log — the reader of the tier-0 audit trail (P5 of the
2026-10-25 /platform review: the trail was written, never shown)."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.models.enums import PlatformOperatorRole
from app.models.platform_audit_log import PlatformAuditLog
from app.tests.test_platform_operators import _add_operator, _client_for

URL = '/api/v1/platform/audit-log'
T0 = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def _empty_trail(db_session):
    """The dev database may hold rows; cleared inside the test's transaction."""
    db_session.execute(delete(PlatformAuditLog))
    db_session.flush()


def _row(db_session, minutes: int, action: str, actor_id=None, **fields) -> PlatformAuditLog:
    """`minutes` after T0 — explicit, because now() is the transaction start
    and every row of a test would otherwise share one timestamp."""
    entry = PlatformAuditLog(
        id=uuid4(), actor_user_id=actor_id, action=action,
        created_at=T0 + timedelta(minutes=minutes), **fields,
    )
    db_session.add(entry)
    db_session.flush()
    return entry


def test_owner_reads_the_trail_newest_first_with_names(platform_admin_client, db_session, seed):
    owner = seed.apf
    _row(db_session, 1, 'tenant.suspended', owner.id,
         target_type='tenant', target_id=str(seed.tenant.id), payload={'slug': seed.tenant.slug})
    _row(db_session, 2, 'operator.role_changed', owner.id, target_type='operator', target_id=str(uuid4()),
         payload={'email': 'ana@staffig.example', 'from': 'support', 'to': 'operator'})
    _row(db_session, 3, 'access.requested', owner.id, target_type='grant', target_id=str(uuid4()),
         payload={'tenant_id': str(seed.tenant.id), 'reason': 'Billing question'})
    _row(db_session, 4, 'lead.deleted', owner.id, target_type='platform_lead', target_id=str(uuid4()),
         payload={'org_name': 'Résidence Test', 'event_count': 2})
    _row(db_session, 5, 'settings.updated', None, target_type='platform_settings',
         payload={'trial_length_days': 45})

    res = platform_admin_client.get(URL)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['total'] == 5
    rows = data['rows']
    assert [row['action'] for row in rows] == [
        'settings.updated', 'lead.deleted', 'access.requested',
        'operator.role_changed', 'tenant.suspended',
    ]
    labels = {row['action']: row['target_label'] for row in rows}
    assert labels == {
        'settings.updated': None,
        'lead.deleted': 'Résidence Test',
        'access.requested': seed.tenant.name,      # through payload.tenant_id
        'operator.role_changed': 'ana@staffig.example',
        'tenant.suspended': seed.tenant.name,      # the name, not the slug
    }
    # The actor is named; a removed account (actor NULL) reads as nobody.
    assert rows[1]['actor_name'] == f'{owner.first_name} {owner.last_name}'
    assert rows[1]['actor_email'] == owner.email
    assert rows[0]['actor_name'] is None and rows[0]['actor_email'] is None
    assert rows[3]['details'] == {'email': 'ana@staffig.example', 'from': 'support', 'to': 'operator'}
    assert rows[0]['details'] == {'trial_length_days': 45}


def test_category_filter_and_pages(platform_admin_client, db_session, seed):
    for minute in range(7):
        _row(db_session, minute, 'tenant.invited', seed.apf.id, target_type='tenant',
             target_id=str(uuid4()), payload={'slug': f'net-{minute}', 'name': f'Network {minute}'})
    _row(db_session, 30, 'operator.invited', seed.apf.id, payload={'email': 'x@staffig.example'})

    first = platform_admin_client.get(URL, params={'category': 'tenant', 'limit': 3}).json()
    assert first['total'] == 7
    assert [row['target_label'] for row in first['rows']] == ['Network 6', 'Network 5', 'Network 4']

    last = platform_admin_client.get(URL, params={'category': 'tenant', 'limit': 3, 'offset': 6}).json()
    assert [row['target_label'] for row in last['rows']] == ['Network 0']

    assert platform_admin_client.get(URL, params={'category': 'operator'}).json()['total'] == 1
    assert platform_admin_client.get(URL, params={'category': 'lead'}).json() == {'rows': [], 'total': 0}
    assert platform_admin_client.get(URL).json()['total'] == 8


def test_bad_parameters_are_refused(platform_admin_client, seed):
    assert platform_admin_client.get(URL, params={'category': 'payroll'}).status_code == 422
    assert platform_admin_client.get(URL, params={'limit': 0}).status_code == 422
    assert platform_admin_client.get(URL, params={'limit': 101}).status_code == 422
    assert platform_admin_client.get(URL, params={'offset': -1}).status_code == 422


@pytest.mark.parametrize('role', [
    PlatformOperatorRole.OPERATOR, PlatformOperatorRole.SUPPORT, PlatformOperatorRole.MARKETING,
])
def test_only_the_owner_reads_it(db_session, seed, role):
    sub = f'int-audit-{role.value}'
    _add_operator(db_session, role, clerk_sub=sub)
    with _client_for(db_session, sub) as client:
        assert client.get(URL).status_code == 403


@pytest.mark.parametrize('fixture', ['org_admin_client', 'apf_client', 'worker_a_client'])
def test_tenant_side_identities_get_403(request, fixture):
    assert request.getfixturevalue(fixture).get(URL).status_code == 403


def test_a_second_owner_reads_it_too(db_session, seed):
    _add_operator(db_session, PlatformOperatorRole.OWNER, clerk_sub='int-audit-owner2')
    _row(db_session, 1, 'housekeeping.clerk_orphan_removed', None,
         target_type='clerk_user', target_id='user_abc', payload={'email': 'ghost@example.org'})
    with _client_for(db_session, 'int-audit-owner2') as client:
        data = client.get(URL, params={'category': 'housekeeping'}).json()
    assert data['total'] == 1 and data['rows'][0]['target_label'] == 'ghost@example.org'
