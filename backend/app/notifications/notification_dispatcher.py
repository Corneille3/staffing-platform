import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import shift_start_utc
from app.models.enums import SELF_SERVE_ORIGINS, ReplacementPolicy, ResponseStatus
from app.models.organization import Organization
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized
from app.notifications.sms_service import SmsNotificationService
from app.notifications.web_push_service import WebPushService

logger = logging.getLogger(__name__)


def _fmt_time(t) -> str:
    if not t:
        return ''
    if hasattr(t, 'strftime'):
        return t.strftime('%H:%M')
    return str(t)[:5]


def _org_name(db: Session, request: StaffingRequest) -> str:
    org = db.get(Organization, request.organization_id)
    return org.name if org else str(request.organization_id)


# ── email bodies (bilingual, full detail) ─────────────────────────────────────

def _body_new_request(worker: User, request: StaffingRequest, org_name: str) -> str:
    location = f'{request.location_name}, {request.city}' if request.location_name else request.city
    start = _fmt_time(request.start_time)
    end = _fmt_time(request.end_time)
    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Une nouvelle demande de remplacement est disponible.\n\n'
        f'Titre       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Heure       : {start} – {end}\n'
        f'Lieu        : {location}\n'
        f'Organisation: {org_name}\n\n'
        f'Connectez-vous à la plateforme Staffig pour accepter ou refuser cette demande.\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'A new coverage request is available.\n\n'
        f'Title       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Time        : {start} – {end}\n'
        f'Location    : {location}\n'
        f'Organization: {org_name}\n\n'
        f'Sign in to the Staffig platform to accept or decline this request.\n'
    )


def _body_assignment_confirmed(worker: User, request: StaffingRequest, org_name: str) -> str:
    location = f'{request.location_name}, {request.city}' if request.location_name else request.city
    start = _fmt_time(request.start_time)
    end = _fmt_time(request.end_time)
    contact_line = ''
    if request.contact_name:
        parts = [request.contact_name]
        if request.contact_phone:
            parts.append(request.contact_phone)
        if request.contact_email:
            parts.append(request.contact_email)
        contact_line = f'Contact     : {" · ".join(parts)}\n'
    arrival_line = f'Arrivée     : {request.arrival_instructions}\n' if request.arrival_instructions else ''

    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Votre affectation a été confirmée.\n\n'
        f'Titre       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Heure       : {start} – {end}\n'
        f'Lieu        : {location}\n'
        f'Organisation: {org_name}\n'
        f'{contact_line}'
        f'{arrival_line}'
        f'\nBonne journée !\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'Your assignment has been confirmed.\n\n'
        f'Title       : {request.title}\n'
        f'Date        : {request.work_date}\n'
        f'Time        : {start} – {end}\n'
        f'Location    : {location}\n'
        f'Organization: {org_name}\n'
        f'{contact_line}'
        f'{arrival_line}'
        f'\nHave a great day!\n'
    )


def _body_assignment_cancelled(worker: User, request: StaffingRequest) -> str:
    return (
        f'Bonjour {worker.first_name},\n\n'
        f'Votre affectation pour « {request.title} » le {request.work_date} a été annulée.\n\n'
        f'Connectez-vous à la plateforme Staffig pour voir les demandes disponibles.\n'
        f'\n---\n\n'
        f'Hello {worker.first_name},\n\n'
        f'Your assignment for "{request.title}" on {request.work_date} has been cancelled.\n\n'
        f'Sign in to the Staffig platform to browse available requests.\n'
    )


# ── SMS bodies (short, ≤160 chars per segment) ────────────────────────────────
# Stick to GSM-7 characters (é à è ç are fine; — î ô are NOT): one non-GSM char
# silently re-encodes the whole message as UCS-2 — 70 chars/segment instead of
# 160 — and the per-text price doubles or triples. Hence plain hyphens here.

def _sms_new_request(worker: User, request: StaffingRequest, claim_hint: str = '') -> str:
    start = _fmt_time(request.start_time)
    call_to_action = claim_hint or 'Connectez-vous / Sign in to respond.'
    return (
        f'[Staffig] {worker.first_name}: nouveau remplacement / new coverage - '
        f'{request.title} le/on {request.work_date} à/at {start} ({request.city}). '
        f'{call_to_action}'
    )


def _sms_assignment_confirmed(worker: User, request: StaffingRequest) -> str:
    start = _fmt_time(request.start_time)
    contact = f' Contact: {request.contact_name}' if request.contact_name else ''
    return (
        f'[Staffig] {worker.first_name}: affectation confirmée / assignment confirmed - '
        f'{request.title} {request.work_date} {start} ({request.city}).{contact}'
    )


def _sms_assignment_cancelled(worker: User, request: StaffingRequest) -> str:
    return (
        f'[Staffig] {worker.first_name}: affectation annulée / assignment cancelled - '
        f'{request.title} {request.work_date}. '
        f'Connectez-vous / Sign in for available coverage.'
    )


# ── Web Push payloads (single-locale, short) ─────────────────────────────────
# A push notification is a phone-lockscreen one-liner — bilingual bodies don't
# fit, so pick the worker's language ('bilingual' reads French: Québec default).

def _push_lang(worker: User) -> str:
    return 'en' if worker.preferred_language == 'en' else 'fr'


def _push_new_request(worker: User, request: StaffingRequest) -> dict:
    lang = _push_lang(worker)
    start = _fmt_time(request.start_time)
    title = 'Nouveau remplacement' if lang == 'fr' else 'New coverage'
    if request.urgency_level and request.urgency_level >= 3:
        title = f'Urgent — {title.lower()}'
    return {
        'title': title,
        'body': f'{request.title} · {request.work_date} {start} · {request.city}',
        'url': f'/{lang}/worker/requests/{request.id}',
        'tag': f'request-{request.id}',
    }


def _push_request_filled(worker: User, request: StaffingRequest) -> dict:
    """Sent to everyone who was offered the shift but didn't get it.

    Reuses `tag: request-{id}` on purpose — a phone that still shows the
    original "New coverage" banner replaces it in place rather than stacking a
    second notification about the same shift.
    """
    lang = _push_lang(worker)
    start = _fmt_time(request.start_time)
    return {
        'title': 'Quart comblé' if lang == 'fr' else 'Shift filled',
        'body': f'{request.title} · {request.work_date} {start} · {request.city}',
        'url': f'/{lang}/worker',
        'tag': f'request-{request.id}',
    }


def _push_request_cancelled(worker: User, request: StaffingRequest) -> dict:
    """Sent to everyone still holding an open offer when the coordinator
    cancels the request. Same `tag` as the offer push, so a phone that still
    shows "New coverage" swaps it in place instead of stacking a second notice.
    """
    lang = _push_lang(worker)
    start = _fmt_time(request.start_time)
    return {
        'title': 'Demande annulée' if lang == 'fr' else 'Request cancelled',
        'body': f'{request.title} · {request.work_date} {start} · {request.city}',
        'url': f'/{lang}/worker',
        'tag': f'request-{request.id}',
    }


def _push_assignment_confirmed(worker: User, request: StaffingRequest) -> dict:
    lang = _push_lang(worker)
    start = _fmt_time(request.start_time)
    return {
        'title': 'Affectation confirmée' if lang == 'fr' else 'Assignment confirmed',
        'body': f'{request.title} · {request.work_date} {start} · {request.city}',
        'url': f'/{lang}/worker/requests/{request.id}/accepted',
        'tag': f'request-{request.id}',
    }


def _push_assignment_cancelled(worker: User, request: StaffingRequest) -> dict:
    lang = _push_lang(worker)
    return {
        'title': 'Affectation annulée' if lang == 'fr' else 'Assignment cancelled',
        'body': f'{request.title} · {request.work_date}',
        'url': f'/{lang}/worker',
        'tag': f'request-{request.id}',
    }


# ── dispatcher ────────────────────────────────────────────────────────────────

class NotificationDispatcher:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.email = EmailNotificationService()
        self.sms = SmsNotificationService()
        self.push = WebPushService()

    def _send_to_worker(
        self,
        worker: User,
        subject: str,
        email_body: str,
        sms_body: str | None,
        push_payload: dict | None = None,
    ) -> None:
        try:
            self.email.send(EmailMessage(
                to_email=worker.email,
                subject=subject,
                body=email_body,
            ))
        except Exception:
            logger.exception('Email failed for worker %s', worker.id)

        # sms_opt_out covers both a worker's own toggle and an inbound
        # STOP/ARRET — it silences texts only; email and push still go out.
        if worker.phone and not worker.sms_opt_out and sms_body:
            try:
                self.sms.send(worker.phone, sms_body)
            except Exception:
                logger.exception('SMS failed for worker %s', worker.id)

        if push_payload:
            try:
                self.push.send_to_user(self.db, worker.id, push_payload)
            except Exception:
                logger.exception('Web Push failed for worker %s', worker.id)

    def _sms_claim_hint(self, request: StaffingRequest) -> str:
        """The 'Reply 1' line — only when replying 1 would actually work.

        Three things have to be true, and every one of them has bitten
        somewhere already:

        * Twilio must be configured, or there is no inbound webhook to answer
          and the worker texts into a void.
        * The request must be self-serve (a released shift or a reported
          absence). ``ReplacementService.claim`` only accepts those origins, so
          promising it on a coordinator-created request would send the worker
          a reply saying no shift is open — worse than saying nothing.
        * The wording has to match the org's policy. Under MANAGED a reply
          records an offer for the coordinator to weigh, it does not take the
          shift; telling someone they took it would be a lie they act on.

        GSM-7 only (é è à ç are safe, em dashes are not) — one stray character
        re-encodes the whole message as UCS-2 and doubles the price.
        """
        if not settings.twilio_account_sid:
            return ''
        if request.origin not in SELF_SERVE_ORIGINS and not request.auto_assign:
            return ''

        # Self-serve releases/absences follow the org policy at send time (as
        # before); a coordinator request carries its own "first come, first
        # served" checkbox. Managed/off: the reply only records an offer.
        if request.origin in SELF_SERVE_ORIGINS:
            policy = self.db.scalar(
                select(Organization.replacement_policy).where(
                    Organization.id == request.organization_id
                )
            )
            managed = policy == ReplacementPolicy.MANAGED
        else:
            managed = not request.auto_assign
        if managed:
            return 'Réponds 1 pour te proposer / Reply 1 to offer.'
        return 'Réponds 1 pour le prendre / Reply 1 to take it.'

    @staticmethod
    def _sms_broadcast_eligible(request: StaffingRequest) -> bool:
        """SMS costs money and attention — broadcasts text only when speed
        matters (2026-06-10 decision): urgent, or the shift starts within
        ``sms_broadcast_lead_hours`` (24). A shift already underway counts
        (mid-shift coverage is maximal urgency). Assignment confirmations and
        cancellations always text — they're personal, not broadcast."""
        if request.urgency_level and request.urgency_level >= 3:
            return True
        lead = timedelta(hours=settings.sms_broadcast_lead_hours)
        starts = shift_start_utc(request.work_date, request.start_time)
        return starts - datetime.now(timezone.utc) <= lead

    def notify_workers(self, request: StaffingRequest, workers: list[User]) -> None:
        if not workers:
            return
        org_name = _org_name(self.db, request)
        subject = f'[Staffig] Nouveau remplacement : {request.title} / New coverage: {request.title}'
        sms_eligible = self._sms_broadcast_eligible(request)
        claim_hint = self._sms_claim_hint(request) if sms_eligible else ''
        for worker in workers:
            self._send_to_worker(
                worker,
                subject=subject,
                email_body=_body_new_request(worker, request, org_name),
                sms_body=_sms_new_request(worker, request, claim_hint) if sms_eligible else None,
                push_payload=_push_new_request(worker, request),
            )

    def notify_assignment_confirmed(self, request: StaffingRequest, worker: User) -> None:
        org_name = _org_name(self.db, request)
        subject = f'[Staffig] Affectation confirmée : {request.title} / Assignment confirmed: {request.title}'
        self._send_to_worker(
            worker,
            subject=subject,
            email_body=_body_assignment_confirmed(worker, request, org_name),
            sms_body=_sms_assignment_confirmed(worker, request),
            push_payload=_push_assignment_confirmed(worker, request),
        )

    def notify_assignment_cancelled(self, request: StaffingRequest, worker: User) -> None:
        subject = f'[Staffig] Affectation annulée : {request.title} / Assignment cancelled: {request.title}'
        self._send_to_worker(
            worker,
            subject=subject,
            email_body=_body_assignment_cancelled(worker, request),
            sms_body=_sms_assignment_cancelled(worker, request),
            push_payload=_push_assignment_cancelled(worker, request),
        )

    def notify_request_filled(self, request: StaffingRequest, winner_user_id) -> int:
        """Tell everyone who was offered this shift that it's gone.

        Push for everyone; one closure SMS ONLY for workers who had ACCEPTED
        (they raised a hand — by tap or by texting "1" — and are waiting on
        an answer). Passive recipients stay push-only: a StaffiG text has to
        keep meaning *opportunity*, and email would be the same clutter with
        a longer half-life.

        This matters more now that broadcasts invite an SMS reply: the pool
        races, and without this the losers only find out by opening the app or
        by replying and being turned away.

        Returns how many workers were pinged, so callers can record it. Never
        raises — a claim must not fail because a notification did.
        """
        return self._fan_out_closure(
            request,
            exclude_user_id=winner_user_id,
            push_builder=_push_request_filled,
            sms_fr="Ce quart est alle a quelqu'un d'autre cette fois - merci d'avoir offert.",
            sms_en='That shift went to someone else this time - thanks for offering.',
            log_label='Filled',
        )

    def notify_request_cancelled(self, request: StaffingRequest) -> int:
        """Tell everyone still holding an open offer that the coordinator
        cancelled the request.

        Same policy as `notify_request_filled`: push for everyone who was
        offered the shift and hadn't walked away, one closure SMS only for
        workers who had ACCEPTED. Before this, a cancel wrote an audit row and
        nothing else — the pool found out by opening the app.

        Returns how many workers were pinged. Never raises.
        """
        return self._fan_out_closure(
            request,
            exclude_user_id=None,
            push_builder=_push_request_cancelled,
            sms_fr="Ce quart a ete annule par l'organisation - merci d'avoir offert.",
            sms_en='That shift was cancelled by the organization - thanks for offering.',
            log_label='Cancelled',
        )

    def _fan_out_closure(
        self,
        request: StaffingRequest,
        *,
        exclude_user_id,
        push_builder,
        sms_fr: str,
        sms_en: str,
        log_label: str,
    ) -> int:
        """Shared "this shift is off the table" fan-out (filled / cancelled)."""
        conditions = [
            RequestResponse.staffing_request_id == request.id,
            # DECLINED and WITHDRAWN already opted out of this shift;
            # telling them it's gone is noise about a thing they left.
            RequestResponse.status.in_(
                (ResponseStatus.NOTIFIED, ResponseStatus.VIEWED, ResponseStatus.ACCEPTED)
            ),
        ]
        if exclude_user_id is not None:
            conditions.append(RequestResponse.worker_user_id != exclude_user_id)
        recipients = self.db.execute(
            select(RequestResponse.worker_user_id, RequestResponse.status).where(*conditions)
        ).all()

        pinged = 0
        for user_id, response_status in recipients:
            worker = self.db.get(User, user_id)
            if worker is None or not worker.is_active:
                continue
            try:
                self.push.send_to_user(self.db, worker.id, push_builder(worker, request))
                pinged += 1
            except Exception:
                logger.exception('%s push failed for worker %s', log_label, worker.id)
            if response_status is not ResponseStatus.ACCEPTED:
                continue
            # ACCEPTED means they raised a hand — by tapping accept or by
            # texting "1". They committed and are waiting; leaving them to
            # discover the outcome by opening the app is how a channel loses
            # trust. One closure text, GSM-7, then done. The push-only rule
            # above still holds for passive recipients.
            if not worker.phone or worker.sms_opt_out:
                continue
            try:
                self.sms.send(worker.phone, localized(worker.preferred_language, sms_fr, sms_en))
            except Exception:
                logger.exception('%s closure SMS failed for worker %s', log_label, worker.id)
        return pinged
