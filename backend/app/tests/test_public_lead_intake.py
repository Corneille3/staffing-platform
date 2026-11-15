"""Public lead intake — SPEC_PLATFORM_LEADS §11, criterion 6 (as amended by
§14): a demo request from a marketing site becomes a `website_form` lead; the
6th request in an hour from one visitor is refused. No Clerk identity: the
caller is a site's server route holding the shared secret."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.api.deps import get_db_session
from app.api.v1.public_leads import intake_limiter
from app.core.config import settings
from app.main import app
from app.models.enums import LeadStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent

INTAKE = '/api/v1/public/leads/intake'
SECRET = 'test-intake-secret'
FORM = {
    'org_name': 'CPE Les Petits Pas',
    'email': 'Direction@PetitsPas.example',
    'contact_name': 'Julie Martin',
    'phone': '514 555-0199',
    'segment': 'cpe_qc',
    'language': 'fr',
    'notes': 'Type of organization: CPE / daycare',
    'site': 'kouamvision.com',
}


@pytest.fixture
def site(db_session, monkeypatch):
    """A marketing site's server: no Authorization header, just the secret."""
    monkeypatch.setattr(settings, 'leads_intake_secret', SECRET)
    intake_limiter.reset()
    db_session.execute(delete(PlatformLead))
    db_session.flush()

    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    yield TestClient(app, headers={'X-Intake-Secret': SECRET, 'X-Visitor-IP': '203.0.113.7'})
    app.dependency_overrides.pop(get_db_session, None)
    intake_limiter.reset()


def _leads(db_session) -> list[PlatformLead]:
    return list(db_session.scalars(select(PlatformLead).order_by(PlatformLead.created_at)))


def test_form_creates_a_website_lead(site, db_session):
    res = site.post(INTAKE, json=FORM)
    assert res.status_code == 201, res.text
    assert res.json() == {'status': 'received'}  # nothing about the lead leaks back

    (lead,) = _leads(db_session)
    assert lead.org_name == 'CPE Les Petits Pas'
    assert lead.email == 'direction@petitspas.example'
    assert (lead.status, lead.source, lead.source_detail) == (LeadStatus.NEW, 'website_form', 'kouamvision.com')
    assert (lead.segment, lead.province, lead.language) == ('cpe_qc', 'QC', 'fr')
    assert lead.created_by is None and lead.kind == 'prospect'

    (event,) = db_session.scalars(select(PlatformLeadEvent).where(PlatformLeadEvent.lead_id == lead.id))
    assert (event.type, event.actor_id, event.to_status) == ('form_submitted', None, LeadStatus.NEW)
    assert event.body == 'kouamvision.com — Type of organization: CPE / daycare'


def test_minimal_form_gets_the_defaults(site, db_session):
    res = site.post(INTAKE, json={'org_name': 'Acme', 'email': 'a@acme.example'})
    assert res.status_code == 201, res.text
    (lead,) = _leads(db_session)
    assert (lead.segment, lead.province, lead.language, lead.source_detail) == ('other', 'QC', 'fr', None)


def test_same_email_twice_is_one_lead_with_two_events(site, db_session):
    assert site.post(INTAKE, json=FORM).status_code == 201
    again = site.post(INTAKE, json={**FORM, 'org_name': 'Renamed', 'notes': 'Second request'})
    assert again.status_code == 201

    (lead,) = _leads(db_session)
    assert lead.org_name == 'CPE Les Petits Pas'  # the operator's row is not rewritten
    events = list(db_session.scalars(
        select(PlatformLeadEvent).where(PlatformLeadEvent.lead_id == lead.id)
        .order_by(PlatformLeadEvent.created_at)
    ))
    assert [e.type for e in events] == ['form_submitted', 'form_submitted']
    assert events[1].body == 'kouamvision.com — Second request'

    # Once that lead is closed, a new request is a new prospect.
    lead.status = LeadStatus.LOST
    lead.lost_reason = 'No budget'
    db_session.flush()
    assert site.post(INTAKE, json=FORM).status_code == 201
    assert len(_leads(db_session)) == 2


def test_sixth_request_in_an_hour_from_one_visitor_is_refused(site, db_session):
    for n in range(5):
        res = site.post(INTAKE, json={**FORM, 'email': f'v{n}@petitspas.example'})
        assert res.status_code == 201, res.text
    blocked = site.post(INTAKE, json={**FORM, 'email': 'v5@petitspas.example'})
    assert blocked.status_code == 429
    assert len(_leads(db_session)) == 5

    # Another visitor is not affected.
    other = site.post(INTAKE, json={**FORM, 'email': 'other@petitspas.example'},
                      headers={'X-Visitor-IP': '198.51.100.9'})
    assert other.status_code == 201


def test_secret_is_required(site, db_session):
    anonymous = TestClient(app)
    assert anonymous.post(INTAKE, json=FORM).status_code == 403
    assert anonymous.post(INTAKE, json=FORM, headers={'X-Intake-Secret': 'wrong'}).status_code == 403
    assert _leads(db_session) == []


def test_route_does_not_exist_without_a_configured_secret(site, db_session, monkeypatch):
    monkeypatch.setattr(settings, 'leads_intake_secret', '')
    assert site.post(INTAKE, json=FORM).status_code == 404
    assert TestClient(app).post(INTAKE, json=FORM, headers={'X-Intake-Secret': ''}).status_code == 404
    assert _leads(db_session) == []


@pytest.mark.parametrize('bad', [
    {'email': 'not-an-email'},
    {'org_name': ''},
    {'segment': 'spaceships'},
    {'province': 'Quebec'},
    {'notes': 'x' * 5001},
    {'site': 'Evil Site/../'},
    {'status': 'won'},            # only the listed fields are accepted
    {'score': 10},
    {'tenant_id': '00000000-0000-0000-0000-000000000000'},
])
def test_strict_validation(site, db_session, bad):
    assert site.post(INTAKE, json={**FORM, **bad}).status_code == 422
    assert _leads(db_session) == []


def test_the_pipeline_itself_stays_closed_to_the_secret(site, monkeypatch):
    """The secret opens the intake, nothing else. (The local stack lets a
    token-less call through as the dev user; production never does.)"""
    monkeypatch.setattr(settings, 'dev_auth_bypass', False)
    assert site.get('/api/v1/platform/leads').status_code == 401
    assert site.post('/api/v1/platform/leads', json=FORM).status_code == 401


def test_new_website_requests_are_counted_and_filterable(site, db_session, platform_admin_client):
    """The list sorts a form lead last (no next action, no score): the stats
    flag it and `source` filters it, until someone picks it up."""
    assert site.post(INTAKE, json=FORM).status_code == 201
    assert site.post(INTAKE, json={**FORM, 'email': 'second@petitspas.example', 'org_name': 'Second'}).status_code == 201
    hand_made = platform_admin_client.post(
        '/api/v1/platform/leads', json={'org_name': 'Hand made', 'segment': 'other', 'province': 'QC'},
    )
    assert hand_made.status_code == 201

    leads = '/api/v1/platform/leads'
    assert platform_admin_client.get(f'{leads}/stats').json()['new_website_requests'] == 2
    listed = platform_admin_client.get(leads, params={'source': 'website_form', 'status': 'new'}).json()
    assert listed['total'] == 2
    assert {row['org_name'] for row in listed['items']} == {'CPE Les Petits Pas', 'Second'}
    assert platform_admin_client.get(leads, params={'source': 'spaceships'}).status_code == 422

    # Picked up: it leaves the count.
    first = next(row for row in listed['items'] if row['org_name'] == 'Second')
    moved = platform_admin_client.patch(f"{leads}/{first['id']}", json={'status': 'contacted'})
    assert moved.status_code == 200
    assert platform_admin_client.get(f'{leads}/stats').json()['new_website_requests'] == 1
