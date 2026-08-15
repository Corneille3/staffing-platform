"""Tenant creation was the last write path storing a raw phone.

Worker, coordinator and APF bulk invites all normalize to E.164 at the schema
boundary. Creating a network did not — it only `.strip()`ed. Since inbound SMS
matches on exact string equality (`User.phone == normalized`), a network admin
typed as `(514) 555-0002` could never be resolved from their own number, so
their STOP would silently fail to opt them out.
"""
from uuid import uuid4

from sqlalchemy import select

from app.models.user import User


def _payload(**overrides) -> dict:
    suffix = uuid4().hex[:8]
    base = {
        'name': f'Réseau {suffix}',
        'slug': f'reseau-{suffix}',
        'admin_first_name': 'Alice',
        'admin_last_name': 'Owner',
        'admin_email': f'alice-{suffix}@example.org',
        'admin_phone': '(514) 555-0002',
        'admin_preferred_language': 'fr',
    }
    base.update(overrides)
    return base


def test_network_admin_phone_is_stored_e164(platform_admin_client, db_session):
    payload = _payload()
    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 201, resp.text

    admin = db_session.scalar(select(User).where(User.email == payload['admin_email']))
    assert admin is not None
    assert admin.phone == '+15145550002'


def test_network_admin_phone_is_findable_by_inbound_sms(platform_admin_client, db_session):
    """The whole point: a text from that number resolves to this person."""
    from app.services.inbound_sms_service import InboundSmsService

    payload = _payload(admin_phone='514-555-0003')
    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 201, resp.text

    # Twilio delivers strict E.164; before this fix the stored value was
    # "514-555-0003" and this lookup returned None.
    found = InboundSmsService(db_session)._user_by_phone('+15145550003')
    assert found is not None
    assert found.email == payload['admin_email']


def test_blank_phone_stays_null(platform_admin_client, db_session):
    payload = _payload(admin_phone='   ')
    resp = platform_admin_client.post('/api/v1/networks', json=payload)
    assert resp.status_code == 201, resp.text

    admin = db_session.scalar(select(User).where(User.email == payload['admin_email']))
    assert admin.phone is None
