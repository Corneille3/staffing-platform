"""Daily reminder of what the sales pipeline is waiting on.

« Follow-up » on a lead is manual: a next action and a date. Until now
nothing was sent — an operator who did not open /platform/leads never knew
a call was owed. Once a day, from ``settings.lead_reminder_hour_local``
(Toronto clock), the owner and the marketing operators get one email listing
the open leads whose next action is due today or earlier — and, since the
pipeline follows the pilot's dates (spec v1.1), the two delays that need no
next action to exist: a pilot past its planned end (a closing call is owed)
and an invitation the admin has not acted on for a week. A day with nothing
to report sends nothing.

The day it ran is stamped on the ``platform_settings`` row *before* the
emails go out: at most one reminder a day, even when a deploy restarts the
container mid-morning. The price is that a failed send is not retried that
day (it is logged).
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
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
from app.services.platform_lead_service import STALE_INVITE_DAYS
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


def _days(count: int, lang: str) -> str:
    if lang == 'fr':
        return f'{count} jour{"s" if count > 1 else ""}'
    return f'{count} day{"s" if count > 1 else ""}'


def _pilot_line(lead: PlatformLead, today: date, lang: str) -> str:
    late = (today - lead.pilot_ends_at).days
    if lang == 'fr':
        text = (
            f'fin de pilote prévue le {_day(lead.pilot_ends_at, lang)}, '
            f'échu depuis {_days(late, lang)} — appel de clôture à faire'
        )
    else:
        text = (
            f'pilot due to end {_day(lead.pilot_ends_at, lang)}, '
            f'{_days(late, lang)} past its end — closing call due'
        )
    return f'- {lead.org_name} — {text}\n  {_portal_url()}/{lang}/platform/leads/{lead.id}\n'


def _invite_line(lead: PlatformLead, today: date, lang: str) -> str:
    invited = shift_local_date(lead.invited_at)
    waiting = (today - invited).days
    if lang == 'fr':
        text = (
            f'invité le {_day(invited, lang)}, sans suite depuis {_days(waiting, lang)} '
            "— l'admin n'a pas terminé la configuration"
        )
    else:
        text = (
            f'invited {_day(invited, lang)}, no follow-up for {_days(waiting, lang)} '
            '— the admin has not finished the setup'
        )
    return f'- {lead.org_name} — {text}\n  {_portal_url()}/{lang}/platform/leads/{lead.id}\n'


def _extra_section(title: str, leads: list[PlatformLead], line, today: date, lang: str) -> str:
    if not leads:
        return ''
    return f'{title} ({len(leads)})\n' + ''.join(line(lead, today, lang) for lead in leads) + '\n'


def render_body(
    first_name: str, leads: list[PlatformLead], total: int, today: date, lang: str,
    pilots: list[PlatformLead] | None = None, invites: list[PlatformLead] | None = None,
    items: int | None = None,
) -> str:
    """Plain-text body in one language. ``leads`` is the listed slice of the
    due follow-ups, oldest due date first; ``total`` counts every due lead.
    ``pilots`` (past their planned end) and ``invites`` (left for a week)
    come first — they are the ones no next-action date announces. ``items``
    is the number of leads the email is about, all sections together."""
    pilots = pilots or []
    invites = invites or []
    overdue = [lead for lead in leads if lead.next_action_at < today]
    due_today = [lead for lead in leads if lead.next_action_at == today]
    hidden = total - len(leads)
    list_url = f'{_portal_url()}/{lang}/platform/leads'
    # With follow-ups only, the email reads exactly as it always has.
    mixed = bool(pilots or invites)
    count = items if items is not None else total
    if lang == 'fr':
        if mixed:
            summary = (
                '1 point demande votre attention' if count == 1
                else f'{count} points demandent votre attention'
            )
        else:
            summary = '1 suivi est à faire' if total == 1 else f'{total} suivis sont à faire'
        head = f'Bonjour {first_name},\n\n{summary} dans le pipeline StaffiG.\n\n'
        more = (
            f'… et {hidden} autre{"s" if hidden > 1 else ""}.\n\n' if hidden else ''
        )
        return (
            head
            + _extra_section('PILOTES ÉCHUS', pilots, _pilot_line, today, lang)
            + _extra_section('INVITATIONS SANS SUITE', invites, _invite_line, today, lang)
            + _section('EN RETARD', overdue, today, lang)
            + _section("AUJOURD'HUI", due_today, today, lang)
            + more
            + f'Tous les leads : {list_url}\n'
        )
    if mixed:
        summary = '1 item needs your attention' if count == 1 else f'{count} items need your attention'
    else:
        summary = '1 follow-up is due' if total == 1 else f'{total} follow-ups are due'
    head = f'Hello {first_name},\n\n{summary} in the StaffiG pipeline.\n\n'
    more = f'… and {hidden} more.\n\n' if hidden else ''
    return (
        head
        + _extra_section('PILOTS PAST THEIR END', pilots, _pilot_line, today, lang)
        + _extra_section('INVITATIONS WITHOUT FOLLOW-UP', invites, _invite_line, today, lang)
        + _section('OVERDUE', overdue, today, lang)
        + _section('TODAY', due_today, today, lang)
        + more
        + f'All leads: {list_url}\n'
    )


def render_subject(total: int, lang: str, mixed: bool = False) -> str:
    """``total`` follow-ups — or, when ``mixed``, every lead the email is
    about (a pilot or an invitation is not a « follow-up »)."""
    if mixed:
        if lang == 'fr':
            return 'StaffiG — 1 point à traiter' if total == 1 else f'StaffiG — {total} points à traiter'
        return 'StaffiG — 1 item needs attention' if total == 1 else f'StaffiG — {total} items need attention'
    if lang == 'fr':
        return 'StaffiG — 1 suivi à faire' if total == 1 else f'StaffiG — {total} suivis à faire'
    return 'StaffiG — 1 follow-up due' if total == 1 else f'StaffiG — {total} follow-ups due'


class LeadReminderService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def tick(self, now: datetime | None = None) -> dict:
        """Send today's reminder if it is time and it has not run yet.

        ``ran`` is True on the one tick of the day that did the work (even
        when nothing was due). ``leads`` counts the due follow-ups, ``pilots``
        the pilots past their end, ``invites`` the invitations left a week."""
        now = now or datetime.now(timezone.utc)
        idle = {'ran': False, 'leads': 0, 'pilots': 0, 'invites': 0, 'emailed': 0}
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
        # The two delays no next-action date announces (spec v1.1 §4).
        pilots = list(self.db.scalars(
            select(PlatformLead)
            .where(PlatformLead.status == LeadStatus.PILOT, PlatformLead.pilot_ends_at < today)
            .order_by(PlatformLead.pilot_ends_at, PlatformLead.org_name)
        ))
        invites = list(self.db.scalars(
            select(PlatformLead)
            .where(
                PlatformLead.status == LeadStatus.INVITED,
                PlatformLead.invited_at < now - timedelta(days=STALE_INVITE_DAYS),
            )
            .order_by(PlatformLead.invited_at, PlatformLead.org_name)
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
        )) if (leads or pilots or invites) else []
        # Everything the emails need is read before the commit below.
        messages = [self._message(user, leads, today, pilots, invites) for user in recipients]

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
        return {
            'ran': True, 'leads': len(leads), 'pilots': len(pilots), 'invites': len(invites),
            'emailed': emailed,
        }

    @staticmethod
    def _message(
        user: User, leads: list[PlatformLead], today: date,
        pilots: list[PlatformLead], invites: list[PlatformLead],
    ) -> EmailMessage:
        total = len(leads)
        listed = leads[:MAX_LISTED]
        mixed = bool(pilots or invites)
        # A lead late on its next action AND past its pilot end is one lead.
        items = len({lead.id for lead in (*leads, *pilots, *invites)})
        subject_count = items if mixed else total

        def body(lang: str) -> str:
            return render_body(user.first_name, listed, total, today, lang, pilots, invites, items)

        return EmailMessage(
            to_email=user.email,
            subject=localized_subject(
                user.preferred_language,
                render_subject(subject_count, 'fr', mixed), render_subject(subject_count, 'en', mixed),
            ),
            body=localized(user.preferred_language, body('fr'), body('en')),
        )

