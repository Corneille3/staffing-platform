"""`GET /platform/overview` — what needs the operator's attention, then the
counts. Two things are pinned: what each line means, and what each tier-0
role is allowed to receive (the API withholds, the screen hides nothing)."""
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import delete

from app.core.timeutil import shift_today
from app.models.enums import (
    LeadStatus, PlatformOperatorRole, RequestRole, RequestStatus, RequestType,
    TenantAccessGrantStatus, TenantStatus,
)
from app.models.platform_lead import PlatformLead
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.tests.conftest import _make_test_client
from app.tests.test_platform_operators import _add_operator

OVERVIEW = '/api/v1/platform/overview'


@pytest.fixture(autouse=True)
def _clean_slate(db_session):
    """The suite runs against the dev database: start from no lead and no
    stray tenant state, inside the test's own transaction."""
    db_session.execute(delete(PlatformLead))
    db_session.flush()


def _tenant(db_session, status: TenantStatus, *, days_old: int = 0, name: str | None = None) -> Tenant:
    tenant = Tenant(
        id=uuid4(), name=name or f'Overview Net {uuid4().hex[:6]}', slug=f'ovw-{uuid4().hex[:8]}',
        status=status, is_active=status not in (TenantStatus.SUSPENDED, TenantStatus.REMOVED),
        created_at=datetime.now(timezone.utc) - timedelta(days=days_old),
    )
    db_session.add(tenant)
    db_session.flush()
    return tenant


def _lead(db_session, **fields) -> PlatformLead:
    lead = PlatformLead(
        id=uuid4(), org_name=fields.pop('org_name', 'Résidence Test'), segment='rpa_qc',
        province='QC', **fields,
    )
    db_session.add(lead)
    db_session.flush()
    return lead


def _request(db_session, seed, status: RequestStatus, *, days_old: int = 1, org_id=None) -> None:
    db_session.add(StaffingRequest(
        id=uuid4(), organization_id=org_id or seed.org.id, created_by_user_id=seed.org_admin.id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, title='Overview request', city='IntTestCity', urgency_level=2,
        work_date=date.today(), start_time=time(8, 0), end_time=time(16, 0),
        created_at=datetime.now(timezone.utc) - timedelta(days=days_old),
    ))
    db_session.flush()


def _mine(body, tenants) -> list[dict]:
    """Attention lines about the tenants this test created (the dev database
    may hold others)."""
    ids = {str(t.id) for t in tenants}
    return [item for item in body['attention'] if item.get('tenant_id') in ids]


def _kinds(items) -> list[str]:
    return [item['kind'] for item in items]


# ── shape ─────────────────────────────────────────────────────────────────────

def test_overview_shape_for_an_owner(platform_admin_client, seed):
    res = platform_admin_client.get(OVERVIEW)
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == {'generated_at', 'attention', 'tenants', 'activity', 'leads', 'audit'}
    assert set(body['tenants']) == {'pending', 'onboarding', 'active', 'suspended'}
    assert set(body['activity']) == {'days', 'published', 'filled', 'expired', 'fill_rate'}
    assert body['activity']['days'] == 7
    assert set(body['leads']) == {'total', 'open_pipeline', 'by_status'}
    assert isinstance(body['audit'], list) and len(body['audit']) <= 5
    assert body['tenants']['active'] >= 1  # the seed tenant
    # Privacy boundary: an attention line never carries more than these keys.
    for item in body['attention']:
        assert set(item) == {'kind', 'count', 'name', 'days', 'tenant_id', 'lead_id', 'info_only'}


# ── things to act on: tenants ─────────────────────────────────────────────────

def test_stalled_and_suspended_tenants_are_listed(platform_admin_client, db_session, seed):
    fresh = _tenant(db_session, TenantStatus.PENDING, days_old=6)
    stale = _tenant(db_session, TenantStatus.PENDING, days_old=9, name='Invite Sans Suite')
    stuck = _tenant(db_session, TenantStatus.ONBOARDING, days_old=12, name='Assistant En Panne')
    suspended = _tenant(db_session, TenantStatus.SUSPENDED, days_old=40, name='Réseau Suspendu')
    removed = _tenant(db_session, TenantStatus.REMOVED, days_old=40)
    before = platform_admin_client.get(OVERVIEW).json()

    mine = _mine(before, [fresh, stale, stuck, suspended, removed])
    assert sorted((i['kind'], i['name'], i['days']) for i in mine if i['kind'] != 'tenant_suspended') == [
        ('invite_stale', 'Invite Sans Suite', 9),
        ('onboarding_stuck', 'Assistant En Panne', 12),
    ]
    assert [(i['kind'], i['name'], i['days']) for i in mine if i['kind'] == 'tenant_suspended'] == [
        ('tenant_suspended', 'Réseau Suspendu', None),
    ]
    assert all(i['lead_id'] is None and i['info_only'] is False for i in mine)

    # Counted by status; a removed tenant is forgotten.
    seed.tenant.status = TenantStatus.SUSPENDED
    db_session.flush()
    after = platform_admin_client.get(OVERVIEW).json()
    assert after['tenants']['suspended'] == before['tenants']['suspended'] + 1
    assert after['tenants']['active'] == before['tenants']['active'] - 1


def test_a_stalled_tenant_links_its_lead_for_the_owner_once(platform_admin_client, db_session, seed):
    """The tenant's line carries the lead; the pipeline's own « stale invite »
    is not listed a second time."""
    tenant = _tenant(db_session, TenantStatus.PENDING, days_old=10, name='Venu Du Pipeline')
    lead = _lead(
        db_session, org_name='Venu Du Pipeline', status=LeadStatus.INVITED, tenant_id=tenant.id,
        invited_at=datetime.now(timezone.utc) - timedelta(days=10),
    )
    body = platform_admin_client.get(OVERVIEW).json()
    assert [(i['kind'], i['lead_id']) for i in _mine(body, [tenant])] == [('invite_stale', str(lead.id))]
    assert [i for i in body['attention'] if i['lead_id'] == str(lead.id)] == _mine(body, [tenant])


def test_pending_access_requests_are_information(platform_admin_client, db_session, seed):
    tenant = _tenant(db_session, TenantStatus.ACTIVE, name='Accès Demandé')
    db_session.add_all([
        TenantAccessGrant(
            id=uuid4(), operator_user_id=seed.apf.id, tenant_id=tenant.id,
            reason='Support visit', status=TenantAccessGrantStatus.REQUESTED,
        ),
        TenantAccessGrant(  # an answered request is nobody's wait any more
            id=uuid4(), operator_user_id=seed.apf.id, tenant_id=seed.tenant.id,
            reason='Old visit', status=TenantAccessGrantStatus.DENIED,
        ),
    ])
    db_session.flush()
    body = platform_admin_client.get(OVERVIEW).json()
    assert [(i['kind'], i['name'], i['info_only']) for i in _mine(body, [tenant])] == [
        ('access_request_pending', 'Accès Demandé', True),
    ]
    assert 'access_request_pending' not in _kinds(_mine(body, [seed.tenant]))


# ── things to act on: leads (owner) ───────────────────────────────────────────

def test_lead_lines_for_the_owner(platform_admin_client, db_session, seed):
    today = shift_today()
    _lead(db_session, org_name='Formulaire 1', status=LeadStatus.NEW, source='website_form')
    _lead(db_session, org_name='Formulaire 2', status=LeadStatus.NEW, source='website_form')
    _lead(db_session, org_name='En retard', status=LeadStatus.CONTACTED, next_action_at=today - timedelta(days=2))
    _lead(db_session, org_name="Aujourd'hui", status=LeadStatus.CONTACTED, next_action_at=today)
    _lead(db_session, org_name='Perdu en retard', status=LeadStatus.LOST, lost_reason='x',
          next_action_at=today - timedelta(days=2))
    late = _lead(db_session, org_name='Pilote échu', status=LeadStatus.PILOT,
                 pilot_started_at=datetime.now(timezone.utc) - timedelta(days=35),
                 pilot_ends_at=today - timedelta(days=5))
    _lead(db_session, org_name='Pilote en cours', status=LeadStatus.PILOT,
          pilot_started_at=datetime.now(timezone.utc), pilot_ends_at=today + timedelta(days=30))
    _lead(db_session, org_name='Pilote fini aujourd’hui', status=LeadStatus.PILOT,
          pilot_started_at=datetime.now(timezone.utc) - timedelta(days=30), pilot_ends_at=today)

    body = platform_admin_client.get(OVERVIEW).json()
    lead_lines = [i for i in body['attention'] if i['tenant_id'] is None]
    assert [(i['kind'], i['count'], i['name'], i['days'], i['lead_id']) for i in lead_lines] == [
        ('new_website_requests', 2, None, None, None),
        ('overdue_followups', 1, None, None, None),   # today's action and a lost lead are not late
        ('pilot_overdue', 1, 'Pilote échu', 5, str(late.id)),
    ]
    assert body['leads']['total'] == 8
    assert body['leads']['open_pipeline'] == 7
    assert body['leads']['by_status']['pilot'] == 3


def test_a_quiet_pipeline_adds_no_line(platform_admin_client, db_session, seed):
    _lead(db_session, status=LeadStatus.CONTACTED, next_action_at=shift_today() + timedelta(days=3))
    body = platform_admin_client.get(OVERVIEW).json()
    assert [i for i in body['attention'] if i['tenant_id'] is None] == []


# ── counts ────────────────────────────────────────────────────────────────────

def test_activity_counts_published_requests_of_the_week(platform_admin_client, db_session, seed):
    before = platform_admin_client.get(OVERVIEW).json()['activity']

    _request(db_session, seed, RequestStatus.OPEN)
    _request(db_session, seed, RequestStatus.ASSIGNED)
    _request(db_session, seed, RequestStatus.COMPLETED, days_old=6)
    _request(db_session, seed, RequestStatus.EXPIRED)
    _request(db_session, seed, RequestStatus.DRAFT)                  # not published
    _request(db_session, seed, RequestStatus.ASSIGNED, days_old=8)   # before the window

    after = platform_admin_client.get(OVERVIEW).json()['activity']
    assert after['published'] - before['published'] == 4
    assert after['filled'] - before['filled'] == 2
    assert after['expired'] - before['expired'] == 1
    assert after['fill_rate'] == round(100 * after['filled'] / after['published'])


# ── who receives what ─────────────────────────────────────────────────────────

def _as(db_session, role: PlatformOperatorRole, sub: str):
    operator, _user = _add_operator(db_session, role, clerk_sub=sub)
    operator.mfa_enabled = True
    db_session.flush()
    return _make_test_client(db_session, sub, 'platform_admin')


@pytest.mark.parametrize('role', [PlatformOperatorRole.OPERATOR, PlatformOperatorRole.SUPPORT])
def test_operator_and_support_get_no_pipeline_and_no_audit(db_session, seed, role):
    stale = _tenant(db_session, TenantStatus.PENDING, days_old=10, name='Venu Du Pipeline')
    lead = _lead(db_session, org_name='Venu Du Pipeline', status=LeadStatus.INVITED, tenant_id=stale.id,
                 invited_at=datetime.now(timezone.utc) - timedelta(days=10))
    _lead(db_session, org_name='Formulaire', status=LeadStatus.NEW, source='website_form')
    _lead(db_session, org_name='Pilote échu', status=LeadStatus.PILOT,
          pilot_started_at=datetime.now(timezone.utc) - timedelta(days=40),
          pilot_ends_at=shift_today() - timedelta(days=5))
    waiting = _tenant(db_session, TenantStatus.ACTIVE, name='Accès Demandé')
    db_session.add(TenantAccessGrant(
        id=uuid4(), operator_user_id=seed.apf.id, tenant_id=waiting.id,
        reason='Support visit', status=TenantAccessGrantStatus.REQUESTED,
    ))
    db_session.flush()

    res = _as(db_session, role, f'int-ovw-{role.value}').get(OVERVIEW)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['leads'] is None and body['audit'] is None
    # No line born from a lead, and no lead id on a tenant's line.
    assert not {'new_website_requests', 'overdue_followups', 'pilot_overdue'} & set(_kinds(body['attention']))
    assert all(item['lead_id'] is None for item in body['attention'])
    assert str(lead.id) not in res.text and 'Pilote échu' not in res.text
    # The tenant side stays: the stalled invitation is theirs to chase.
    assert _kinds(_mine(body, [stale])) == ['invite_stale']
    # Access requests: the operator sees them, support does not (as on the route that lists them).
    expected = ['access_request_pending'] if role == PlatformOperatorRole.OPERATOR else []
    assert _kinds(_mine(body, [waiting])) == expected
    assert body['tenants']['active'] >= 2


def test_marketing_and_tenant_roles_are_refused(db_session, seed, apf_client):
    assert _as(db_session, PlatformOperatorRole.MARKETING, 'int-ovw-marketing').get(OVERVIEW).status_code == 403
    assert apf_client.get(OVERVIEW).status_code == 403
