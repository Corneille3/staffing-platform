"""Operator-level sales pipeline (SPEC_PLATFORM_LEADS).

Tier-0 data only: prospect organizations that are not tenants yet. Nothing
here reads or writes inside a tenant.

State machine (§4, as settled with the product owner):

    new ─ contacted ─ demo_booked ─ pilot ─ invited ─► won
      └───────┴───────────┴──────────┴────────┴──────► lost ─► contacted

- The five open stages move freely in both directions (skipping a stage or
  stepping back to fix a misclick are both fine).
- `lost` needs a non-empty `lost_reason`; a lost lead reopens to `contacted`
  only, which clears the reason (the event keeps it).
- `won` is never set by hand — it is stamped when the linked tenant goes
  active — and is terminal.
- Every transition writes a `status_changed` event with from/to.
- Conversion (§7): « Invite as a network » stages the tenant and links it in
  one transaction (`invited` event); the tenant finishing its onboarding
  stamps `won` + `converted_at` (`converted` event, written by the system).
"""
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.timeutil import shift_today
from app.models.enums import LeadStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.models.user import User
from app.schemas.platform_leads import (
    LeadCreate, LeadEventCreate, LeadEventOut, LeadStats, LeadUpdate, SegmentWaveCount,
)

OPEN_STATUSES = (
    LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.DEMO_BOOKED, LeadStatus.PILOT, LeadStatus.INVITED,
)
CLOSED_STATUSES = (LeadStatus.WON, LeadStatus.LOST)
EVENTS_ON_DETAIL = 50

SORTS = ('next_action', 'score', 'updated')


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def check_transition(current: LeadStatus, target: LeadStatus) -> None:
    """Raise 422 unless `current -> target` is a legal manual move."""
    if target == current:
        return
    if current == LeadStatus.WON:
        raise _unprocessable('A won lead is closed — its tenant is live.')
    if target == LeadStatus.WON:
        raise _unprocessable('"won" is set automatically when the invited tenant becomes active.')
    if current == LeadStatus.LOST and target != LeadStatus.CONTACTED:
        raise _unprocessable('A lost lead can only be reopened to "contacted".')


def mark_lead_won(db: Session, tenant_id: UUID) -> PlatformLead | None:
    """The tenant just went active: close its lead as won. No commit — the
    caller's transaction carries it, so tenant and lead flip together.
    Whatever stage the lead was left in (even `lost`), a live tenant wins."""
    lead = db.scalar(select(PlatformLead).where(PlatformLead.tenant_id == tenant_id))
    if lead is None or lead.status == LeadStatus.WON:
        return None
    previous = lead.status
    lead.status = LeadStatus.WON
    lead.lost_reason = None
    lead.converted_at = datetime.now(timezone.utc)
    db.add(PlatformLeadEvent(
        lead_id=lead.id, type='converted', actor_id=None,
        from_status=previous, to_status=LeadStatus.WON,
    ))
    return lead


class PlatformLeadService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── helpers ───────────────────────────────────────────────────────────────

    def _get_or_404(self, lead_id: UUID) -> PlatformLead:
        lead = self.db.get(PlatformLead, lead_id)
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lead not found')
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
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'A lead with reference "{external_ref}" already exists.',
            )

    # ── reads ─────────────────────────────────────────────────────────────────

    def search(
        self, *,
        status_: str | None = None, segment: str | None = None, province: str | None = None,
        wave: str | None = None, kind: str | None = None, q: str | None = None,
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

        overdue = self.db.scalar(
            select(func.count()).select_from(PlatformLead).where(
                PlatformLead.next_action_at < shift_today(),
                PlatformLead.status.notin_(CLOSED_STATUSES),
            )
        ) or 0

        past_new = total - by_status['new']
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
            conversion_rate=round(by_status['won'] / past_new, 4) if past_new else None,
        )

    # ── writes ────────────────────────────────────────────────────────────────

    def create(self, payload: LeadCreate, scope: AccessScope) -> PlatformLead:
        target = LeadStatus(payload.status)
        if target == LeadStatus.WON:
            raise _unprocessable('"won" is set automatically when the invited tenant becomes active.')
        if target == LeadStatus.LOST and not payload.lost_reason:
            raise _unprocessable('A lost lead needs a reason (lost_reason).')
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
                raise _unprocessable(f'{key} cannot be empty.')

        current = lead.status
        target = LeadStatus(changes.pop('status')) if 'status' in changes else current
        check_transition(current, target)

        # Validate everything before touching the row — a refused PATCH must
        # leave the lead exactly as it was.
        reason = changes['lost_reason'] if 'lost_reason' in changes else lead.lost_reason
        if target == LeadStatus.LOST and not (reason or '').strip():
            raise _unprocessable('A lost lead needs a reason (lost_reason).')
        if 'external_ref' in changes:
            self._ensure_ref_free(changes['external_ref'], except_id=lead.id)

        for key, value in changes.items():
            setattr(lead, key, value)

        if target != current:
            lead.status = target
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

    def add_event(self, lead_id: UUID, payload: LeadEventCreate, scope: AccessScope) -> LeadEventOut:
        lead = self._get_or_404(lead_id)
        event = self._event(lead, payload.type, scope.user.id, body=payload.body)
        # Touch the lead so "recently worked" sorts follow the activity.
        lead.updated_at = func.now()
        self.db.commit()
        self.db.refresh(event)
        return self.event_out(event, scope.user)

