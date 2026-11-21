"""Operator-level sales pipeline (SPEC_PLATFORM_LEADS).

Tier-0 data only: prospect organizations that are not tenants yet. Nothing
here reads or writes inside a tenant.

State machine (§4, as settled with the product owner):

    new ─ contacted ─ demo_booked ─ invited ─ pilot ─► won
      └───────┴───────────┴───────────┴────────┴─────► lost ─► contacted

- `new`, `contacted` and `demo_booked` move freely in both directions
  (skipping a stage or stepping back to fix a misclick are both fine).
- `invited` and `pilot` belong to the system (spec v1.1 §4): the invite and
  the tenant's activation set them. By hand they are refused, with one way
  back in — a lead that has a tenant may be put on the stage that tenant is
  really at (a pilot closed as lost by mistake reopens to `contacted`, then
  returns to `pilot`). A lead without a tenant can never show either.
- `lost` needs a non-empty `lost_reason`; a lost lead reopens to `contacted`
  only, which clears the reason (the event keeps it).
- `won` is the owner's call, made once the client commits: only from
  `pilot` (409 otherwise), with the linked tenant active. It stamps
  `won_at` and is terminal.
- The pilot has dates: `invited_at` (invite), `pilot_started_at` (tenant
  active — never reset by a second activation or a reopening),
  `pilot_ends_at` (+30 days by default, edited by the operator while the
  lead is in `pilot`). A pilot past its end and an invitation older than
  7 days are what `/stats` flags.
- Every transition writes a `status_changed` event with from/to.
- Deleting a lead is the owner's alone and takes its feed with it; the
  platform audit trail keeps who removed which organization. A lead whose
  workspace still exists cannot be deleted — remove the workspace first.
- Conversion (§7): « Invite as a network » stages the tenant and links it in
  one transaction (`invited` event); the tenant finishing its onboarding
  moves the lead to `pilot` (`tenant_activated` event, written by the
  system) — the trial runs in the prospect's real workspace, so an active
  tenant is a pilot, not a sale.
"""
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.errors import coded
from app.core.timeutil import shift_local_date, shift_today
from app.models.enums import LeadStatus
from app.models.enums import TenantStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.models.tenant import Tenant
from app.models.user import User
from app.services.platform_audit_service import PlatformAuditService
from app.schemas.platform_leads import (
    LeadCreate, LeadEventCreate, LeadEventOut, LeadStats, LeadUpdate, PublicLeadIntake,
    SegmentWaveCount,
)

OPEN_STATUSES = (
    LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.DEMO_BOOKED, LeadStatus.PILOT, LeadStatus.INVITED,
)
CLOSED_STATUSES = (LeadStatus.WON, LeadStatus.LOST)
# Set by the invite and by the tenant's activation, not by hand.
SYSTEM_STATUSES = (LeadStatus.INVITED, LeadStatus.PILOT)
EVENTS_ON_DETAIL = 50
# Planned length of a pilot, from the day the workspace goes active.
PILOT_DAYS = 30
# An invitation the admin has not acted on for this long needs a follow-up.
STALE_INVITE_DAYS = 7

SORTS = ('next_action', 'score', 'updated')


def _unprocessable(code: str, message: str, **params: object) -> HTTPException:
    return coded(status.HTTP_422_UNPROCESSABLE_ENTITY, f'lead.{code}', message, **params)


def lead_not_found() -> HTTPException:
    return coded(status.HTTP_404_NOT_FOUND, 'lead.not_found', 'Lead not found')


def check_transition(current: LeadStatus, target: LeadStatus) -> None:
    """Raise 422 unless `current -> target` is a legal manual move. Moving to
    `won` has extra conditions, checked by `PlatformLeadService._check_win`."""
    if target == current:
        return
    if current == LeadStatus.WON:
        raise _unprocessable('won_is_closed', 'A won lead is closed — its tenant is live.')
    if current == LeadStatus.LOST and target != LeadStatus.CONTACTED:
        raise _unprocessable('lost_reopens_to_contacted', 'A lost lead can only be reopened to "contacted".')


def start_pilot(lead: PlatformLead, started_at: datetime | None = None) -> None:
    """Date the pilot. Only fills what is empty: finishing the wizard twice,
    or putting a reopened lead back in `pilot`, never restarts the clock."""
    if lead.pilot_started_at is None:
        lead.pilot_started_at = started_at or datetime.now(timezone.utc)
    if lead.pilot_ends_at is None:
        lead.pilot_ends_at = shift_local_date(lead.pilot_started_at) + timedelta(days=PILOT_DAYS)


def mark_lead_piloting(db: Session, tenant_id: UUID) -> PlatformLead | None:
    """The tenant just went active: its lead is now in pilot. No commit — the
    caller's transaction carries it, so tenant and lead move together. A lead
    the operator already closed (won / lost) is left alone."""
    lead = db.scalar(select(PlatformLead).where(PlatformLead.tenant_id == tenant_id))
    if lead is None or lead.status in (LeadStatus.PILOT, *CLOSED_STATUSES):
        return None
    previous = lead.status
    lead.status = LeadStatus.PILOT
    start_pilot(lead)
    db.add(PlatformLeadEvent(
        lead_id=lead.id, type='tenant_activated', actor_id=None,
        from_status=previous, to_status=LeadStatus.PILOT,
    ))
    return lead


def receive_public_intake(db: Session, payload: PublicLeadIntake) -> PlatformLead:
    """A demo request from a marketing site. A new lead — or, when an open
    lead already has that email, one more event on its feed: someone who asks
    twice must not become two prospects. Written by the system (no actor)."""
    lead = db.scalar(
        select(PlatformLead)
        .where(
            func.lower(PlatformLead.email) == payload.email,
            PlatformLead.status.notin_(CLOSED_STATUSES),
        )
        .order_by(PlatformLead.created_at.desc())
    )
    body = ' — '.join(part for part in (payload.site, payload.notes) if part) or None
    if lead is None:
        lead = PlatformLead(
            org_name=payload.org_name, email=payload.email,
            contact_name=payload.contact_name, phone=payload.phone,
            segment=payload.segment, province=payload.province, language=payload.language,
            notes=payload.notes, source='website_form', source_detail=payload.site,
            status=LeadStatus.NEW, created_by=None,
        )
        db.add(lead)
        db.flush()
        db.add(PlatformLeadEvent(
            lead_id=lead.id, type='form_submitted', actor_id=None,
            to_status=LeadStatus.NEW, body=body,
        ))
    else:
        db.add(PlatformLeadEvent(lead_id=lead.id, type='form_submitted', actor_id=None, body=body))
        lead.updated_at = func.now()
    db.commit()
    db.refresh(lead)
    return lead


class PlatformLeadService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── helpers ───────────────────────────────────────────────────────────────

    def _get_or_404(self, lead_id: UUID) -> PlatformLead:
        lead = self.db.get(PlatformLead, lead_id)
        if lead is None:
            raise lead_not_found()
        return lead

    def _event(
        self, lead: PlatformLead, type_: str, actor_id: UUID | None, *,
        body: str | None = None,
        from_status: LeadStatus | None = None, to_status: LeadStatus | None = None,
    ) -> PlatformLeadEvent:
        event = PlatformLeadEvent(
            lead_id=lead.id, type=type_, body=body, actor_id=actor_id,
            from_status=from_status, to_status=to_status,
        )
        self.db.add(event)
        return event

    def _ensure_ref_free(self, external_ref: str | None, except_id: UUID | None = None) -> None:
        if not external_ref:
            return
        clash = self.db.scalar(select(PlatformLead).where(PlatformLead.external_ref == external_ref))
        if clash is not None and clash.id != except_id:
            raise coded(
                status.HTTP_409_CONFLICT, 'lead.ref_exists',
                f'A lead with reference "{external_ref}" already exists.', ref=external_ref,
            )

    def _check_system_stage(self, lead: PlatformLead, target: LeadStatus) -> Tenant:
        """`invited` / `pilot` by hand: only to put a lead back on the stage
        its tenant is really at. No tenant, or a tenant in another state
        (suspended, removed), leaves nothing to restore."""
        tenant = self.db.get(Tenant, lead.tenant_id) if lead.tenant_id else None
        if tenant is None:
            expected = None
        elif tenant.status == TenantStatus.ACTIVE:
            expected = LeadStatus.PILOT
        elif tenant.status in (TenantStatus.PENDING, TenantStatus.ONBOARDING):
            expected = LeadStatus.INVITED
        else:
            expected = None
        if target != expected:
            raise _unprocessable(
                'stage_set_by_system',
                f'"{target.value}" is set by the invitation and the workspace, not by hand.',
                status=target.value,
            )
        return tenant

    @staticmethod
    def _check_pilot_end(lead: PlatformLead, target: LeadStatus, value: date | None) -> None:
        """The planned end of a pilot: a date, on a lead in `pilot`, not
        before the pilot started."""
        if target != LeadStatus.PILOT:
            raise _unprocessable('pilot_end_needs_pilot', 'Only a lead in pilot has a pilot end date.')
        if value is None:
            raise _unprocessable('field_required', 'pilot_ends_at cannot be empty.', field='pilot_ends_at')
        if lead.pilot_started_at is not None and value < shift_local_date(lead.pilot_started_at):
            raise _unprocessable('pilot_end_before_start', 'A pilot cannot end before it started.')

    def _check_win(self, lead: PlatformLead, scope: AccessScope) -> None:
        """`won` = the client committed. Owner only, from `pilot` only, and
        only while the tenant is live — otherwise there is nothing to have won."""
        if not scope.is_platform_owner:
            raise coded(
                status.HTTP_403_FORBIDDEN, 'lead.win_owner_only',
                'Only a platform owner can mark a lead as won.',
            )
        if lead.status != LeadStatus.PILOT:
            raise coded(
                status.HTTP_409_CONFLICT, 'lead.win_needs_pilot',
                'A lead can only be won from "pilot".', status=lead.status.value,
            )
        tenant = self.db.get(Tenant, lead.tenant_id) if lead.tenant_id else None
        if tenant is None or tenant.status != TenantStatus.ACTIVE:
            raise _unprocessable('win_needs_active_tenant', 'A lead can only be won once its invited tenant is active.')

    # ── reads ─────────────────────────────────────────────────────────────────

    def search(
        self, *,
        status_: str | None = None, segment: str | None = None, province: str | None = None,
        wave: str | None = None, kind: str | None = None, source: str | None = None,
        q: str | None = None,
        next_action_before: date | None = None,
        sort: str = 'next_action', limit: int = 50, offset: int = 0,
    ) -> tuple[list[PlatformLead], int]:
        conditions = []
        if status_:
            conditions.append(PlatformLead.status == LeadStatus(status_))
        if segment:
            conditions.append(PlatformLead.segment == segment)
        if province:
            conditions.append(PlatformLead.province == province.upper())
        if wave:
            conditions.append(PlatformLead.wave == wave.upper())
        if kind:
            conditions.append(PlatformLead.kind == kind)
        if source:
            conditions.append(PlatformLead.source == source)
        if q and q.strip():
            escaped = q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
            conditions.append(PlatformLead.org_name.ilike(f'%{escaped}%', escape='\\'))
        if next_action_before:
            conditions.append(PlatformLead.next_action_at < next_action_before)

        total = self.db.scalar(select(func.count()).select_from(PlatformLead).where(*conditions)) or 0

        if sort == 'score':
            order = (PlatformLead.score.desc().nulls_last(), PlatformLead.org_name)
        elif sort == 'updated':
            order = (PlatformLead.updated_at.desc(), PlatformLead.org_name)
        else:  # default (§6.1): soonest action first, then the best score
            order = (
                PlatformLead.next_action_at.asc().nulls_last(),
                PlatformLead.score.desc().nulls_last(),
                PlatformLead.org_name,
            )
        rows = self.db.scalars(
            select(PlatformLead).where(*conditions).order_by(*order).limit(limit).offset(offset)
        ).all()
        return list(rows), total

    def get(self, lead_id: UUID) -> PlatformLead:
        return self._get_or_404(lead_id)

    def recent_events(self, lead_id: UUID, limit: int = EVENTS_ON_DETAIL) -> list[LeadEventOut]:
        rows = self.db.execute(
            select(PlatformLeadEvent, User)
            .outerjoin(User, User.id == PlatformLeadEvent.actor_id)
            .where(PlatformLeadEvent.lead_id == lead_id)
            .order_by(PlatformLeadEvent.created_at.desc(), PlatformLeadEvent.id.desc())
            .limit(limit)
        ).all()
        return [self.event_out(event, actor) for event, actor in rows]

    @staticmethod
    def event_out(event: PlatformLeadEvent, actor: User | None) -> LeadEventOut:
        return LeadEventOut(
            id=event.id, type=event.type,
            from_status=event.from_status.value if event.from_status else None,
            to_status=event.to_status.value if event.to_status else None,
            body=event.body, actor_id=event.actor_id,
            actor_name=f'{actor.first_name} {actor.last_name}'.strip() if actor else None,
            created_at=event.created_at,
        )

    def stats(self) -> LeadStats:
        by_status_rows = self.db.execute(
            select(PlatformLead.status, func.count()).group_by(PlatformLead.status)
        ).all()
        by_status = {s.value: 0 for s in LeadStatus}
        for lead_status, count in by_status_rows:
            by_status[lead_status.value] = count
        total = sum(by_status.values())

        segment_wave = self.db.execute(
            select(PlatformLead.segment, PlatformLead.wave, func.count())
            .group_by(PlatformLead.segment, PlatformLead.wave)
            .order_by(PlatformLead.segment, PlatformLead.wave.asc().nulls_last())
        ).all()

        today = shift_today()
        # An invitation nobody acted on: the admin has not finished the setup
        # wizard a week later, so the lead is still `invited` (v1.1 §4).
        stale_invite = and_(
            PlatformLead.status == LeadStatus.INVITED,
            PlatformLead.invited_at < datetime.now(timezone.utc) - timedelta(days=STALE_INVITE_DAYS),
        )

        def how_many(*conditions) -> int:
            return self.db.scalar(select(func.count()).select_from(PlatformLead).where(*conditions)) or 0

        overdue = how_many(
            PlatformLead.status.notin_(CLOSED_STATUSES),
            or_(PlatformLead.next_action_at < today, stale_invite),
        )
        # Demo requests from a marketing site nobody has picked up yet — the
        # list sorts them last (no next action, no score), so it flags them.
        new_website = how_many(PlatformLead.status == LeadStatus.NEW, PlatformLead.source == 'website_form')
        pilots_overdue = how_many(PlatformLead.status == LeadStatus.PILOT, PlatformLead.pilot_ends_at < today)

        # Conversion is measured on the pilots, not on the contacts: a lead
        # that never tried the product says nothing about closing.
        reached_pilot = how_many(PlatformLead.pilot_started_at.is_not(None))
        won_after_pilot = how_many(PlatformLead.status == LeadStatus.WON, PlatformLead.pilot_started_at.is_not(None))
        avg_seconds = self.db.scalar(
            select(func.avg(func.extract('epoch', PlatformLead.won_at - PlatformLead.pilot_started_at)))
            .where(
                PlatformLead.status == LeadStatus.WON,
                PlatformLead.won_at.is_not(None), PlatformLead.pilot_started_at.is_not(None),
            )
        )

        return LeadStats(
            total=total,
            by_status=by_status,
            by_segment_wave=[
                SegmentWaveCount(segment=segment, wave=wave, count=count)
                for segment, wave, count in segment_wave
            ],
            open_pipeline=total - by_status['won'] - by_status['lost'],
            overdue_actions=overdue,
            in_demo_or_pilot=by_status['demo_booked'] + by_status['pilot'],
            new_website_requests=new_website,
            stale_invites=how_many(stale_invite),
            pilots_active=by_status['pilot'],
            pilots_overdue=pilots_overdue,
            avg_pilot_days=round(float(avg_seconds) / 86400, 1) if avg_seconds is not None else None,
            conversion_rate=round(won_after_pilot / reached_pilot, 4) if reached_pilot else None,
        )

    # ── writes ────────────────────────────────────────────────────────────────

    def create(self, payload: LeadCreate, scope: AccessScope) -> PlatformLead:
        target = LeadStatus(payload.status)
        if target == LeadStatus.WON:
            raise _unprocessable('new_cannot_be_won', 'A new lead cannot be won — it has no tenant yet.')
        if target in SYSTEM_STATUSES:
            raise _unprocessable(
                'stage_set_by_system',
                f'"{target.value}" is set by the invitation and the workspace, not by hand.',
                status=target.value,
            )
        if target == LeadStatus.LOST and not payload.lost_reason:
            raise _unprocessable('lost_needs_reason', 'A lost lead needs a reason (lost_reason).')
        self._ensure_ref_free(payload.external_ref)

        data = payload.model_dump()
        data['status'] = target
        if target != LeadStatus.LOST:
            data['lost_reason'] = None
        lead = PlatformLead(**data, created_by=scope.user.id)
        self.db.add(lead)
        self.db.flush()
        self._event(lead, 'created', scope.user.id, to_status=target)
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def update(self, lead_id: UUID, payload: LeadUpdate, scope: AccessScope) -> PlatformLead:
        lead = self._get_or_404(lead_id)
        changes = payload.model_dump(exclude_unset=True)

        # Columns that are NOT NULL: an explicit null is a client mistake.
        for key in ('org_name', 'segment', 'province', 'kind', 'agency_ban_phase', 'language', 'source', 'status'):
            if key in changes and changes[key] is None:
                raise _unprocessable('field_required', f'{key} cannot be empty.', field=key)

        current = lead.status
        target = LeadStatus(changes.pop('status')) if 'status' in changes else current
        if target == LeadStatus.WON and current != LeadStatus.WON:
            self._check_win(lead, scope)
        check_transition(current, target)
        stage_tenant = (
            self._check_system_stage(lead, target)
            if target in SYSTEM_STATUSES and target != current else None
        )
        if 'pilot_ends_at' in changes:
            self._check_pilot_end(lead, target, changes['pilot_ends_at'])

        # Validate everything before touching the row — a refused PATCH must
        # leave the lead exactly as it was.
        reason = changes['lost_reason'] if 'lost_reason' in changes else lead.lost_reason
        if target == LeadStatus.LOST and not (reason or '').strip():
            raise _unprocessable('lost_needs_reason', 'A lost lead needs a reason (lost_reason).')
        if 'external_ref' in changes:
            self._ensure_ref_free(changes['external_ref'], except_id=lead.id)

        for key, value in changes.items():
            setattr(lead, key, value)

        if target != current:
            lead.status = target
            if target == LeadStatus.WON:
                lead.won_at = datetime.now(timezone.utc)
            # Back on the stage of its workspace: the dates follow the
            # workspace's own history when the lead never carried them.
            if target == LeadStatus.PILOT and stage_tenant is not None:
                start_pilot(lead, stage_tenant.activated_at)
            if target == LeadStatus.INVITED and stage_tenant is not None and lead.invited_at is None:
                lead.invited_at = stage_tenant.created_at
            if current == LeadStatus.LOST:
                lead.lost_reason = None  # reopened — the event below keeps the history
            self._event(
                lead, 'status_changed', scope.user.id, from_status=current, to_status=target,
                body=lead.lost_reason if target == LeadStatus.LOST else None,
            )
        elif target != LeadStatus.LOST and 'lost_reason' in changes:
            lead.lost_reason = None  # a reason only means something on a lost lead

        self.db.commit()
        self.db.refresh(lead)
        return lead

    def win(self, lead_id: UUID, scope: AccessScope) -> PlatformLead:
        """`POST /{id}/won` — the client committed. 409 unless the lead is in
        `pilot` (a lead already won included)."""
        lead = self._get_or_404(lead_id)
        self._check_win(lead, scope)
        lead.status = LeadStatus.WON
        lead.won_at = datetime.now(timezone.utc)
        self._event(
            lead, 'status_changed', scope.user.id,
            from_status=LeadStatus.PILOT, to_status=LeadStatus.WON,
        )
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def delete(self, lead_id: UUID, scope: AccessScope) -> None:
        """Remove a lead and its feed for good (owner only — the route gates it).

        Meant for test rows and mistakes: a lead that became a workspace is
        that workspace's history, so it stays until the workspace is removed.
        The events go with the row (FK ON DELETE CASCADE); the platform audit
        trail keeps what was deleted and by whom."""
        lead = self._get_or_404(lead_id)
        tenant = self.db.get(Tenant, lead.tenant_id) if lead.tenant_id else None
        if tenant is not None and tenant.status != TenantStatus.REMOVED:
            raise coded(
                status.HTTP_409_CONFLICT, 'lead.delete_has_live_tenant',
                f'This lead is linked to the workspace "{tenant.name}". Remove the workspace before deleting the lead.',
                name=tenant.name,
            )
        event_count = self.db.scalar(
            select(func.count()).select_from(PlatformLeadEvent).where(PlatformLeadEvent.lead_id == lead.id)
        )
        PlatformAuditService(self.db).log(
            scope.user.id, 'lead.deleted', target_type='platform_lead', target_id=str(lead.id),
            payload={
                'org_name': lead.org_name, 'external_ref': lead.external_ref,
                'segment': lead.segment, 'status': lead.status.value, 'source': lead.source,
                'tenant_id': str(lead.tenant_id) if lead.tenant_id else None,
                'event_count': event_count,
            },
        )
        self.db.delete(lead)
        self.db.commit()

    def add_event(self, lead_id: UUID, payload: LeadEventCreate, scope: AccessScope) -> LeadEventOut:
        lead = self._get_or_404(lead_id)
        event = self._event(lead, payload.type, scope.user.id, body=payload.body)
        # Touch the lead so "recently worked" sorts follow the activity.
        lead.updated_at = func.now()
        self.db.commit()
        self.db.refresh(event)
        return self.event_out(event, scope.user)

