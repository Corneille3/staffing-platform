"""Outbound mail must be well-formed at the source.

We set Subject/From/To and nothing else, leaving Date and Message-ID to
whatever the relay decided to add. RFC 5322 makes Date mandatory, and a stable
Message-ID is what a mail client threads and de-duplicates on.
"""
import smtplib
from email.utils import parsedate_to_datetime

from app.core.config import settings
from app.notifications.email_service import EmailMessage, EmailNotificationService


class _FakeConn:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _send_and_capture(monkeypatch, **overrides) -> dict:
    monkeypatch.setattr(settings, 'smtp_host', 'smtp.test')
    monkeypatch.setattr(settings, 'smtp_port', 25)
    monkeypatch.setattr(settings, 'smtp_use_tls', False)
    monkeypatch.setattr(settings, 'smtp_from', 'noreply@staffig.kouamvision.com')
    monkeypatch.setattr(smtplib, 'SMTP', lambda *a, **k: _FakeConn())

    captured: dict = {}

    def fake_auth_and_send(conn, mime, envelope_from, to_email):
        captured['mime'] = mime
        captured['envelope_from'] = envelope_from

    monkeypatch.setattr(
        EmailNotificationService, '_auth_and_send', staticmethod(fake_auth_and_send)
    )
    message = EmailMessage(
        to_email=overrides.get('to_email', 'someone@example.org'),
        subject=overrides.get('subject', 'Sujet'),
        body=overrides.get('body', 'Corps'),
    )
    result = EmailNotificationService().send(message)
    captured['result'] = result
    return captured


def test_date_header_is_present_and_parseable(monkeypatch):
    mime = _send_and_capture(monkeypatch)['mime']
    assert mime['Date'], 'Date is mandatory per RFC 5322'
    # Must parse, not just be a non-empty string — a malformed Date is what
    # sorts a message to an unexpected place in the recipient's list.
    assert parsedate_to_datetime(mime['Date']) is not None


def test_message_id_uses_the_sending_domain(monkeypatch):
    mime = _send_and_capture(monkeypatch)['mime']
    assert mime['Message-ID'].startswith('<')
    assert mime['Message-ID'].rstrip('>').endswith('staffig.kouamvision.com')


def test_message_ids_are_unique_per_send(monkeypatch):
    first = _send_and_capture(monkeypatch)['mime']['Message-ID']
    second = _send_and_capture(monkeypatch)['mime']['Message-ID']
    # Two messages sharing an ID is precisely what makes a client collapse or
    # drop one of them.
    assert first != second


def test_existing_headers_are_untouched(monkeypatch):
    captured = _send_and_capture(monkeypatch, to_email='dest@example.org', subject='Hé ! Sujet')
    mime = captured['mime']
    assert mime['To'] == 'dest@example.org'
    assert 'Sujet' in str(mime['Subject'])
    assert mime['From'] == 'Staffig <noreply@staffig.kouamvision.com>'
    assert captured['envelope_from'] == 'noreply@staffig.kouamvision.com'
    assert captured['result']['delivery_status'] == 'sent'
