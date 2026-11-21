"""« Invite as a network » — a sales lead becomes a tenant (SPEC_PLATFORM_LEADS §7).

All or nothing: the tenant, its first admin, the link on the lead, the
`invited` status and the feed event are one transaction. The invitation email
leaves only after the commit.

Lives apart from platform_lead_service because it needs TenantService, which
itself imports that module for the `won` hook.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.errors import coded
from app.models.enums import LeadStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.models.tenant import Tenant
from app.schemas.platform_leads import LeadInvite
from app.schemas.tenant import TenantNetworkCreate
from app.services.platform_lead_service import lead_not_found
from app.services.tenant_service import TenantService


def _conflict(code: str, message: str, **params: object) -> HTTPException:
    return coded(status.HTTP_409_CONFLICT, f'lead.{code}', message, **params)


class LeadConversionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def invite(
        self, lead_id: UUID, payload: LeadInvite, scope: AccessScope,
    ) -> tuple[PlatformLead, Tenant]:
        # Row lock: two clicks on the button must not stage two tenants.
        lead = self.db.scalar(
            select(PlatformLead).where(PlatformLead.id == lead_id).with_for_update()
        )
        if lead is None:
            raise lead_not_found()
        if lead.tenant_id is not None:
            raise _conflict('already_invited', 'This lead has already been invited as a network.')
        if lead.status in (LeadStatus.WON, LeadStatus.LOST):
            raise _conflict('closed_cannot_be_invited', 'A closed lead cannot be invited — reopen it first.')

        tenants = TenantService(self.db)
        # Slug and email clashes are refused here, before anything is written,
        # with a code the bilingual modal can word (stage_network would raise
        # the console's English sentence).
        slug = payload.slug.strip().lower()
        clash = tenants.network_conflict(slug, payload.admin_email.lower())
        if clash is not None:
            raise _conflict(clash, {
                'slug_reserved': f'The slug "{slug}" is reserved and cannot be used.',
                'slug_taken': f'A tenant with slug "{slug}" already exists.',
                'email_taken': 'A user with that email already exists.',
            }[clash], slug=slug)
        tenant, admin = tenants.stage_network(
            TenantNetworkCreate(
                name=payload.name or lead.org_name,
                slug=payload.slug,
                region=payload.region,
                admin_first_name=payload.admin_first_name,
                admin_last_name=payload.admin_last_name,
                admin_email=payload.admin_email,
                admin_phone=payload.admin_phone,
                admin_preferred_language=payload.admin_preferred_language or lead.language,
            ),
            scope,
        )

        previous = lead.status
        lead.tenant_id = tenant.id
        lead.status = LeadStatus.INVITED
        lead.invited_at = datetime.now(timezone.utc)
        self.db.add(PlatformLeadEvent(
            lead_id=lead.id, type='invited', actor_id=scope.user.id,
            from_status=previous, to_status=LeadStatus.INVITED,
            body=f'{tenant.name} ({tenant.slug}) — {admin.email}',
        ))

        self.db.commit()
        self.db.refresh(lead)
        self.db.refresh(tenant)
        self.db.refresh(admin)
        tenants.send_invite_email(admin, tenant)
        return lead, tenant
