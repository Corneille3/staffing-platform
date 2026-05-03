import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


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

        try:
            mime = MIMEMultipart('alternative')
            mime['Subject'] = message.subject
            mime['From'] = settings.smtp_from
            mime['To'] = message.to_email
            mime.attach(MIMEText(message.body, 'plain', 'utf-8'))

            if settings.smtp_use_tls:
                ctx = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx) as conn:
                    self._auth_and_send(conn, mime, message.to_email)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as conn:
                    self._auth_and_send(conn, mime, message.to_email)

            logger.info('Email sent to %s: %s', message.to_email, message.subject)
            return {'channel': 'email', 'delivery_status': 'sent', 'recipient': message.to_email}

        except Exception:
            logger.exception('Failed to send email to %s: %s', message.to_email, message.subject)
            return {'channel': 'email', 'delivery_status': 'failed', 'recipient': message.to_email}

    @staticmethod
    def _auth_and_send(conn: smtplib.SMTP, mime: MIMEMultipart, to_email: str) -> None:
        if settings.smtp_username and settings.smtp_password:
            conn.login(settings.smtp_username, settings.smtp_password)
        conn.sendmail(settings.smtp_from, [to_email], mime.as_string())
