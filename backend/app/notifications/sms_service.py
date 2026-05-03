import logging
from base64 import b64encode

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_TWILIO_API = 'https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json'


class SmsNotificationService:
    def send(self, phone_number: str, body: str) -> dict[str, str]:
        if not settings.twilio_account_sid:
            logger.info('SMS not configured — skipping to %s', phone_number)
            return {'channel': 'sms', 'delivery_status': 'skipped', 'phone_number': phone_number}

        url = _TWILIO_API.format(sid=settings.twilio_account_sid)
        credentials = b64encode(
            f'{settings.twilio_account_sid}:{settings.twilio_auth_token}'.encode()
        ).decode()

        try:
            resp = httpx.post(
                url,
                headers={'Authorization': f'Basic {credentials}'},
                data={
                    'From': settings.twilio_from_number,
                    'To': phone_number,
                    'Body': body[:1600],
                },
                timeout=10,
            )
            resp.raise_for_status()
            sid = resp.json().get('sid', '')
            logger.info('SMS sent to %s sid=%s', phone_number, sid)
            return {'channel': 'sms', 'delivery_status': 'sent', 'phone_number': phone_number, 'sid': sid}
        except Exception:
            logger.exception('Failed to send SMS to %s', phone_number)
            return {'channel': 'sms', 'delivery_status': 'failed', 'phone_number': phone_number}
