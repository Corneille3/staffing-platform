"""Daily reminder of due lead follow-ups (SPEC_PLATFORM_LEADS §14 « Rappel
des suivis »): who receives it, what it lists, and that it goes out once."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import delete, select, update

from app.core.config import settings
from app.models.enums import LeadStatus, PlatformOperatorRole
from app.models.platform_lead import PlatformLead
from app.models.platform_operator import PlatformOperator
from app.models.platform_settings import PlatformSettings
from app.notifications import email_service
from app.services.platform_lead_reminder import MAX_LISTED, LeadReminderService
from app.tests.test_platform_operators import _add_operator

TORONTO = ZoneInfo('America/Toronto')
# A Thursday, 08:05 in Toronto.
MORNING = datetime(2026, 11, 19, 8, 5, tzinfo=TORONTO)
TODAY = MORNING.date()


@pytest.fixture(autouse=True)
def _clean_slate(db_session, monkeypatch):
    """The suite runs against the dev database: start from no lead, no
    operator and no stamp (all inside the test's transaction). The suite's
    clock is UTC (conftest); the reminder is about Toronto mornings."""
    monkeypatch.setattr(settings, 'shift_timezone', 'America/Toronto')
    db_session.execute(delete(PlatformLead))
    db_session.execute(delete(PlatformOperator))
    db_session.execute(update(PlatformSettings).values(lead_reminder_sent_on=None))
    db_session.flush()


@pytest.fixture
def sent(monkeypatch) -> list:
    messages: list[email_service.EmailMessage] = []

    def fake_send(self, message):
        messages.append(message)
        return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', fake_send)
    return messages


def _lead(db_session, name: str, due_in_days: int | None, **fields) -> PlatformLead:
    lead = PlatformLead(
        id=uuid4(), org_name=name, segment='rpa_qc', province='QC',
        next_action=fields.pop('next_action', 'Rappeler la directrice'),
        next_action_at=None if due_in_days is None else TODAY + timedelta(days=due_in_days),
        **fields,
    )
    db_session.add(lead)
    db_session.flush()
    return lead


def _operator(db_session, role, language='fr', signed_up=True):
    _, user = _add_operator(db_session, role, clerk_sub=f'user_{uuid4().hex[:10]}' if signed_up else None)
    user.preferred_language = language
    user.first_name = 'Josy'
    db_session.flush()
    return user


def _stamp(db_session):
    db_session.expire_all()
    return db_session.scalar(select(PlatformSettings.lead_reminder_sent_on).limit(1))


def test_owner_and_marketing_get_the_due_leads_in_their_language(db_session, seed, sent):
    owner = _operator(db_session, PlatformOperatorRole.OWNER, 'fr')
    marketing = _operator(db_session, PlatformOperatorRole.MARKETING, 'en')
    _operator(db_session, PlatformOperatorRole.OPERATOR)
    _operator(db_session, PlatformOperatorRole.SUPPORT)
    _operator(db_session, PlatformOperatorRole.MARKETING, signed_up=False)
    late = _lead(db_session, 'Résidence Soleil', -3)
    today = _lead(db_session, 'CPE Les Lutins', 0, next_action=None)
    _lead(db_session, 'Demain inc.', 1)
    _lead(db_session, 'Sans date', None)
    _lead(db_session, 'Perdu inc.', -5, status=LeadStatus.LOST, lost_reason='test')
    _lead(db_session, 'Gagné inc.', -5, status=LeadStatus.WON)

    result = LeadReminderService(db_session).tick(MORNING)

    assert result == {'ran': True, 'leads': 2, 'emailed': 2}
    by_recipient = {message.to_email: message for message in sent}
    assert set(by_recipient) == {owner.email, marketing.email}

    fr = by_recipient[owner.email]
    assert fr.subject == 'StaffiG — 2 suivis à faire'
    assert 'Bonjour Josy,' in fr.body
    assert 'EN RETARD (1)' in fr.body and "AUJOURD'HUI (1)" in fr.body
    assert 'Résidence Soleil — Rappeler la directrice (prévu le 16 novembre, 3 jours de retard)' in fr.body
    assert "CPE Les Lutins — Suivi à faire (prévu aujourd'hui)" in fr.body
    assert f'/fr/platform/leads/{late.id}' in fr.body
    assert fr.body.index('Résidence Soleil') < fr.body.index('CPE Les Lutins')
    for absent in ('Demain inc.', 'Sans date', 'Perdu inc.', 'Gagné inc.', 'OVERDUE'):
        assert absent not in fr.body

    en = by_recipient[marketing.email]
    assert en.subject == 'StaffiG — 2 follow-ups due'
    assert 'Résidence Soleil — Rappeler la directrice (due November 16, 3 days late)' in en.body
    assert 'CPE Les Lutins — Follow-up (due today)' in en.body
    assert f'/en/platform/leads/{today.id}' in en.body
    assert 'EN RETARD' not in en.body

    assert _stamp(db_session) == TODAY


def test_it_goes_out_once_a_day(db_session, seed, sent):
    _operator(db_session, PlatformOperatorRole.OWNER)
    _lead(db_session, 'Résidence Soleil', -1)
    service = LeadReminderService(db_session)

    assert service.tick(MORNING)['ran'] is True
    assert service.tick(MORNING + timedelta(minutes=5))['ran'] is False
    assert service.tick(MORNING + timedelta(hours=9))['ran'] is False
    assert len(sent) == 1

    # The next morning the lead is still due: a new reminder.
    assert service.tick(MORNING + timedelta(days=1)) == {'ran': True, 'leads': 1, 'emailed': 1}
    assert '2 jours de retard' in sent[1].body


def test_nothing_before_the_hour_then_a_catch_up_later_in_the_day(db_session, seed, sent):
    _operator(db_session, PlatformOperatorRole.OWNER)
    _lead(db_session, 'Résidence Soleil', 0)
    service = LeadReminderService(db_session)

    assert service.tick(MORNING.replace(hour=7, minute=55))['ran'] is False
    assert sent == [] and _stamp(db_session) is None

    # The API was down all morning (RDS stopped): the first tick catches up.
    assert service.tick(MORNING.replace(hour=15))['ran'] is True
    assert len(sent) == 1


def test_a_day_with_nothing_due_sends_nothing(db_session, seed, sent):
    _operator(db_session, PlatformOperatorRole.OWNER)
    _lead(db_session, 'Demain inc.', 1)
    service = LeadReminderService(db_session)

    assert service.tick(MORNING) == {'ran': True, 'leads': 0, 'emailed': 0}
    assert sent == []
    # Stamped all the same: a date typed at 14:00 waits for tomorrow's email.
    assert _stamp(db_session) == TODAY
    _lead(db_session, 'Ajouté à 14 h', 0)
    assert service.tick(MORNING.replace(hour=14))['ran'] is False
    assert sent == []


def test_the_local_day_is_torontos_not_utc(db_session, seed, sent):
    _operator(db_session, PlatformOperatorRole.OWNER)
    _lead(db_session, 'Résidence Soleil', 0)
    # 01:30 UTC on the 20th is still 20:30 on the 19th in Toronto.
    evening = datetime(2026, 11, 20, 1, 30, tzinfo=timezone.utc)

    assert LeadReminderService(db_session).tick(evening)['ran'] is True
    assert "prévu aujourd'hui" in sent[0].body
    assert _stamp(db_session) == TODAY


def test_a_long_backlog_is_cut_and_a_bilingual_reader_gets_both(db_session, seed, sent):
    _operator(db_session, PlatformOperatorRole.OWNER, 'bilingual')
    for index in range(MAX_LISTED + 3):
        _lead(db_session, f'Lead {index:02d}', -1)

    LeadReminderService(db_session).tick(MORNING)

    message = sent[0]
    total = MAX_LISTED + 3
    assert message.subject == f'StaffiG — {total} suivis à faire / StaffiG — {total} follow-ups due'
    assert '… et 3 autres.' in message.body and '… and 3 more.' in message.body
    assert message.body.count('/fr/platform/leads/') == MAX_LISTED
    assert f'EN RETARD ({MAX_LISTED})' in message.body


def test_a_failed_delivery_is_not_retried_that_day(db_session, seed, monkeypatch):
    _operator(db_session, PlatformOperatorRole.OWNER)
    _lead(db_session, 'Résidence Soleil', -1)
    attempts = []

    def failing_send(self, message):
        attempts.append(message.to_email)
        return {'channel': 'email', 'delivery_status': 'failed', 'recipient': message.to_email}

    monkeypatch.setattr(email_service.EmailNotificationService, 'send', failing_send)
    service = LeadReminderService(db_session)

    assert service.tick(MORNING) == {'ran': True, 'leads': 1, 'emailed': 0}
    assert service.tick(MORNING + timedelta(minutes=5))['ran'] is False
    assert len(attempts) == 1


def test_setting_hour_is_eight(db_session):
    assert settings.lead_reminder_hour_local == 8
