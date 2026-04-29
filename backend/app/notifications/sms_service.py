class SmsNotificationService:
    def send(self, phone_number: str, message: str) -> dict[str, str]:
        return {
            'channel': 'sms',
            'delivery_status': 'not_configured',
            'phone_number': phone_number,
            'message': message,
        }
