"""Inbound SMS → claim (spec Feature 1).

A worker who got a broadcast text replies "1" and takes the shift. The webhook
is just another client of `ReplacementService.claim` — the §3 atomicity already
decides SMS-vs-app races, so nothing here duplicates claim logic.

Every branch returns a string that becomes the TwiML reply, so the answer rides
the same HTTP round-trip Twilio already opened: no outbound API call, no second
message charge, and no chance of the reply outrunning the claim it describes.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import select, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.phone import normalize_e164
from app.core.timeutil import shift_start_utc
from app.models.enums import (
    ReplacementPolicy,
    UserRole,
    RequestStatus,
    ResponseStatus,
)
from app.models.inbound_sms import InboundSms
from app.models.organization import Organization
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.i18n import localized
from app.services.replacement_service import SELF_SERVE_ORIGINS, ReplacementService
from app.services.response_service import ResponseService

logger = logging.getLogger(__name__)

CLAIM_TOKENS = {'1', 'oui', 'yes', 'y', 'o'}
STOP_TOKENS = {'stop', 'arret', 'arrêt', 'unsubscribe', 'desabonner', 'désabonner'}
START_TOKENS = {'start', 'unstop', 'yes to texts'}


class InboundSmsService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── replies ──────────────────────────────────────────────────────────────
    # Kept as GSM-7 as far as French allows: a single non-GSM character
    # silently doubles the segment cost of every message we send.

    @staticmethod
    def _reply(user: User | None, fr: str, en: str) -> str:
        return localized(user.preferred_language if user else None, fr, en)

    def handle(self, from_number: str, body: str, message_sid: str | None = None) -> str:
        """Resolve the sender, act on their reply, and return the text to send
        back. Always writes a receipt, including for messages we could not
        match — those are precisely the ones someone will dispute later."""
        user = self._user_by_phone(from_number)
        token = (body or '').strip().lower()

        if user is None:
            # Never confirm or deny whether a number is known to us.
            self._record(from_number, body, message_sid, None, 'unknown_number', None)
            return self._reply(
                None,
                "Numero non reconnu. Contacte ton coordonnateur si tu crois que c'est une erreur.",
                'Number not recognized. Contact your coordinator if you think this is a mistake.',
            )

        if token in STOP_TOKENS:
            user.sms_opt_out = True
            self.db.commit()
            self._record(from_number, body, message_sid, user, 'opted_out', None)
            return self._reply(
                user,
                "C'est note - plus de textos. Tu recois toujours les courriels et les alertes de l'app.",
                "Got it - no more texts. You'll still get email and app alerts.",
            )

        if token in START_TOKENS:
            user.sms_opt_out = False
            self.db.commit()
            self._record(from_number, body, message_sid, user, 'opted_in', None)
            return self._reply(
                user,
                'Textos reactives. Reponds 1 pour prendre un quart.',
                'Texts back on. Reply 1 to take a shift.',
            )

        if token not in CLAIM_TOKENS:
            self._record(from_number, body, message_sid, user, 'help', None)
            return self._reply(
                user,
                'Reponds 1 pour prendre le dernier quart offert, ou STOP pour arreter les textos.',
                'Reply 1 to take the latest shift offered, or STOP to stop texts.',
            )

        request = self._latest_claimable(user)
        if request is None:
            self._record(from_number, body, message_sid, user, 'nothing_open', None)
            return self._reply(
                user,
                "Aucun quart ouvert pour toi en ce moment. On t'ecrit au prochain.",
                "No open shift for you right now. We'll text you the next one.",
            )

        tenant_id = self._tenant_for(request)
        if tenant_id is None:
            # An org with no tenant is a data fault, not a worker problem.
            logger.error('Inbound SMS claim: org %s has no tenant', request.organization_id)
            self._record(from_number, body, message_sid, user, 'nothing_open', request.id)
            return self._reply(
                user,
                "Aucun quart ouvert pour toi en ce moment. On t'ecrit au prochain.",
                "No open shift for you right now. We'll text you the next one.",
            )

        # Self-serve releases/absences follow the org policy at reply time (as
        # before). A coordinator request is only ever here with its "first
        # come, first served" flag on (the query above requires it), so it is
        # claimed whatever the org's release policy says.
        managed = (
            self._policy_for(request) == ReplacementPolicy.MANAGED
            if request.origin in SELF_SERVE_ORIGINS
            else not request.auto_assign
        )
        if managed:
            return self._accept_for_approval(from_number, body, message_sid, user, request)

        return self._claim(from_number, body, message_sid, user, request, tenant_id)

    # ── branches ─────────────────────────────────────────────────────────────

    def _claim(
        self,
        from_number: str,
        body: str,
        message_sid: str | None,
        user: User,
        request: StaffingRequest,
        tenant_id: UUID,
    ) -> str:
        try:
            ReplacementService(self.db).claim(
                request_id=request.id,
                claimer_user_id=user.id,
                tenant_id=tenant_id,
            )
        except HTTPException as exc:
            detail = str(exc.detail)
            if exc.status_code == 409 and 'overlap' in detail.lower():
                self._record(from_number, body, message_sid, user, 'overlap', request.id)
                return self._reply(
                    user,
                    'Tu as deja un quart qui chevauche celui-la.',
                    'You already have a shift that overlaps this one.',
                )
            if exc.status_code == 409:
                self._record(from_number, body, message_sid, user, 'lost_race', request.id)
                return self._reply(
                    user,
                    "Desole - ce quart vient d'etre pris. On t'ecrit au prochain.",
                    "Sorry - that shift was just taken. We'll text you the next one.",
                )
            raise

        self._record(from_number, body, message_sid, user, 'claimed', request.id)
        org = self.db.get(Organization, request.organization_id)
        when = self._when(request)
        return self._reply(
            user,
            f"C'est a toi. {org.name if org else ''} {when}".strip(),
            f"You're in. {org.name if org else ''} {when}".strip(),
        )

    def _accept_for_approval(
        self,
        from_number: str,
        body: str,
        message_sid: str | None,
        user: User,
        request: StaffingRequest,
    ) -> str:
        """Managed org: replying 1 raises a hand, it does not take the shift.

        Goes through the same ResponseService the in-app accept uses, so the
        coordinator's board sees an SMS reply and a tap identically.
        """
        try:
            ResponseService(self.db).set_status(
                request_id=request.id,
                worker_user_id=user.id,
                response_status=ResponseStatus.ACCEPTED,
            )
        except HTTPException as exc:
            if exc.status_code == 409:
                self._record(from_number, body, message_sid, user, 'lost_race', request.id)
                return self._reply(
                    user,
                    "Desole - ce quart vient d'etre pris. On t'ecrit au prochain.",
                    "Sorry - that shift was just taken. We'll text you the next one.",
                )
            raise

        self._record(from_number, body, message_sid, user, 'pending_approval', request.id)
        return self._reply(
            user,
            "Demande recue - en attente du coordonnateur. On te texte des que c'est confirme. N'y va pas encore.",
            "Request received - pending coordinator approval. We'll text you when it's confirmed. Don't head out yet.",
        )

    # ── lookups ──────────────────────────────────────────────────────────────

    def _user_by_phone(self, from_number: str) -> User | None:
        """Match on normalized phone. Refuses to guess between duplicates —
        assigning a shift to the wrong person is far worse than dropping a
        reply, and duplicates mean the data needs a human anyway."""
        normalized = normalize_e164(from_number)
        if normalized is None:
            return None

        matches = list(self.db.scalars(
            select(User).where(User.phone == normalized, User.is_active.is_(True))
        ))
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            # A coordinator sharing a phone with a substitute (the test fleet
            # does, and a small daycare might) must not block the substitute's
            # reply: only substitutes are ever texted a claimable shift, so the
            # worker is the only plausible sender. Two substitutes on one number
            # is still a guess we refuse to make.
            workers = [u for u in matches if u.role == UserRole.WORKER]
            if len(workers) == 1:
                return workers[0]
            logger.warning(
                'Inbound SMS from %s matches %d active users (%d substitutes) — refusing to guess',
                normalized, len(matches), len(workers),
            )
        return None

    def _latest_claimable(self, user: User) -> StaffingRequest | None:
        """Newest shift this worker was texted about that is still takeable.

        "Newest wins" is deliberate (spec 1.1): no multi-choice menus in v1.
        The window keeps a reply to last week's text from claiming today's
        shift, and the start-time check keeps a late reply from claiming a
        shift that is already underway — being assigned to a room you were
        due in twenty minutes ago helps nobody. Started candidates are
        skipped, not fatal: the reply falls through to the next newest.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.sms_claim_window_hours)
        stmt = (
            select(StaffingRequest)
            .join(RequestResponse, RequestResponse.staffing_request_id == StaffingRequest.id)
            .where(
                RequestResponse.worker_user_id == user.id,
                RequestResponse.status == ResponseStatus.NOTIFIED,
                RequestResponse.created_at >= cutoff,
                StaffingRequest.status == RequestStatus.OPEN,
                or_(
                    StaffingRequest.origin.in_(SELF_SERVE_ORIGINS),
                    StaffingRequest.auto_assign.is_(True),
                ),
            )
            .order_by(RequestResponse.created_at.desc())
            .limit(5)
        )
        now = datetime.now(timezone.utc)
        for candidate in self.db.scalars(stmt):
            if shift_start_utc(candidate.work_date, candidate.start_time) > now:
                return candidate
        return None

    def _tenant_for(self, request: StaffingRequest) -> UUID | None:
        return self.db.scalar(
            select(Organization.tenant_id).where(Organization.id == request.organization_id)
        )

    def _policy_for(self, request: StaffingRequest) -> ReplacementPolicy:
        policy = self.db.scalar(
            select(Organization.replacement_policy).where(Organization.id == request.organization_id)
        )
        return policy or ReplacementPolicy.AUTO

    @staticmethod
    def _when(request: StaffingRequest) -> str:
        start = request.start_time.strftime('%H:%M') if request.start_time else ''
        end = request.end_time.strftime('%H:%M') if request.end_time else ''
        return f'{request.work_date.isoformat()} {start}-{end}'.strip()

    # ── receipt ──────────────────────────────────────────────────────────────

    def _record(
        self,
        from_number: str,
        body: str,
        message_sid: str | None,
        user: User | None,
        action: str,
        request_id: UUID | None,
    ) -> None:
        self.db.add(InboundSms(
            id=uuid4(),
            from_number=normalize_e164(from_number) or from_number,
            body=body or '',
            message_sid=message_sid,
            matched_user_id=user.id if user else None,
            action=action,
            staffing_request_id=request_id,
        ))
        self.db.commit()
