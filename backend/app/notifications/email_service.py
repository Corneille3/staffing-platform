from dataclasses import dataclass


@dataclass(slots=True)
class EmailMessage:
    to_email: str
    subject: str
    body: str


class EmailNotificationService:
    def send(self, message: EmailMessage) -> dict[str, str]:
        return {
            'channel': 'email',
            'delivery_status': 'queued',
            'recipient': message.to_email,
        }
