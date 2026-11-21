"""`/platform` overview — what needs the operator's attention today.

One read for the whole screen. It answers a question, not a dashboard: the
first block is a list of things to act on, each one naming where to go; the
counts (tenants, activity, pipeline) come after.

Two boundaries are enforced HERE, not on the screen:

- privacy (same as PlatformService): counts and rates across tenants, tenant
  names and nothing from inside a tenant — no worker, request or shift row;
- roles: the sales pipeline and the audit trail belong to the owner. For an
  operator or a support account those blocks are simply absent (null), and
  no lead-derived line appears in the attention list. The pending access
  requests are hidden from `support`, like the route that lists them.

A marketing operator never reaches this module: `get_access_scope` only lets
them into `/platform/leads`.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.timeutil import shift_today
from app.models.enums import LeadStatus, RequestStatus, TenantAccessGrantStatus, TenantStatus
from app.models.organization import Organization
from app.models.platform_lead import PlatformLead
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.services.platform_audit_service import PlatformAuditService
from app.services.platform_lead_service import STALE_INVITE_DAYS, PlatformLeadService

ACTIVITY_DAYS = 7
AUDIT_LINES = 5
# Same patience as the pipeline's « stale invite » (spec v1.1 §4): one rule,
# so the same delay is never flagged at two different moments.
STALE_TENANT_DAYS = STALE_INVITE_DAYS

_FILLED = (RequestStatus.ASSIGNED, RequestStatus.COMPLETED)
_SHOWN = (TenantStatus.PENDING, TenantStatus.ONBOARDING, TenantStatus.ACTIVE, TenantStatus.SUSPENDED)


def _days_since(moment: datetime, now: datetime) -> int:
    return max(0, (now - moment).days)


class PlatformOverviewService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def build(self, scope: AccessScope) -> dict:
        now = datetime.now(timezone.utc)
        owner = scope.is_platform_owner
        sees_grants = scope.platform_operator_role in ('owner', 'operator')

        tenants = list(self.db.scalars(
            select(Tenant).where(Tenant.status.in_(_SHOWN)).order_by(Tenant.created_at.asc())
        ))
        stats = PlatformLeadService(self.db).stats() if owner else None

        attention: list[dict] = []
        if stats is not None:
            attention += self._lead_items(stats)
        attention += self._tenant_items(tenants, now, with_leads=owner)
        if sees_grants:
            attention += self._grant_items(tenants)

        return {
            'generated_at': now,
            'attention': attention,
            'tenants': self._tenant_counts(tenants),
            'activity': self._activity(now),
            'leads': {
                'total': stats.total,
                'open_pipeline': stats.open_pipeline,
                'by_status': stats.by_status,
            } if stats is not None else None,
            'audit': PlatformAuditService(self.db).list_rows(None, AUDIT_LINES, 0)[0] if owner else None,
        }

    # ── things to act on ──────────────────────────────────────────────────────

    def _lead_items(self, stats) -> list[dict]:
        """Owner only. Counts for what the leads list already filters; one
        line per overdue pilot, because that one is a phone call to a client."""
        today = shift_today()
        items: list[dict] = []
        if stats.new_website_requests:
            items.append({'kind': 'new_website_requests', 'count': stats.new_website_requests})
        late = self.db.scalar(
            select(func.count()).select_from(PlatformLead).where(
                PlatformLead.next_action_at < today,
                PlatformLead.status.notin_((LeadStatus.WON, LeadStatus.LOST)),
            )
        ) or 0
        if late:
            items.append({'kind': 'overdue_followups', 'count': late})
        pilots = self.db.execute(
            select(PlatformLead.id, PlatformLead.org_name, PlatformLead.pilot_ends_at)
            .where(PlatformLead.status == LeadStatus.PILOT, PlatformLead.pilot_ends_at < today)
            .order_by(PlatformLead.pilot_ends_at.asc())
        ).all()
        for lead_id, org_name, ends in pilots:
            items.append({
                'kind': 'pilot_overdue', 'count': 1, 'name': org_name,
                'days': (today - ends).days, 'lead_id': lead_id,
            })
        return items

    def _tenant_items(self, tenants: list[Tenant], now: datetime, *, with_leads: bool) -> list[dict]:
        """An invitation nobody answered, a setup wizard left half-way, a
        suspended workspace. The lead a stalled tenant came from is linked
        for the owner only — the line itself is the tenant's, so the pipeline's
        own « stale invite » is not listed a second time."""
        cutoff = now - timedelta(days=STALE_TENANT_DAYS)
        stalled = [
            t for t in tenants
            if t.status in (TenantStatus.PENDING, TenantStatus.ONBOARDING) and t.created_at < cutoff
        ]
        lead_of = {}
        if with_leads and stalled:
            lead_of = dict(self.db.execute(
                select(PlatformLead.tenant_id, PlatformLead.id)
                .where(PlatformLead.tenant_id.in_([t.id for t in stalled]))
            ).all())

        items: list[dict] = []
        for tenant in stalled:
            items.append({
                'kind': 'invite_stale' if tenant.status == TenantStatus.PENDING else 'onboarding_stuck',
                'count': 1, 'name': tenant.name, 'days': _days_since(tenant.created_at, now),
                'tenant_id': tenant.id, 'lead_id': lead_of.get(tenant.id),
            })
        for tenant in tenants:
            if tenant.status == TenantStatus.SUSPENDED:
                items.append({'kind': 'tenant_suspended', 'count': 1, 'name': tenant.name, 'tenant_id': tenant.id})
        return items

    def _grant_items(self, tenants: list[Tenant]) -> list[dict]:
        """Access requests the tenant's admin has not answered yet: nothing
        for the operator to do but wait — shown as information."""
        names = {t.id: t.name for t in tenants}
        rows = self.db.execute(
            select(TenantAccessGrant.tenant_id, TenantAccessGrant.requested_at)
            .where(TenantAccessGrant.status == TenantAccessGrantStatus.REQUESTED)
            .order_by(TenantAccessGrant.requested_at.asc())
        ).all()
        return [
            {'kind': 'access_request_pending', 'count': 1, 'name': names[tenant_id],
             'tenant_id': tenant_id, 'info_only': True}
            for tenant_id, _requested_at in rows if tenant_id in names
        ]

    # ── counts ────────────────────────────────────────────────────────────────

    @staticmethod
    def _tenant_counts(tenants: list[Tenant]) -> dict:
        counts = {status.value: 0 for status in _SHOWN}
        for tenant in tenants:
            counts[tenant.status.value] += 1
        return counts

    def _activity(self, now: datetime) -> dict:
        """Requests published over the last week, every live tenant together.
        Drafts are not published; a removed tenant is not counted."""
        cutoff = now - timedelta(days=ACTIVITY_DAYS)
        base = (
            select(func.count())
            .select_from(StaffingRequest)
            .join(Organization, StaffingRequest.organization_id == Organization.id)
            .join(Tenant, Organization.tenant_id == Tenant.id)
            .where(
                Tenant.status != TenantStatus.REMOVED,
                StaffingRequest.created_at > cutoff,
                StaffingRequest.status != RequestStatus.DRAFT,
            )
        )
        published = self.db.scalar(base) or 0
        filled = self.db.scalar(base.where(StaffingRequest.status.in_(_FILLED))) or 0
        expired = self.db.scalar(base.where(StaffingRequest.status == RequestStatus.EXPIRED)) or 0
        return {
            'days': ACTIVITY_DAYS,
            'published': published,
            'filled': filled,
            'expired': expired,
            'fill_rate': round(100 * filled / published) if published else None,
        }
