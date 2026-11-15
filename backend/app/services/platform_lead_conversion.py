"""« Invite as a network » — a sales lead becomes a tenant (SPEC_PLATFORM_LEADS §7).

All or nothing: the tenant, its first admin, the link on the lead, the
`invited` status and the feed event are one transaction. The invitation email
leaves only after the commit.

Lives apart from platform_lead_service because it needs TenantService, which
itself imports that module for the `won` hook.
"""
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import LeadStatus
from app.models.platform_lead import PlatformLead, PlatformLeadEvent
from app.models.tenant import Tenant
from app.schemas.platform_leads import LeadInvite
from app.schemas.tenant import TenantNetworkCreate
from app.services.tenant_service import TenantService


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Lead not found')
        if lead.tenant_id is not None:
            raise _conflict('This lead has already been invited as a network.')
        if lead.status in (LeadStatus.WON, LeadStatus.LOST):
            raise _conflict('A closed lead cannot be invited — reopen it first.')

        tenants = TenantService(self.db)
        # Slug and email clashes raise 409 here, before anything is written.
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
