"""Operator-level sales pipeline — SPEC_PLATFORM_LEADS §11.

Acceptance criteria covered here (backend session): 1 (403 for everyone but
owner/marketing), 2 (import, idempotent re-import that never clobbers the
operator's work), 3 (lost needs a reason) and 7 (wave A × new = 30), plus the
state machine of §4 and the "overdue actions" counter of criterion 8.

Since the v1.1 alignment (spec §14, 2026-11-21): `invited` and `pilot` are
never set by hand, `won` only comes from `pilot` (409 otherwise), and an
import refuses `invited` / `pilot` / `won` while taking `lost` with a reason.

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
    for target in ('demo_booked', 'contacted', 'new', 'contacted'):
        res = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': target})
        assert res.status_code == 200, f'{target}: {res.text}'
        assert res.json()['status'] == target
    transitions = [(e.from_status.value, e.to_status.value)
                   for e in _events(db_session, lead['id']) if e.type == 'status_changed']
    assert transitions == [
        ('new', 'demo_booked'), ('demo_booked', 'contacted'), ('contacted', 'new'), ('new', 'contacted'),
    ]


def test_invited_and_pilot_are_never_set_by_hand(platform_admin_client, db_session):
    """Spec v1.1 §4: the invite and the tenant's activation set them. A lead
    without a tenant can show neither — by PATCH or at creation."""
    lead = _create(platform_admin_client, status='demo_booked')
    url = f"{LEADS}/{lead['id']}"
    for target in ('invited', 'pilot'):
        res = platform_admin_client.patch(url, json={'status': target, 'notes': 'Should not stick'})
        assert res.status_code == 422, f'{target}: {res.text}'
        assert res.json()['detail']['code'] == 'lead.stage_set_by_system'
        assert res.json()['detail']['params'] == {'status': target}

        created = platform_admin_client.post(LEADS, json={**NEW_LEAD, 'status': target})
        assert created.status_code == 422
        assert created.json()['detail']['code'] == 'lead.stage_set_by_system'

    after = platform_admin_client.get(url).json()
    assert after['status'] == 'demo_booked' and after['notes'] is None  # the whole PATCH was refused
    assert [e.type for e in _events(db_session, lead['id'])] == ['created']


def test_same_status_writes_no_event(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    res = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'new', 'city': 'Laval'})
    assert res.status_code == 200 and res.json()['city'] == 'Laval'
    assert [e.type for e in _events(db_session, lead['id'])] == ['created']


def test_won_needs_the_pilot_stage_and_is_terminal(platform_admin_client, db_session):
    lead = _create(platform_admin_client)
    # Not in pilot (and no tenant behind the lead): nothing to have won.
    refused = platform_admin_client.patch(f"{LEADS}/{lead['id']}", json={'status': 'won'})
    assert refused.status_code == 409 and refused.json()['detail']['code'] == 'lead.win_needs_pilot'

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
        'C004;Déjà Gagné;RPA (QC);QC;Prospect;Gagné;5\n'
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


def test_import_statuses_a_sheet_may_and_may_not_carry(platform_admin_client, db_session):
    """Spec v1.1 §8: `invited`, `pilot` and `won` need a linked tenant, so
    the row is skipped with its reason. `lost` comes in with its reason."""
    csv_text = (
        'ID;Organisation;Segment;Prov.;Statut;Raison de perte\n'
        'S001;Contactée;RPA (QC);QC;Contacté;\n'
        'S002;Démo;RPA (QC);QC;Démo bookée;ignorée ici\n'
        'S003;Invitée;RPA (QC);QC;Invitation envoyée;\n'
        'S004;En pilote;RPA (QC);QC;Pilote;\n'
        'S005;Gagnée;RPA (QC);QC;Gagné;\n'
        'S006;Perdue;RPA (QC);QC;Perdu;Signé avec une agence\n'
        'S007;Perdue sans raison;RPA (QC);QC;Perdu;\n'
    )
    res = platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.csv', csv_text.encode('utf-8-sig'), 'text/csv')},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body['created'] == 3
    assert [(s['row'], s['code'], s['params']) for s in body['skipped']] == [
        (4, 'status_not_importable', {'value': 'Invitation envoyée'}),
        (5, 'status_not_importable', {'value': 'Pilote'}),
        (6, 'status_not_importable', {'value': 'Gagné'}),
        (8, 'lost_needs_reason', {'value': 'Perdu'}),
    ]

    def lead(ref):
        return db_session.scalar(select(PlatformLead).where(PlatformLead.external_ref == ref))

    assert lead('S001').status == LeadStatus.CONTACTED
    assert lead('S002').status == LeadStatus.DEMO_BOOKED and lead('S002').lost_reason is None
    assert lead('S006').status == LeadStatus.LOST and lead('S006').lost_reason == 'Signé avec une agence'
    assert all(lead(ref) is None for ref in ('S003', 'S004', 'S005', 'S007'))

    # A re-import never moves a lead: the row now says « Perdu », the lead stays.
    again = (
        'ID;Organisation;Segment;Prov.;Statut;Raison de perte\n'
        'S001;Contactée;RPA (QC);QC;Perdu;Plus de budget\n'
    )
    platform_admin_client.post(
        f'{LEADS}/import', files={'file': ('leads.csv', again.encode('utf-8-sig'), 'text/csv')},
    )
    db_session.expire_all()
    assert lead('S001').status == LeadStatus.CONTACTED and lead('S001').lost_reason is None


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
    assert no_headers.status_code == 422 and 'organisation' in no_headers.json()['detail']['message']


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
    _create(platform_admin_client, org_name='Late too', next_action_at=yesterday, status='demo_booked')
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
    assert stats['conversion_rate'] is None         # no pilot has started: nothing to measure
    assert (stats['pilots_active'], stats['pilots_overdue'], stats['stale_invites']) == (0, 0, 0)
    assert stats['avg_pilot_days'] is None
    assert {'segment': 'rpa_qc', 'wave': 'A', 'count': 1} in stats['by_segment_wave']

    late = platform_admin_client.get(LEADS, params={'next_action_before': str(today)}).json()
    assert {row['org_name'] for row in late['items']} == {'Late', 'Late too', 'Late but lost'}


# ── criteria 4 + 5: conversion (« Invite as a network » → pilot → won) ───────

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

    lead = _create(platform_admin_client, status='demo_booked', language='en', phone='(514) 555-0100')
    res = _invite(platform_admin_client, lead['id'])
    assert res.status_code == 201, res.text
    body = res.json()
    assert body['lead']['status'] == 'invited'
    assert body['lead']['invited_at'] is not None and body['lead']['pilot_started_at'] is None
    assert body['tenant']['slug'] == 'residence-test'
    assert body['tenant']['status'] == 'pending'
    assert body['lead']['tenant_id'] == body['tenant']['id']

    tenant = db_session.scalar(select(Tenant).where(Tenant.slug == 'residence-test'))
    assert tenant.name == 'Résidence Test' and tenant.status == TenantStatus.PENDING
    admin = db_session.scalar(select(User).where(User.email == 'claire.dubois@residence-test.example'))
    assert admin.role == UserRole.NETWORK_ADMIN
    assert admin.preferred_language == 'en'  # falls back to the lead's language

    last = _events(db_session, lead['id'])[-1]
    assert (last.type, last.from_status, last.to_status) == ('invited', LeadStatus.DEMO_BOOKED, LeadStatus.INVITED)

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

    lead = _create(platform_admin_client, status='demo_booked')
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
    assert row.status == LeadStatus.DEMO_BOOKED and row.tenant_id is None
    assert len(_events(db_session, lead['id'])) == events_before
    assert db_session.scalar(select(Tenant).where(Tenant.slug == 'residence-test')) is None


def test_invite_refuses_closed_and_unknown_leads(platform_admin_client, seed):
    lost = _create(platform_admin_client, status='lost', lost_reason='No budget')
    assert _invite(platform_admin_client, lost['id']).status_code == 409
    assert _invite(platform_admin_client, '00000000-0000-0000-0000-000000000000').status_code == 404


def test_invite_is_owner_only(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='demo_booked')
    operator, _user = _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-mk-invite')
    operator.mfa_enabled = True
    db_session.flush()
    with _client_for(db_session, 'int-op-mk-invite') as marketing:
        assert _invite(marketing, lead['id']).status_code == 403
    _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-op-invite')
    with _client_for(db_session, 'int-op-op-invite') as operator_client:
        assert _invite(operator_client, lead['id']).status_code == 403
    assert db_session.get(PlatformLead, lead['id']).tenant_id is None


def _activate_invited_tenant(db_session):
    """The invited admin signs up and finishes the onboarding wizard."""
    from app.models.user import User
    from app.tests.conftest import _make_test_client

    admin = db_session.scalar(select(User).where(User.email == 'claire.dubois@residence-test.example'))
    admin.clerk_user_id = 'int-lead-admin'
    db_session.flush()
    tenant_admin = _make_test_client(db_session, 'int-lead-admin', 'network_admin')
    done = tenant_admin.post('/api/v1/tenant/onboarding/complete')
    assert done.status_code == 200 and done.json()['status'] == 'active'
    return tenant_admin


def test_tenant_activation_starts_the_pilot(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='demo_booked')
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    tenant_admin = _activate_invited_tenant(db_session)

    # The trial runs in the prospect's real workspace: active = pilot, not won.
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.PILOT and row.won_at is None
    last = _events(db_session, lead['id'])[-1]
    assert (last.type, last.from_status, last.to_status, last.actor_id) == (
        'tenant_activated', LeadStatus.INVITED, LeadStatus.PILOT, None,
    )
    # The pilot is dated: started now, planned to end 30 days later.
    assert row.invited_at is not None and row.pilot_started_at >= row.invited_at
    assert row.pilot_ends_at == shift_today() + timedelta(days=30)

    # Idempotent: finishing again writes nothing more and restarts no clock.
    count = len(_events(db_session, lead['id']))
    started = row.pilot_started_at
    assert tenant_admin.post('/api/v1/tenant/onboarding/complete').status_code == 200
    assert len(_events(db_session, lead['id'])) == count
    db_session.refresh(row)
    assert row.pilot_started_at == started


def test_owner_wins_the_lead_once_the_client_commits(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='demo_booked')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201

    # Invited but not set up yet: no pilot has run, so nothing is won —
    # through the route or through a PATCH.
    for early in (platform_admin_client.post(f'{url}/won'),
                  platform_admin_client.patch(url, json={'status': 'won'})):
        assert early.status_code == 409, early.text
        assert early.json()['detail']['code'] == 'lead.win_needs_pilot'
        assert early.json()['detail']['params'] == {'status': 'invited'}

    _activate_invited_tenant(db_session)

    # Marketing runs the pipeline but never closes the sale.
    operator, _user = _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-mk-win')
    operator.mfa_enabled = True
    db_session.flush()
    # (Not `_client_for`: its exit drops the session override the owner's
    # client still needs below.)
    from app.tests.conftest import _make_test_client
    marketing = _make_test_client(db_session, 'int-op-mk-win', 'platform_admin')
    assert marketing.patch(url, json={'status': 'won'}).status_code == 403
    assert marketing.post(f'{url}/won').status_code == 403
    assert marketing.patch(url, json={'next_action': 'Call back'}).status_code == 200
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.PILOT

    won = platform_admin_client.post(f'{url}/won')
    assert won.status_code == 200, won.text
    assert won.json()['status'] == 'won' and won.json()['won_at'] is not None
    last = _events(db_session, lead['id'])[-1]
    assert (last.type, last.from_status, last.to_status) == ('status_changed', LeadStatus.PILOT, LeadStatus.WON)
    assert platform_admin_client.get(f'{LEADS}/stats').json()['by_status']['won'] == 1

    # Terminal: a second « won » is a 409, and no stage takes it back.
    events = len(_events(db_session, lead['id']))
    assert platform_admin_client.post(f'{url}/won').status_code == 409
    assert platform_admin_client.patch(url, json={'status': 'pilot'}).status_code == 422
    assert len(_events(db_session, lead['id'])) == events


def test_won_needs_the_pilot_whatever_the_tenant_state(platform_admin_client, db_session, seed):
    """The v1.0 rule let any open stage be won once the tenant was active
    (`pilot -> contacted -> won` answered 200). `pilot` is the only door."""
    lead = _create(platform_admin_client, status='demo_booked')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    _activate_invited_tenant(db_session)

    assert platform_admin_client.patch(url, json={'status': 'contacted'}).status_code == 200
    for refused in (platform_admin_client.patch(url, json={'status': 'won'}),
                    platform_admin_client.post(f'{url}/won')):
        assert refused.status_code == 409
        assert refused.json()['detail']['code'] == 'lead.win_needs_pilot'
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.CONTACTED and row.won_at is None

    # A lost lead is not won either, and an unknown one is a 404.
    assert platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Went silent'}).status_code == 200
    assert platform_admin_client.post(f'{url}/won').status_code == 409
    assert platform_admin_client.post(f'{LEADS}/00000000-0000-0000-0000-000000000000/won').status_code == 404


def test_a_lead_returns_to_the_stage_its_tenant_is_at(platform_admin_client, db_session, seed):
    """The one manual way into `invited` / `pilot`: a lead with a tenant,
    put back where that tenant really is — a pilot closed as lost by mistake
    would otherwise never be winnable again."""
    lead = _create(platform_admin_client, status='demo_booked')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201

    # Tenant still pending: `invited` is its stage, `pilot` is not yet.
    assert platform_admin_client.patch(url, json={'status': 'contacted'}).status_code == 200
    early = platform_admin_client.patch(url, json={'status': 'pilot'})
    assert early.status_code == 422 and early.json()['detail']['code'] == 'lead.stage_set_by_system'
    assert platform_admin_client.patch(url, json={'status': 'invited'}).status_code == 200

    _activate_invited_tenant(db_session)
    assert platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Misclick'}).status_code == 200
    assert platform_admin_client.patch(url, json={'status': 'contacted'}).status_code == 200
    # Tenant active: `pilot` is its stage, `invited` no longer.
    stale = platform_admin_client.patch(url, json={'status': 'invited'})
    assert stale.status_code == 422 and stale.json()['detail']['code'] == 'lead.stage_set_by_system'
    back = platform_admin_client.patch(url, json={'status': 'pilot'})
    assert back.status_code == 200 and back.json()['status'] == 'pilot'
    assert platform_admin_client.post(f'{url}/won').status_code == 200

    # A suspended workspace is neither stage.
    other = _create(platform_admin_client, org_name='Autre Résidence', status='contacted')
    other_url = f"{LEADS}/{other['id']}"
    assert _invite(platform_admin_client, other['id'], slug='autre-residence',
                   admin_email='admin@autre-residence.example').status_code == 201
    from app.models.enums import TenantStatus
    from app.models.tenant import Tenant
    tenant = db_session.scalar(select(Tenant).where(Tenant.slug == 'autre-residence'))
    tenant.status = TenantStatus.SUSPENDED
    db_session.flush()
    assert platform_admin_client.patch(other_url, json={'status': 'contacted'}).status_code == 200
    for target in ('invited', 'pilot'):
        assert platform_admin_client.patch(other_url, json={'status': target}).status_code == 422


def test_a_failed_pilot_can_be_lost(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='contacted')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    _activate_invited_tenant(db_session)

    lost = platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Pilot dropped'})
    assert lost.status_code == 200 and lost.json()['status'] == 'lost'
    assert lost.json()['won_at'] is None


def test_activation_leaves_a_closed_lead_alone(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client, status='contacted')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    assert platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Went silent'}).status_code == 200
    _activate_invited_tenant(db_session)
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.LOST


def test_activation_without_a_lead_changes_nothing(apf_client, seed, db_session):
    from app.models.enums import TenantStatus

    seed.tenant.status = TenantStatus.ONBOARDING
    db_session.flush()
    assert apf_client.post('/api/v1/tenant/onboarding/complete').status_code == 200
    assert db_session.scalar(select(PlatformLead)) is None


# ── the pilot's timeline (spec v1.1) ─────────────────────────────────────────

def _pilot_lead(client, db_session, **overrides) -> tuple[str, PlatformLead]:
    """A lead taken through the real flow: invite, then the wizard."""
    lead = _create(client, status='demo_booked', **overrides)
    assert _invite(client, lead['id']).status_code == 201
    _activate_invited_tenant(db_session)
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    return f"{LEADS}/{lead['id']}", row


def test_pilot_end_is_edited_on_a_pilot_only(platform_admin_client, db_session, seed):
    other = _create(platform_admin_client, org_name='Pas en pilote', status='contacted')
    refused = platform_admin_client.patch(f"{LEADS}/{other['id']}", json={'pilot_ends_at': str(shift_today())})
    assert refused.status_code == 422 and refused.json()['detail']['code'] == 'lead.pilot_end_needs_pilot'

    url, row = _pilot_lead(platform_admin_client, db_session)
    later = shift_today() + timedelta(days=45)
    moved = platform_admin_client.patch(url, json={'pilot_ends_at': str(later)})
    assert moved.status_code == 200 and moved.json()['pilot_ends_at'] == str(later)

    before_start = platform_admin_client.patch(url, json={'pilot_ends_at': str(shift_today() - timedelta(days=1))})
    assert before_start.status_code == 422
    assert before_start.json()['detail']['code'] == 'lead.pilot_end_before_start'
    emptied = platform_admin_client.patch(url, json={'pilot_ends_at': None})
    assert emptied.status_code == 422 and emptied.json()['detail']['code'] == 'lead.field_required'
    db_session.refresh(row)
    assert row.pilot_ends_at == later


def test_a_reopened_pilot_keeps_its_dates(platform_admin_client, db_session, seed):
    url, row = _pilot_lead(platform_admin_client, db_session)
    started, ends = row.pilot_started_at, row.pilot_ends_at

    assert platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Misclick'}).status_code == 200
    assert platform_admin_client.patch(url, json={'status': 'contacted'}).status_code == 200
    assert platform_admin_client.patch(url, json={'status': 'pilot'}).status_code == 200
    db_session.refresh(row)
    assert (row.pilot_started_at, row.pilot_ends_at) == (started, ends)


def test_a_lead_lost_before_activation_gets_its_pilot_dated_on_return(platform_admin_client, db_session, seed):
    """Closed while invited, the activation leaves the lead alone. Reopened
    and put back in `pilot`, it takes the workspace's own activation date."""
    from app.models.tenant import Tenant

    lead = _create(platform_admin_client, status='contacted')
    url = f"{LEADS}/{lead['id']}"
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    assert platform_admin_client.patch(url, json={'status': 'lost', 'lost_reason': 'Went silent'}).status_code == 200
    _activate_invited_tenant(db_session)
    row = db_session.get(PlatformLead, lead['id'])
    db_session.refresh(row)
    assert row.status == LeadStatus.LOST and row.pilot_started_at is None

    assert platform_admin_client.patch(url, json={'status': 'contacted'}).status_code == 200
    assert platform_admin_client.patch(url, json={'status': 'pilot'}).status_code == 200
    db_session.refresh(row)
    tenant = db_session.get(Tenant, row.tenant_id)
    assert row.pilot_started_at == tenant.activated_at
    assert row.pilot_ends_at == shift_today() + timedelta(days=30)


def test_stats_measure_conversion_on_the_pilots(platform_admin_client, db_session, seed):
    """v1.1: won ÷ leads that reached the pilot — not ÷ leads contacted."""
    from datetime import datetime, timezone

    for name in ('Contactée 1', 'Contactée 2', 'Contactée 3'):
        _create(platform_admin_client, org_name=name, status='contacted')
    url, row = _pilot_lead(platform_admin_client, db_session)

    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert (stats['pilots_active'], stats['pilots_overdue']) == (1, 0)
    assert stats['conversion_rate'] == 0.0          # one pilot running, none won

    # The pilot's planned end has passed: time for the closing call.
    row.pilot_started_at = datetime.now(timezone.utc) - timedelta(days=40)
    row.pilot_ends_at = shift_today() - timedelta(days=10)
    db_session.flush()
    assert platform_admin_client.get(f'{LEADS}/stats').json()['pilots_overdue'] == 1

    assert platform_admin_client.post(f'{url}/won').status_code == 200
    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert stats['conversion_rate'] == 1.0          # 1 won ÷ 1 pilot reached, 3 contacted leads ignored
    assert (stats['pilots_active'], stats['pilots_overdue']) == (0, 0)
    assert stats['avg_pilot_days'] == 40.0

    # A second pilot that fails halves the rate: it reached the pilot too.
    other = _create(platform_admin_client, org_name='Autre Résidence', status='demo_booked')
    assert _invite(platform_admin_client, other['id'], slug='autre-residence',
                   admin_email='admin@autre-residence.example').status_code == 201
    other_row = db_session.get(PlatformLead, other['id'])
    other_row.status = LeadStatus.PILOT
    other_row.pilot_started_at = datetime.now(timezone.utc)
    db_session.flush()
    assert platform_admin_client.patch(
        f"{LEADS}/{other['id']}", json={'status': 'lost', 'lost_reason': 'Pilot dropped'},
    ).status_code == 200
    assert platform_admin_client.get(f'{LEADS}/stats').json()['conversion_rate'] == 0.5


def test_an_invitation_left_for_a_week_counts_as_late(platform_admin_client, db_session, seed):
    from datetime import datetime, timezone

    lead = _create(platform_admin_client, status='demo_booked')
    assert _invite(platform_admin_client, lead['id']).status_code == 201
    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert (stats['stale_invites'], stats['overdue_actions']) == (0, 0)

    row = db_session.get(PlatformLead, lead['id'])
    row.invited_at = datetime.now(timezone.utc) - timedelta(days=8)
    db_session.flush()
    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert (stats['stale_invites'], stats['overdue_actions']) == (1, 1)

    # Late on both counts is still one lead.
    row.next_action_at = shift_today() - timedelta(days=1)
    db_session.flush()
    assert platform_admin_client.get(f'{LEADS}/stats').json()['overdue_actions'] == 1

    # The wizard finished: the invitation is no longer waiting.
    row.next_action_at = None
    db_session.flush()
    _activate_invited_tenant(db_session)
    stats = platform_admin_client.get(f'{LEADS}/stats').json()
    assert (stats['stale_invites'], stats['overdue_actions']) == (0, 0)


# ── errors carry a code the bilingual screens translate ──────────────────────

def test_refusals_carry_a_code_and_their_values(platform_admin_client, seed):
    lead = _create(platform_admin_client, status='demo_booked', external_ref='L900')
    url = f"{LEADS}/{lead['id']}"

    def detail(res):
        body = res.json()['detail']
        return body['code'], body['params'], body['message']

    code, params, message = detail(platform_admin_client.patch(url, json={'status': 'lost'}))
    assert code == 'lead.lost_needs_reason' and message.startswith('A lost lead')

    code, params, _ = detail(platform_admin_client.patch(url, json={'org_name': None}))
    assert (code, params) == ('lead.field_required', {'field': 'org_name'})

    code, params, _ = detail(platform_admin_client.post(LEADS, json={**NEW_LEAD, 'external_ref': 'L900'}))
    assert (code, params) == ('lead.ref_exists', {'ref': 'L900'})

    code, params, _ = detail(_invite(platform_admin_client, lead['id'], slug=seed.tenant.slug))
    assert (code, params) == ('lead.slug_taken', {'slug': seed.tenant.slug})
    code, _, _ = detail(_invite(platform_admin_client, lead['id'], admin_email=seed.apf.email))
    assert code == 'lead.email_taken'

    missing = platform_admin_client.get(f'{LEADS}/00000000-0000-0000-0000-000000000000')
    assert missing.status_code == 404 and missing.json()['detail']['code'] == 'lead.not_found'


def test_import_refusals_carry_codes(platform_admin_client, seed):
    def upload(name, content):
        return platform_admin_client.post(f'{LEADS}/import', files={'file': (name, content, 'text/csv')})

    assert upload('leads.txt', b'x').json()['detail']['code'] == 'lead.import.bad_extension'
    assert upload('leads.csv', b'').json()['detail']['code'] == 'lead.import.empty'
    no_headers = upload('leads.csv', b'a;b\n1;2\n').json()['detail']
    assert no_headers['code'] == 'lead.import.missing_columns' and 'organisation' in no_headers['params']['columns']

    sheet = 'ID;Organisation;Segment;Prov.\nT1;Sans segment;;QC\nT2;Mauvais segment;Usines (QC);QC\n'
    result = upload('leads.csv', sheet.encode()).json()
    assert [(row['code'], row['params']) for row in result['skipped']] == [
        ('missing_segment', {}),
        ('unknown_segment', {'value': 'Usines (QC)'}),
    ]
    assert all(row['reason'] for row in result['skipped'])  # the English sentence stays


# ── deleting a lead (owner only) ─────────────────────────────────────────────

def test_owner_deletes_a_lead_with_its_feed(platform_admin_client, db_session):
    from app.models.platform_audit_log import PlatformAuditLog

    lead = _create(platform_admin_client, external_ref='L900')
    keep = _create(platform_admin_client, org_name='Stays')
    platform_admin_client.post(f"{LEADS}/{lead['id']}/events", json={'type': 'note', 'body': 'Test row'})
    assert len(_events(db_session, lead['id'])) == 2

    res = platform_admin_client.delete(f"{LEADS}/{lead['id']}")
    assert res.status_code == 204 and res.content == b''

    db_session.expire_all()
    assert db_session.get(PlatformLead, lead['id']) is None
    assert _events(db_session, lead['id']) == []
    assert platform_admin_client.get(f"{LEADS}/{lead['id']}").status_code == 404
    assert [row['id'] for row in platform_admin_client.get(LEADS).json()['items']] == [keep['id']]

    # The audit trail keeps what the pipeline no longer shows.
    audit = db_session.scalar(
        select(PlatformAuditLog).where(
            PlatformAuditLog.action == 'lead.deleted', PlatformAuditLog.target_id == lead['id'],
        )
    )
    assert audit is not None
    assert audit.payload['org_name'] == 'Résidence Test'
    assert audit.payload['external_ref'] == 'L900'
    assert audit.payload['event_count'] == 2

    # The reference is free again, and a second delete finds nothing.
    assert platform_admin_client.post(LEADS, json={**NEW_LEAD, 'external_ref': 'L900'}).status_code == 201
    assert platform_admin_client.delete(f"{LEADS}/{lead['id']}").status_code == 404


def test_delete_is_owner_only(platform_admin_client, db_session, seed):
    lead = _create(platform_admin_client)
    operator, _user = _add_operator(db_session, PlatformOperatorRole.MARKETING, clerk_sub='int-op-mk-delete')
    operator.mfa_enabled = True
    db_session.flush()
    with _client_for(db_session, 'int-op-mk-delete') as marketing:
        assert marketing.delete(f"{LEADS}/{lead['id']}").status_code == 403
    _add_operator(db_session, PlatformOperatorRole.OPERATOR, clerk_sub='int-op-op-delete')
    with _client_for(db_session, 'int-op-op-delete') as operator_client:
        assert operator_client.delete(f"{LEADS}/{lead['id']}").status_code == 403
    assert db_session.get(PlatformLead, lead['id']) is not None


def test_a_lead_with_a_workspace_is_kept_until_the_workspace_is_removed(platform_admin_client, db_session, seed):
    from app.models.enums import TenantStatus
    from app.models.tenant import Tenant

    lead = _create(platform_admin_client, status='contacted')
    assert _invite(platform_admin_client, lead['id']).status_code == 201

    refused = platform_admin_client.delete(f"{LEADS}/{lead['id']}")
    assert refused.status_code == 409
    detail = refused.json()['detail']
    assert detail['code'] == 'lead.delete_has_live_tenant'
    assert detail['params'] == {'name': 'Résidence Test'}
    assert db_session.get(PlatformLead, lead['id']) is not None

    tenant = db_session.scalar(select(Tenant).where(Tenant.slug == 'residence-test'))
    tenant.status = TenantStatus.REMOVED
    db_session.flush()

    assert platform_admin_client.delete(f"{LEADS}/{lead['id']}").status_code == 204
    db_session.expire_all()
    assert db_session.get(PlatformLead, lead['id']) is None
    # The workspace row is untouched by the lead's deletion.
    assert db_session.get(Tenant, tenant.id).status == TenantStatus.REMOVED
