"""Coordinator-facing self-serve replacement (SELF_SERVE_REPLACEMENT §5, §6.1).

Awareness (the self-filled feed + KPIs, both releases and permanent-staff
absences), the per-org policy, and the escalate-then-expire sweep the
background scheduler drives. Kept separate from ReplacementService, which
owns the worker actions.
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.core.timeutil import shift_start_utc
from app.models.enums import RequestStatus, ResponseStatus, UserRole, RequestOrigin
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.repositories.organization_repository import OrganizationRepository
from app.schemas.replacement import (
    ReplacementFeedItem,
    ReplacementFeedResponse,
    ReplacementKpis,
    ReplacementPolicyRead,
    ReplacementPolicyUpdate,
)
from app.services.audit_service import AuditService
from app.services.replacement_service import SELF_SERVE_ORIGINS

logger = logging.getLogger(__name__)

# A released shift is still seeking a fill in any of these (auto: OPEN; managed:
# NOTIFIED/RESPONSES_RECEIVED while workers respond and the coordinator decides).
_SEARCHING_STATUSES = (
    RequestStatus.OPEN,
    RequestStatus.NOTIFIED,
    RequestStatus.RESPONSES_RECEIVED,
)

# Request status → feed status (the coordinator's vocabulary, §6.1).
_FEED_STATUS = {
    RequestStatus.OPEN: 'searching',
    RequestStatus.NOTIFIED: 'searching',
    RequestStatus.RESPONSES_RECEIVED: 'searching',
    RequestStatus.ASSIGNED: 'filled',
    RequestStatus.COMPLETED: 'filled',
    RequestStatus.CANCELLED: 'cancelled',
    RequestStatus.EXPIRED: 'unfilled',
}


def _shift_started(request: StaffingRequest, now: datetime) -> bool:
    return shift_start_utc(request.work_date, request.start_time) <= now


class ReplacementAdminService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.org_repo = OrganizationRepository(db)
        self.audit_service = AuditService(db)

    def _accessible_org_ids(self, scope: AccessScope) -> list[UUID]:
        return [org.id for org in self.org_repo.list_for_scope(scope)]

    def coordinator_feed(self, scope: AccessScope, status_filter: str | None = None) -> ReplacementFeedResponse:
        org_ids = self._accessible_org_ids(scope)
        empty = ReplacementFeedResponse(
            kpis=ReplacementKpis(released_this_week=0, filled=0, unfilled=0), items=[],
        )
        if not org_ids:
            return empty

        requests = list(self.db.scalars(
            select(StaffingRequest)
            .where(
                # Both self-serve origins: contractor releases AND
                # permanent-staff absences (same visibility, §6.1).
                StaffingRequest.origin.in_(SELF_SERVE_ORIGINS),
                StaffingRequest.organization_id.in_(org_ids),
            )
            .order_by(StaffingRequest.created_at.desc())
        ))

        user_ids: set[UUID] = set()
        for r in requests:
            user_ids.add(r.created_by_user_id)
            if r.assigned_worker_user_id:
                user_ids.add(r.assigned_worker_user_id)
        users = {
            u.id: u for u in self.db.scalars(select(User).where(User.id.in_(user_ids)))
        } if user_ids else {}

        def name(uid: UUID | None) -> str | None:
            if uid is None:
                return None
            u = users.get(uid)
            return f'{u.first_name} {u.last_name}'.strip() if u else None

        def ttf(r: StaffingRequest) -> int | None:
            if r.assigned_at and r.created_at:
                return int((r.assigned_at - r.created_at).total_seconds() // 60)
            return None

        now = datetime.now(timezone.utc)
        items: list[ReplacementFeedItem] = []
        for r in requests:
            feed_status = _FEED_STATUS.get(r.status, 'searching')
            # Derived: a still-searching shift whose start time has passed with
            # no fill reads as unfilled even before the sweep persists it — so the
            # dashboard is honest without a scheduler.
            if r.status in _SEARCHING_STATUSES and _shift_started(r, now):
                feed_status = 'unfilled'
            if status_filter == 'live' and feed_status != 'searching':
                continue
            if status_filter == 'history' and feed_status == 'searching':
                continue
            items.append(ReplacementFeedItem(
                request_id=r.id,
                origin=r.origin.value,
                giver_name=name(r.created_by_user_id) or '—',
                title=r.title,
                work_date=r.work_date,
                start_time=r.start_time,
                end_time=r.end_time,
                role=r.role.value if r.role else None,
                reason=r.release_reason,
                status=feed_status,
                claimer_name=name(r.assigned_worker_user_id),
                released_at=r.created_at,
                time_to_fill_minutes=ttf(r),
            ))

        week_ago = now - timedelta(days=7)
        filled = [r for r in requests if r.status in (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)]
        ttfs = [t for r in filled if (t := ttf(r)) is not None]
        kpis = ReplacementKpis(
            released_this_week=sum(1 for r in requests if r.created_at and r.created_at >= week_ago),
            filled=len(filled),
            avg_time_to_fill_minutes=int(sum(ttfs) / len(ttfs)) if ttfs else None,
            # Persisted-expired + derived-unfilled (still searching, shift started).
            unfilled=sum(
                1 for r in requests
                if r.status == RequestStatus.EXPIRED
                or (r.status in _SEARCHING_STATUSES and _shift_started(r, now))
            ),
        )
        return ReplacementFeedResponse(kpis=kpis, items=items)

    def _org_in_scope(self, org_id: UUID, scope: AccessScope) -> Organization:
        if org_id not in self._accessible_org_ids(scope):
            raise HTTPException(status.HTTP_403_FORBIDDEN, 'Out of scope.')
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, 'Organization not found.')
        return org

    def get_policy(self, org_id: UUID, scope: AccessScope) -> ReplacementPolicyRead:
        org = self._org_in_scope(org_id, scope)
        return ReplacementPolicyRead(
            organization_id=org.id,
            organization_name=org.name,
            policy=org.replacement_policy,
            allowed_roles=org.replacement_allowed_roles or [],
            min_release_lead_minutes=org.min_release_lead_minutes,
        )

    def set_policy(self, org_id: UUID, payload: ReplacementPolicyUpdate, scope: AccessScope) -> ReplacementPolicyRead:
        org = self._org_in_scope(org_id, scope)
        if payload.policy is not None:
            org.replacement_policy = payload.policy
        if payload.allowed_roles is not None:
            org.replacement_allowed_roles = payload.allowed_roles
        if payload.min_release_lead_minutes is not None:
            org.min_release_lead_minutes = payload.min_release_lead_minutes
        self.audit_service.log(
            action='replacement.policy_updated',
            entity_type='organization',
            entity_id=org.id,
            actor_user_id=scope.user.id,
            organization_id=org.id,
            payload={
                'policy': org.replacement_policy.value,
                'allowed_roles': org.replacement_allowed_roles,
                'min_release_lead_minutes': org.min_release_lead_minutes,
            },
        )
        self.db.commit()
        self.db.refresh(org)
        return self.get_policy(org_id, scope)

    # ── escalation + expiry (§7, scheduler-wired 2026-06-10) ────────────────

    def tick(
        self,
        org_ids: list[UUID] | None = None,
        actor_user_id: UUID | None = None,
        now: datetime | None = None,
    ) -> dict:
        """One sweep pass over still-searching requests — every origin:
        contractor releases, permanent-staff absences, AND coordinator-posted
        requests (SPEC_NOSHOW §C — before that, a coordinator request nobody
        claimed got no warning and never expired):

          1. **escalate** — the shift starts within the escalation lead and
             nobody has filled it → stamp ``escalated_at`` (one warning per
             request, not per tick), audit ``replacement.escalated``, and email
             the org's coordinators while they can still act. Coordinator-
             origin requests get their own wording (the reader posted it).
          2. **expire** — the shift start has passed unfilled (auto: nobody
             claimed; managed: nobody assigned) → EXPIRED, audit
             ``replacement.unfilled``.

        ``org_ids=None`` means ALL orgs (the scheduler path, no caller);
        the manual endpoint passes the caller's accessible orgs. Emails go
        out after commit, best-effort — a mail hiccup never breaks the sweep.
        """
        now = now or datetime.now(timezone.utc)
        lead = timedelta(minutes=settings.replacement_escalation_lead_minutes)

        # Every origin on purpose: DRAFT is excluded by the status filter,
        # and ASSIGNED shifts are out of _SEARCHING_STATUSES — only genuinely
        # uncovered shifts can escalate or expire.
        query = select(StaffingRequest).where(
            StaffingRequest.status.in_(_SEARCHING_STATUSES),
        )
        if org_ids is not None:
            if not org_ids:
                return {'escalated': 0, 'expired': 0}
            query = query.where(StaffingRequest.organization_id.in_(org_ids))

        escalated: list[StaffingRequest] = []
        expired = 0
        for request in self.db.scalars(query):
            start = shift_start_utc(request.work_date, request.start_time)
            if start <= now:
                request.status = RequestStatus.EXPIRED
                self.audit_service.log(
                    action='replacement.unfilled', entity_type='staffing_request',
                    entity_id=request.id, actor_user_id=actor_user_id,
                    organization_id=request.organization_id, payload={},
                )
                expired += 1
            elif request.escalated_at is None and start - now <= lead:
                request.escalated_at = now
                self.audit_service.log(
                    action='replacement.escalated', entity_type='staffing_request',
                    entity_id=request.id, actor_user_id=actor_user_id,
                    organization_id=request.organization_id,
                    payload={'minutes_to_start': int((start - now).total_seconds() // 60)},
                )
                escalated.append(request)
        self.db.commit()

        for request in escalated:
            try:
                self._email_coordinators(request, now)
            except Exception:  # pragma: no cover — never let mail break the sweep
                logger.exception('Escalation email failed for request %s', request.id)

        return {'escalated': len(escalated), 'expired': expired}

    def sweep(self, scope: AccessScope) -> dict:
        """Manual trigger of the same pass, scoped to the caller's orgs."""
        return self.tick(
            org_ids=self._accessible_org_ids(scope),
            actor_user_id=scope.user.id,
        )

    def _email_coordinators(self, request: StaffingRequest, now: datetime) -> None:
        """Warn the org's coordinators (active org_admins) that a shift is
        about to start unfilled — while they can still step in. Self-serve
        origins explain who released/reported; coordinator origin speaks to
        the person who posted it (SPEC_NOSHOW §C)."""
        org = self.db.get(Organization, request.organization_id)
        admins = list(self.db.scalars(
            select(User)
            .join(OrganizationMembership, OrganizationMembership.user_id == User.id)
            .where(
                OrganizationMembership.organization_id == request.organization_id,
                OrganizationMembership.role == UserRole.ORG_ADMIN,
                OrganizationMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
        ))
        if not admins:
            logger.warning('No active coordinator to escalate request %s to', request.id)
            return

        giver = self.db.get(User, request.created_by_user_id)
        giver_name = f'{giver.first_name} {giver.last_name}'.strip() if giver else '—'
        accepted = self.db.scalar(
            select(func.count()).select_from(RequestResponse).where(
                RequestResponse.staffing_request_id == request.id,
                RequestResponse.status == ResponseStatus.ACCEPTED,
            )
        ) or 0
        start = shift_start_utc(request.work_date, request.start_time)
        minutes = max(0, int((start - now).total_seconds() // 60))
        date_str = request.work_date.strftime('%Y-%m-%d')
        time_str = f"{request.start_time.strftime('%H:%M')}–{request.end_time.strftime('%H:%M')}"
        org_name = org.name if org else ''
        portal = (
            settings.allowed_origins[0].rstrip('/')
            if settings.allowed_origins else 'http://localhost:3000'
        )

        start_hm = request.start_time.strftime('%H:%M')
        role_label = request.role.value if request.role else ''
        if request.origin == RequestOrigin.COORDINATOR:
            # The reader posted this shift themselves. Approval-mode nuance
            # (§C.3): hands raised but nobody picked = a decision overdue,
            # not a coverage gap — say so.
            if accepted:
                context_fr = (
                    f'{accepted} remplaçant(e)s ont accepté votre quart au {org_name} — '
                    f'choisissez avant {start_hm}, sinon il expire.'
                )
                context_en = (
                    f'{accepted} substitute(s) accepted your shift at {org_name} — '
                    f'pick one before {start_hm} or it expires.'
                )
            else:
                context_fr = (
                    f'Votre quart publié commence dans environ {minutes} minutes et '
                    f'n\'est toujours pas comblé — {role_label} au {org_name}, '
                    f'{date_str} {start_hm}. Relancez le bassin ou ajustez-le '
                    f'pendant qu\'il est temps.'
                )
                context_en = (
                    f'Your posted shift starts in about {minutes} minutes and is '
                    f'still unfilled — {role_label} at {org_name}, {date_str} '
                    f'{start_hm}. Re-notify the pool or adjust it while there\'s time.'
                )
            waiting_fr = ''
            waiting_en = ''
        else:
            is_absence = request.origin.value == 'staff_absence'
            context_fr = (
                f'Absence signalée par {giver_name}.' if is_absence
                else f'Quart libéré par {giver_name}.'
            )
            context_en = (
                f'Absence reported by {giver_name}.' if is_absence
                else f'Shift released by {giver_name}.'
            )
            waiting_fr = (
                f'{accepted} candidature(s) en attente d\'assignation.\n' if accepted else ''
            )
            waiting_en = f'{accepted} response(s) awaiting assignment.\n' if accepted else ''

        email_service = EmailNotificationService()
        for admin in admins:
            fr = (
                f'Bonjour {admin.first_name},\n\n'
                f'Le quart du {date_str} ({time_str}) à {org_name} n\'est toujours pas '
                f'comblé et débute dans environ {minutes} minutes.\n\n'
                f'{context_fr}\n'
                f'{waiting_fr}\n'
                f'Vous pouvez encore intervenir — assigner quelqu\'un depuis la demande '
                f'ou contacter une personne directement :\n'
                f'{portal}/fr/admin/requests/{request.id}\n\n'
                f'— Staffig'
            )
            en = (
                f'Hi {admin.first_name},\n\n'
                f'The {date_str} shift ({time_str}) at {org_name} is still unfilled '
                f'and starts in about {minutes} minutes.\n\n'
                f'{context_en}\n'
                f'{waiting_en}\n'
                f'There is still time to step in — assign someone from the request '
                f'or reach out directly:\n'
                f'{portal}/en/admin/requests/{request.id}\n\n'
                f'— Staffig'
            )
            email_service.send(EmailMessage(
                to_email=admin.email,
                subject=localized_subject(
                    admin.preferred_language,
                    f'Quart non comblé — {date_str} {time_str} ({org_name})',
                    f'Unfilled shift — {date_str} {time_str} ({org_name})',
                ),
                body=localized(admin.preferred_language, fr, en),
            ))
