"""Daily reminder of the leads whose next action is due.

« Follow-up » on a lead is manual: a next action and a date. Until now
nothing was sent — an operator who did not open /platform/leads never knew
a call was owed. Once a day, from ``settings.lead_reminder_hour_local``
(Toronto clock), the owner and the marketing operators get one email listing
the open leads whose next action is due today or earlier. A day with nothing
due sends nothing.

The day it ran is stamped on the ``platform_settings`` row *before* the
emails go out: at most one reminder a day, even when a deploy restarts the
container mid-morning. The price is that a failed send is not retried that
day (it is logged).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import shift_local_date
from app.models.enums import LeadStatus, PlatformOperatorRole
from app.models.platform_lead import PlatformLead
from app.models.platform_operator import PlatformOperator
from app.models.platform_settings import PlatformSettings
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.services.platform_settings_service import PlatformSettingsService

logger = logging.getLogger(__name__)

RECIPIENT_ROLES = (PlatformOperatorRole.OWNER, PlatformOperatorRole.MARKETING)
CLOSED_STATUSES = (LeadStatus.WON, LeadStatus.LOST)
# A long backlog is cut here; the email says how many are left and links to
# the list, which sorts by next action.
MAX_LISTED = 25

_MONTHS_FR = (
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
    'septembre', 'octobre', 'novembre', 'décembre',
)
_MONTHS_EN = (
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
)


def _day(value: date, lang: str) -> str:
    if lang == 'fr':
        number = '1er' if value.day == 1 else str(value.day)
        return f'{number} {_MONTHS_FR[value.month - 1]}'
    return f'{_MONTHS_EN[value.month - 1]} {value.day}'


def _portal_url() -> str:
    if settings.allowed_origins:
        return settings.allowed_origins[0].rstrip('/')
    return 'http://localhost:3000'


def _line(lead: PlatformLead, today: date, lang: str) -> str:
    late = (today - lead.next_action_at).days
    if lang == 'fr':
        action = lead.next_action or 'Suivi à faire'
        when = (
            f'prévu le {_day(lead.next_action_at, lang)}, '
            f'{late} jour{"s" if late > 1 else ""} de retard'
            if late else "prévu aujourd'hui"
        )
    else:
        action = lead.next_action or 'Follow-up'
        when = (
            f'due {_day(lead.next_action_at, lang)}, '
            f'{late} day{"s" if late > 1 else ""} late'
            if late else 'due today'
        )
    return (
        f'- {lead.org_name} — {action} ({when})\n'
        f'  {_portal_url()}/{lang}/platform/leads/{lead.id}\n'
    )


def _section(title: str, leads: list[PlatformLead], today: date, lang: str) -> str:
    if not leads:
        return ''
    return f'{title} ({len(leads)})\n' + ''.join(_line(lead, today, lang) for lead in leads) + '\n'


def render_body(first_name: str, leads: list[PlatformLead], total: int, today: date, lang: str) -> str:
    """Plain-text body in one language. ``leads`` is the listed slice, oldest
    due date first; ``total`` counts every due lead."""
    overdue = [lead for lead in leads if lead.next_action_at < today]
    due_today = [lead for lead in leads if lead.next_action_at == today]
    hidden = total - len(leads)
    list_url = f'{_portal_url()}/{lang}/platform/leads'
    if lang == 'fr':
        head = (
            f'Bonjour {first_name},\n\n'
            + ('1 suivi est à faire' if total == 1 else f'{total} suivis sont à faire')
            + ' dans le pipeline StaffiG.\n\n'
        )
        more = (
            f'… et {hidden} autre{"s" if hidden > 1 else ""}.\n\n' if hidden else ''
        )
        return (
            head
            + _section('EN RETARD', overdue, today, lang)
            + _section("AUJOURD'HUI", due_today, today, lang)
            + more
            + f'Tous les leads : {list_url}\n'
        )
    head = (
        f'Hello {first_name},\n\n'
        + ('1 follow-up is due' if total == 1 else f'{total} follow-ups are due')
        + ' in the StaffiG pipeline.\n\n'
    )
    more = f'… and {hidden} more.\n\n' if hidden else ''
    return (
        head
        + _section('OVERDUE', overdue, today, lang)
        + _section('TODAY', due_today, today, lang)
        + more
        + f'All leads: {list_url}\n'
    )


def render_subject(total: int, lang: str) -> str:
    if lang == 'fr':
        return 'StaffiG — 1 suivi à faire' if total == 1 else f'StaffiG — {total} suivis à faire'
    return 'StaffiG — 1 follow-up due' if total == 1 else f'StaffiG — {total} follow-ups due'


class LeadReminderService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def tick(self, now: datetime | None = None) -> dict:
        """Send today's reminder if it is time and it has not run yet.

        ``ran`` is True on the one tick of the day that did the work (even
        when nothing was due)."""
        now = now or datetime.now(timezone.utc)
        idle = {'ran': False, 'leads': 0, 'emailed': 0}
        today = shift_local_date(now)
        local_hour = now.astimezone(ZoneInfo(settings.shift_timezone)).hour
        if local_hour < settings.lead_reminder_hour_local:
            return idle

        PlatformSettingsService(self.db).get()  # creates the row if missing
        row = self.db.scalar(select(PlatformSettings).limit(1).with_for_update())
        if row.lead_reminder_sent_on is not None and row.lead_reminder_sent_on >= today:
            self.db.rollback()  # release the row lock
            return idle

        leads = list(self.db.scalars(
            select(PlatformLead)
            .where(
                PlatformLead.next_action_at <= today,
                PlatformLead.status.notin_(CLOSED_STATUSES),
            )
            .order_by(PlatformLead.next_action_at, PlatformLead.org_name)
        ))
        recipients = list(self.db.scalars(
            select(User)
            .join(PlatformOperator, PlatformOperator.user_id == User.id)
            .where(
                PlatformOperator.role.in_(RECIPIENT_ROLES),
                User.is_active.is_(True),
                # A pending operator has not signed up yet: the links would
                # lead to a sign-in they cannot pass.
                User.clerk_user_id.is_not(None),
            )
            .order_by(User.email)
        )) if leads else []
        # Everything the emails need is read before the commit below.
        messages = [self._message(user, leads, today) for user in recipients]

        row.lead_reminder_sent_on = today
        self.db.commit()

        emailed = 0
        mailer = EmailNotificationService()
        for message in messages:
            result = mailer.send(message)
            if result['delivery_status'] == 'sent':
                emailed += 1
            elif result['delivery_status'] == 'failed':
                logger.warning('Lead reminder not delivered to %s', message.to_email)
        return {'ran': True, 'leads': len(leads), 'emailed': emailed}

    @staticmethod
    def _message(user: User, leads: list[PlatformLead], today: date) -> EmailMessage:
        total = len(leads)
        listed = leads[:MAX_LISTED]
        return EmailMessage(
            to_email=user.email,
            subject=localized_subject(
                user.preferred_language, render_subject(total, 'fr'), render_subject(total, 'en'),
            ),
            body=localized(
                user.preferred_language,
                render_body(user.first_name, listed, total, today, 'fr'),
                render_body(user.first_name, listed, total, today, 'en'),
            ),
        )

