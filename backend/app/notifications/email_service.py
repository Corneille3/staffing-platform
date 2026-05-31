import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, parseaddr

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_FROM_NAME = 'Staffig'


def _from_parts() -> tuple[str, str]:
    """Split ``settings.smtp_from`` into (header_value, envelope_address).

    E2E bug #3: in prod ``smtp_from`` is a bare address, so emails arrived with
    no friendly sender name. We always present a display name on the ``From``
    header, while the SMTP envelope sender must stay the bare address (a
    ``"Name <addr>"`` string is invalid as the MAIL FROM argument).
    """
    name, address = parseaddr(settings.smtp_from)
    address = address or settings.smtp_from
    header = formataddr((name or DEFAULT_FROM_NAME, address))
    return header, address


@dataclass(slots=True)
class EmailMessage:
    to_email: str
    subject: str
    body: str


class EmailNotificationService:
    def send(self, message: EmailMessage) -> dict[str, str]:
        if not settings.smtp_host:
            logger.info('SMTP not configured — skipping email to %s: %s', message.to_email, message.subject)
            return {'channel': 'email', 'delivery_status': 'skipped', 'recipient': message.to_email}

        from_header, envelope_from = _from_parts()
        try:
            mime = MIMEMultipart('alternative')
            mime['Subject'] = message.subject
            mime['From'] = from_header
            mime['To'] = message.to_email
            mime.attach(MIMEText(message.body, 'plain', 'utf-8'))

            if settings.smtp_use_tls:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx) as conn:
                    self._auth_and_send(conn, mime, envelope_from, message.to_email)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as conn:
                    self._auth_and_send(conn, mime, envelope_from, message.to_email)

            logger.info('Email sent to %s: %s', message.to_email, message.subject)
            return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

        except Exception:
            logger.exception('Failed to send email to %s: %s', message.to_email, message.subject)
            return {'channel': 'email', 'delivery_status': 'failed', 'recipient': message.to_email}

    @staticmethod
    def _auth_and_send(conn: smtplib.SMTP, mime: MIMEMultipart, envelope_from: str, to_email: str) -> None:
        if settings.smtp_username and settings.smtp_password:
            conn.login(settings.smtp_username, settings.smtp_password)
        conn.sendmail(envelope_from, [to_email], mime.as_string())
