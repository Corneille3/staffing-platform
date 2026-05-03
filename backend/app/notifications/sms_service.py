import logging

logger = logging.getLogger(__name__)


class SmsNotificationService:
    def send(self, phone_number: str, message: str) -> dict[str, str]:
        # SMS provider (Twilio / SNS) not yet configured.
        # Log the would-be message so it's visible in dev without silently dropping it.
        logger.info('SMS stub — to=%s body=%s', phone_number, message[:120])
        return {'channel': 'sms', 'delivery_status': 'not_configured', 'phone_number': phone_number}
