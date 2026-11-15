"""Operator-level sales pipeline — SPEC_PLATFORM_LEADS §11.

Acceptance criteria covered here (backend session): 1 (403 for everyone but
owner/marketing), 2 (import, idempotent re-import that never clobbers the
operator's work), 3 (lost needs a reason) and 7 (wave A × new = 30), plus the
state machine of §4 and the "overdue actions" counter of criterion 8.

The seed sheet has grown since the spec was written (101 rows -> 138, with
two Saskatchewan segments); 30 wave-A leads is still the number.
"""
from datetime import timedelta
from pathlib import Path

import pytest
from sqlalchemy import delete, select

from app.core.timeutil import shift_today
from app.models.enums import LeadStatus, PlatformOperatorRole
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.tests.test_platform_operators import _add_operator, _client_for

LEADS = '/api/v1/platform/leads'
SEED_XLSX = Path(__file__).parent / 'fixtures' / 'Staffig_Leads_2026-09.xlsx'
SEED_ROWS = 138
SEED_WAVE_A = 30
XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

NEW_LEAD = {'org_name': 'Résidence Test', 'segment': 'rpa_qc', 'province': 'QC'}


@pytest.fixture(autouse=True)
def _empty_pipeline(db_session):
    """The suite runs against the dev database, which may hold imported
    leads (the counts below assume none). Cleared inside the test's own
    transaction, so the rollback at teardown puts them back."""
    db_session.execute(delete(PlatformLead))
    db_session.flush()


def _create(client, **overrides) -> dict:
    res = client.post(LEADS, json={**NEW_LEAD, **overrides})
    assert res.status_code == 201, res.text
    return res.json()


def _import_seed(client):
    with SEED_XLSX.open('rb') as handle:
        return client.post(f'{LEADS}/import', files={'file': (SEED_XLSX.name, handle, XLSX_MIME)})


def _events(db_session, lead_id) -> list[PlatformLeadEvent]:
    return list(db_session.scalars(
        select(PlatformLeadEvent)
        .where(PlatformLeadEvent.lead_id == lead_id)
        .order_by(PlatformLeadEvent.created_at, PlatformLeadEvent.id)
    ))


# ── criterion 1: who gets in ──────────────────────────────────────────────────

@pytest.mark.parametrize('fixture', ['org_admin_client', 'apf_client', 'worker_a_client'])
def test_tenant_side_identities_get_403(request, fixture):
    client = request.getfixturevalue(fixture)
    assert client.get(LEADS).status_code == 403
    assert client.get(f'{LEADS}/stats').status_code == 403
    assert client.post(LEADS, json=NEW_LEAD).status_code == 403
    # No hint about whether a given lead exists.
    assert client.get(f'{LEADS}/00000000-0000-0000-0000-000000000000').status_code == 403


@pytest.mark.parametrize('role', [PlatformOperatorRole.OPERATOR, PlatformOperatorRole.SUPPORT])
def test_operator_and_support_get_403(db_session, seed, role):
    _add_operator(db_session, role, clerk_sub=f'int-op-{role.value}-leads')
    with _client_for(db_session, f'int-op-{role.value}-leads') as client:
        assert client.get(LEADS).status_code == 403
        assert client.post(LEADS, json=NEW_LEAD).status_code == 403
        assert _import_seed(client).status_code == 403


def test_owner_and_marketing_work_the_pipeline(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client)
    operator, _user = _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-mk-leads')
    with _client_for(db_session, 'int-op-mk-leads') as marketing:
        listing = marketing.get(LEADS)
        assert listing.status_code == 200
        assert [row['id'] for row in listing.json()['items']] == [lead['id']]

        # Reading needs no 2FA; writing does (when PLATFORM_MFA_ENFORCED is on).
        blocked = marketing.patch(f"{LEADS}/{lead['id']}", json={'status': 'contacted'})
        assert blocked.status_code == 403 and 'two-factor' in blocked.json()['detail']
        operator.mfa_enabled = True
        db_session.flush()

        moved = marketing.patch(f"{LEADS}/{lead['id']}", json={'status': 'contacted'})
        assert moved.status_code == 200 and moved.json()['status'] == 'contacted'
        note = marketing.post(f"{LEADS}/{lead['id']}/events", json={'type': 'call', 'body': 'Left a voicemail.'})
        assert note.status_code == 201 and note.json()['type'] == 'call'


# ── create / read ─────────────────────────────────────────────────────────────

def test_create_writes_a_created_event_and_defaults(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, email='  rh@test.example  ', notes='   ')
    assert lead['status'] == 'new' and lead['kind'] == 'prospect' and lead['language'] == 'fr'
    assert lead['email'] == 'rh@test.example'
    assert lead['notes'] is None  # blank text is stored as NULL
    assert lead['created_by'] == str(seed.apf.id)

    detail = platform_admin_client.get(f"{LEADS}/{lead['id']}").json()
    assert [(e['type'], e['to_status']) for e in detail['events']] == [('created', 'new')]
    assert detail['events'][0]['actor_name'] == 'APF Admin'


def test_create_rejects_unknown_values(platform_admin_client):
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'segment': 'spaceports'}).status_code == 422
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'province': 'Quebec'}).status_code == 422
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'score': 11}).status_code == 422
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'status': 'won'}).status_code == 422
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'status': 'lost'}).status_code == 422


def test_duplicate_external_ref_is_a_409(platform_admin_client):
    _create(platform_admin_client, external_ref='L900')
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'external_ref': 'L900'}).status_code == 409


def test_unknown_lead_is_a_404_for_an_owner(platform_admin_client):
    assert platform_admin_client.get(f'{LEADS}/00000000-0000-0000-0000-000000000000').status_code == 404


# ── criterion 3 + §4: the state machine ───────────────────────────────────────

def test_lost_without_a_reason_is_a_422_and_changes_nothing(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    res = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'lost', 'notes': 'gone'})
    assert res.status_code == 422
    blank = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'lost', 'lost_reason': '   '})
    assert blank.status_code == 422

    after = platform_admin_client.get(f"{LEADS}/{lead['id']}").json()
    assert after['status'] == 'new' and after['notes'] is None  # the whole PATCH was refused
    assert [e['type'] for e in after['events']] == ['created']


def test_lost_with_a_reason_then_reopen(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    lost = platform_admin_client.patch(
        f"{LEADS}/{lead['id']}", json={'status': 'lost', 'lost_reason': 'Signed with an agency'},
    )
    assert lost.status_code == 200
    assert lost.json()['status'] == 'lost' and lost.json()['lost_reason'] == 'Signed with an agency'

    # A lost lead cannot drop its reason, and only reopens to `contacted`.
    assert platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'lost_reason': ''}).status_code == 422
    assert platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'pilot'}).status_code == 422

    reopened = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'contacted'})
    assert reopened.status_code == 200
    assert reopened.json()['status'] == 'contacted' and reopened.json()['lost_reason'] is None

    events = _events(db_session, lead['id'])
    assert [(e.type, e.from_status, e.to_status) for e in events] == [
        ('created', None, LeadStatus.NEW),
        ('status_changed', LeadStatus.NEW, LeadStatus.LOST),
        ('status_changed', LeadStatus.LOST, LeadStatus.CONTACTED),
    ]
    assert events[1].body == 'Signed with an agency'  # the reason survives in the feed


def test_open_stages_move_both_ways_and_can_skip(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    for target in ('demo_booked', 'contacted', 'pilot', 'invited', 'new'):
        res = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': target})
        assert res.status_code == 200, f'{target}: {res.text}'
        assert res.json()['status'] == target
    transitions = [(e.from_status.value, e.to_status.value)
                   for e in _events(db_session, lead['id']) if e.type == 'status_changed']
    assert transitions == [
        ('new', 'demo_booked'), ('demo_booked', 'contacted'), ('contacted', 'pilot'),
        ('pilot', 'invited'), ('invited', 'new'),
    ]


def test_same_status_writes_no_event(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    res = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'new', 'city': 'Laval'})
    assert res.status_code == 200 and res.json()['city'] == 'Laval'
    assert [e.type for e in _events(db_session, lead['id'])] == ['created']


def test_won_is_never_set_by_hand_and_is_terminal(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    assert platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'won'}).status_code == 422

    # What the conversion flow will do (session 3): stamp it directly.
    row = db_session.get(PlatformLead, lead['id'])
    row.status = LeadStatus.WON
    db_session.flush()
    for target in ('contacted', 'lost'):
        res = platform_admin_client.patch(
            f"{LEADS}/{lead['id']}", json={'status': target, 'lost_reason': 'x'},
        )
        assert res.status_code == 422, target


def test_not_null_fields_cannot_be_nulled(platform_admin_client):
    lead = _create(platform_admin_client)
    assert platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'org_name': None}).status_code == 422
    assert platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'segment': None}).status_code == 422


# ── events are append-only ────────────────────────────────────────────────────

def test_events_append_only(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    added = platform_admin_client.post(
        f"{LEADS}/{lead['id']}/events", json={'type': 'meeting', 'body': '  Met the DG.  '},
    )
    assert added.status_code == 201 and added.json()['body'] == 'Met the DG.'
    event_id = added.json()['id']

    # System event types cannot be forged, an empty body is refused.
    for bad in ({'type': 'status_changed', 'body': 'x'}, {'type': 'converted', 'body': 'x'},
                {'type': 'note', 'body': '   '}):
        assert platform_admin_client.post(f"{LEADS}/{lead['id']}/events", json=bad).status_code == 422

    assert platform_admin_client.delete(f"{LEADS}/{lead['id']}/events/{event_id}").status_code in (404, 405)
    assert platform_admin_client.patch(
        f"{LEADS}/{lead['id']}/events/{event_id}", json={'body': 'edited'},
    ).status_code in (404, 405)

    detail = platform_admin_client.get(f"{LEADS}/{lead['id']}").json()
    assert [e['type'] for e in detail['events']] == ['meeting', 'created']  # newest first


# ── criteria 2 + 7: the import ────────────────────────────────────────────────

def test_import_creates_every_row_of_the_seed_sheet(platform_admin_client, db_session):
    res = _import_seed(platform_admin_client)
    assert res.status_code == 200, res.text
    assert res.json() == {'created': SEED_ROWS, 'updated': 0, 'unchanged': 0, 'skipped': []}

    thomassin = db_session.scalar(select(PlatformLead).where(PlatformLead.external_ref == 'L002'))
    assert thomassin.org_name == 'Groupe Thomassin'
    assert (thomassin.segment, thomassin.kind, thomassin.province) == ('rpa_qc', 'prospect', 'QC')
    assert (thomassin.agency_ban_phase, thomassin.language) == ('P1', 'fr')
    assert (thomassin.site_count, thomassin.score, thomassin.wave) == (9, 8, 'A')  # formula cells
    assert thomassin.hiring_signal is True
    assert thomassin.status == LeadStatus.NEW
    assert (thomassin.source, thomassin.source_detail) == ('research', 'Recherche 2026-09')
    assert thomassin.email == 'administration@groupethomassin.com'
    assert [e.type for e in _events(db_session, thomassin.id)] == ['imported']

    # « Canal » rows carry no wave; Ontario / Saskatchewan rows no ban phase.
    channel = db_session.scalars(select(PlatformLead).where(PlatformLead.kind == 'channel')).all()
    assert channel and all(lead.wave is None and lead.score is None for lead in channel)
    outside_qc = db_session.scalars(select(PlatformLead).where(PlatformLead.province != 'QC')).all()
    assert outside_qc and all(lead.agency_ban_phase == 'none' for lead in outside_qc)


def test_wave_a_new_returns_the_30_leads(platform_admin_client):
    _import_seed(platform_admin_client)
    res = platform_admin_client.get(LEADS, params={'wave': 'A', 'status': 'new', 'limit': 200})
    assert res.status_code == 200
    body = res.json()
    assert body['total'] == SEED_WAVE_A and len(body['items']) == SEED_WAVE_A
    assert all(row['wave'] == 'A' and row['status'] == 'new' for row in body['items'])
    # Default order with no dated action: best score first.
    scores = [row['score'] for row in body['items']]
    assert scores == sorted(scores, reverse=True)


def test_reimport_creates_nothing_and_keeps_the_operators_work(platform_admin_client, db_session):
    _import_seed(platform_admin_client)
    lead = db_session.scalar(select(PlatformLead).where(PlatformLead.external_ref == 'L002'))
    worked = platform_admin_client.patch(f'{LEADS}/{lead.id}', json={
        'status': 'demo_booked', 'notes': 'Spoke to the DG — demo Thursday.',
        'next_action': 'Send the deck', 'next_action_at': '2026-12-01',
        'phone': '418 000-0000',  # a descriptive field: the sheet wins it back
    })
    assert worked.status_code == 200

    again = _import_seed(platform_admin_client)
    assert again.status_code == 200, again.text
    body = again.json()
    assert body['created'] == 0 and body['skipped'] == []
    assert body['updated'] == 1 and body['unchanged'] == SEED_ROWS - 1

    db_session.refresh(lead)
    assert lead.status == LeadStatus.DEMO_BOOKED          # never reset to « Nouveau »
    assert lead.notes == 'Spoke to the DG — demo Thursday.'
    assert lead.next_action == 'Send the deck' and str(lead.next_action_at) == '2026-12-01'
    assert lead.phone == '418 686-3242'
    assert _events(db_session, lead.id)[-1].body == 'Updated by import: phone'

    # A third pass changes nothing at all.
    third = _import_seed(platform_admin_client).json()
    assert (third['created'], third['updated'], third['unchanged']) == (0, 0, SEED_ROWS)


def test_import_csv_reports_bad_rows_and_keeps_the_good_ones(platform_admin_client, db_session):
    csv_text = (
        'ID;Organisation;Segment;Prov.;Type;Statut;Score\n'
        'C001;Bonne Résidence;RPA (QC);QC;Prospect;Nouveau;7\n'
        'C002;;RPA (QC);QC;Prospect;Nouveau;5\n'
        'C003;Segment Inconnu;Aéroport;QC;Prospect;Nouveau;5\n'
        'C004;Déjà Perdu;RPA (QC);QC;Prospect;Perdu;5\n'
        'C005;Sans Province;RPA (QC);;Prospect;Nouveau;5\n'
        'C006;Score Fou;RPA (QC);QC;Prospect;Nouveau;42\n'
    )
    res = platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.csv', csv_text.encode('utf-8-sig'), 'text/csv')},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert (body['created'], body['updated']) == (1, 0)
    assert [s['row'] for s in body['skipped']] == [3, 4, 5, 6, 7]
    assert 'organisation' in body['skipped'][0]['reason']
    assert 'Aéroport' in body['skipped'][1]['reason']
    assert db_session.scalar(select(PlatformLead).where(PlatformLead.external_ref == 'C001')).score == 7


def test_import_refuses_what_is_not_a_leads_sheet(platform_admin_client):
    wrong_type = platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.pdf', b'%PDF-1.4', 'application/pdf')},
    )
    assert wrong_type.status_code == 422
    garbage = platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.xlsx', b'not a zip at all', XLSX_MIME)},
    )
    assert garbage.status_code == 422
    no_headers = platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.csv', b'a,b,c\n1,2,3\n', 'text/csv')},
    )
    assert no_headers.status_code == 422 and 'organisation' in no_headers.json()['detail']


# ── list filters + stats (criterion 8) ────────────────────────────────────────

def test_list_filters_and_search(platform_admin_client):
    _create(platform_admin_client, org_name='Manoir 100% Soleil', city='Laval', kind='enterprise')
    _create(platform_admin_client, org_name='CPE Les Lutins', segment='cpe_qc', province='QC')
    _create(platform_admin_client, org_name='Prairie Care', segment='ltc_sk', province='SK', language='en')

    def names(**params):
        return {row['org_name'] for row in platform_admin_client.get(LEADS, params=params).json()['items']}

    assert names(q='lutins') == {'CPE Les Lutins'}
    assert names(q='100%') == {'Manoir 100% Soleil'}   # % is a literal, not a wildcard
    assert names(q='_') == set()
    assert names(segment='ltc_sk') == {'Prairie Care'}
    assert names(province='sk') == {'Prairie Care'}
    assert names(kind='enterprise') == {'Manoir 100% Soleil'}
    assert platform_admin_client.get(LEADS, params={'segment': 'nope'}).status_code == 422
    page = platform_admin_client.get(LEADS, params={'limit': 2, 'offset': 2}).json()
    assert page['total'] == 3 and len(page['items']) == 1


def test_stats_counts_overdue_open_actions_only(platform_admin_client):
    today = shift_today()
    yesterday, tomorrow = str(today - timedelta(days=1)), str(today + timedelta(days=1))
    _create(platform_admin_client, org_name='Late', next_action_at=yesterday)
    _create(platform_admin_client, org_name='Late too', next_action_at=yesterday, status='pilot')
    _create(platform_admin_client, org_name='Due today', next_action_at=str(today))
    _create(platform_admin_client, org_name='Later', next_action_at=tomorrow, status='demo_booked')
    _create(platform_admin_client, org_name='Late but lost', next_action_at=yesterday,
            status='lost', lost_reason='No budget')
    _create(platform_admin_client, org_name='No date', wave='A')

    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert stats['total'] == 6
    assert stats['overdue_actions'] == 2            # lost leads and today's actions are not late
    assert stats['open_pipeline'] == 5
    assert stats['in_demo_or_pilot'] == 2
    assert stats['by_status']['lost'] == 1 and stats['by_status']['won'] == 0
    assert stats['conversion_rate'] == 0.0          # 3 leads past `new`, none won yet
    assert {'segment': 'rpa_qc', 'wave': 'A', 'count': 1} in stats['by_segment_wave']

    late = platform_admin_client.get(LEADS, params={'next_action_before': str(today)}).json()
    assert {row['org_name'] for row in late['items']} == {'Late', 'Late too', 'Late but lost'}


# ── criteria 4 + 5: conversion (« Invite as a network » → won) ────────────────

INVITE = {
    'slug': 'residence-test',
    'admin_first_name': 'Claire',
    'admin_last_name': 'Dubois',
    'admin_email': 'Claire.Dubois@residence-test.example',
}


def _invite(client, lead_id, **overrides):
    return client.post(f'{LEADS}/{lead_id}/invite', json={**INVITE, **overrides})


def test_invite_creates_the_tenant_and_links_the_lead(platform_admin_client, db_session, seed):
    from app.models.enums import TenantStatus, UserRole
    from app.models.tenant import Tenant
    from app.models.user import User

    lead = _create(platform_admin_client, status='pilot', language='en', phone='(514) 555-0100')
    res = _invite(platform_admin_client, lead['id'])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body['lead']['status'] == 'invited'
    assert body['tenant']['slug'] == 'residence-test'
    assert body['tenant']['status'] == 'pending'
    assert body['lead']['tenant_id'] == body['tenant']['id']

    tenant = db_session.scalar(select(Tenant).where(Tenant.slug == 'residence-test'))
    assert tenant.name == 'Résidence Test' and tenant.status == TenantStatus.PENDING
    admin = db_session.scalar(select(User).where(User.email == 'claire.dubois@residence-test.example'))
    assert admin.role == UserRole.NETWORK_ADMIN
    assert admin.preferred_language == 'en'  # falls back to the lead's language

    last = _events(db_session, lead['id'])[-1]
    assert (last.type, last.from_status, last.to_status) == ('invited', LeadStatus.PILOT, LeadStatus.INVITED)

    detail = platform_admin_client.get(f"{LEADS}/{lead['id']}").json()
    assert detail['tenant'] == body['tenant']

    # The tenants table shows where the tenant came from.
    rows = platform_admin_client.get('/api/v1/platform/tenants').json()['tenants']
    row = next(r for r in rows if r['slug'] == 'residence-test')
    assert (row['lead_segment'], row['lead_source']) == ('rpa_qc', 'research')
    assert next(r for r in rows if r['slug'] == seed.tenant.slug)['lead_segment'] is None

    # One lead, one tenant.
    again = _invite(platform_admin_client, lead['id'], slug='residence-test-2',
                    admin_email='other@residence-test.example')
    assert again.status_code == 409


def test_invite_is_all_or_nothing(platform_admin_client, db_session, seed):
    from app.models.tenant import Tenant

    lead = _create(platform_admin_client, status='pilot')
    events_before = len(_events(db_session, lead['id']))

    # The admin email already belongs to someone: refused after the slug
    # checks passed — nothing may be left behind.
    clash = _invite(platform_admin_client, lead['id'], admin_email=seed.apf.email)
    assert clash.status_code == 409
    taken = _invite(platform_admin_client, lead['id'], slug=seed.tenant.slug)
    assert taken.status_code == 409
    assert _invite(platform_admin_client, lead['id'], slug='Bad Slug').status_code == 422

    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.PILOT and row.tenant_id is None
    assert len(_events(db_session, lead['id'])) == events_before
    assert db_session.scalar(select(Tenant).where(Tenant.slug == 'residence-test')) is None


def test_invite_refuses_closed_and_unknown_leads(platform_admin_client, seed):
    lost = _create(platform_admin_client, status='lost', lost_reason='No budget')
    assert _invite(platform_admin_client, lost['id']).status_code == 409
    assert _invite(platform_admin_client, '00000000-0000-0000-0000-000000000000').status_code == 404


def test_invite_is_owner_only(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='pilot')
    operator, _user = _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-mk-invite')
    operator.mfa_enabled = True
    db_session.flush()
    with _client_for(db_session, 'int-op-mk-invite') as marketing:
        assert _invite(marketing, lead['id']).status_code == 403
    _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-op-invite')
    with _client_for(db_session, 'int-op-op-invite') as operator_client:
        assert _invite(operator_client, lead['id']).status_code == 403
    assert db_session.get(PlatformLead, lead['id']).tenant_id is None


def test_tenant_activation_wins_the_lead(platform_admin_client, db_session, seed):
    from app.models.user import User
    from app.tests.conftest import _make_test_client

    lead = _create(platform_admin_client, status='demo_booked')
    assert _invite(platform_admin_client, lead['id']).status_code == 201

    # The invited admin signs up and finishes the onboarding wizard.
    admin = db_session.scalar(select(User).where(User.email == 'claire.dubois@residence-test.example'))
    admin.clerk_user_id = 'int-lead-admin'
    db_session.flush()
    tenant_admin = _make_test_client(db_session, 'int-lead-admin', 'network_admin')
    done = tenant_admin.post('/api/v1/tenant/onboarding/complete')
    assert done.status_code == 200 and done.json()['status'] == 'active'

    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.WON and row.converted_at is not None
    last = _events(db_session, lead['id'])[-1]
    assert (last.type, last.from_status, last.to_status, last.actor_id) == (
        'converted', LeadStatus.INVITED, LeadStatus.WON, None,
    )

    # Idempotent: finishing again writes nothing more; won stays terminal.
    count = len(_events(db_session, lead['id']))
    assert tenant_admin.post('/api/v1/tenant/onboarding/complete').status_code == 200
    assert len(_events(db_session, lead['id'])) == count
    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert stats['by_status']['won'] == 1


def test_activation_without_a_lead_changes_nothing(apf_client, seed, db_session):
    from app.models.enums import TenantStatus

    seed.tenant.status = TenantStatus.ONBOARDING
    db_session.flush()
    assert apf_client.post('/api/v1/tenant/onboarding/complete').status_code == 200
    assert db_session.scalar(select(PlatformLead)) is None
