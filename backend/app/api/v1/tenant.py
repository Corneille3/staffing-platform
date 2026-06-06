"""Tenant-admin self-service endpoints — the onboarding wizard + workspace
profile (MULTITENANCY_HANDOFF §6), plus the consent side of platform access
grants (PLATFORM_HANDOFF §2.2). Scoped to the caller's own tenant; steps 2-4
of the wizard reuse the existing org-create / coordinator-invite / worker-invite
endpoints.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope
from app.models.enums import TenantAccessGrantStatus
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.models.user import User
from app.schemas.platform import TenantAccessGrantRead, TenantAccessGrantsResponse
from app.schemas.tenant import TenantProfileRead, TenantProfileUpdate
from app.services.tenant_access_service import TenantAccessService
from app.services.tenant_service import TenantService

router = APIRouter(dependencies=[Depends(require_network_admin)])


def _grant_read(db: Session, grant: TenantAccessGrant) -> TenantAccessGrantRead:
    return TenantAccessGrantRead.from_row(
        grant, db.get(User, grant.operator_user_id), db.get(Tenant, grant.tenant_id),
    )


@router.get('/profile', response_model=TenantProfileRead)
def get_profile(
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantProfileRead:
    profile = TenantProfileRead.model_validate(TenantService(db).get_profile(scope))
    # Tell the workspace UI whether this is a §2.2 grant visit (read-only
    # chrome) or the caller's own tenant.
    profile.via_grant = scope.grant_access
    return profile


@router.patch('/profile', response_model=TenantProfileRead)
def update_profile(
    payload: TenantProfileUpdate,
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantProfileRead:
    return TenantProfileRead.model_validate(TenantService(db).update_profile(payload, scope))


@router.post('/onboarding/complete', response_model=TenantProfileRead)
def complete_onboarding(
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantProfileRead:
    return TenantProfileRead.model_validate(TenantService(db).complete_onboarding(scope))


# ── platform access grants — the tenant gives (or refuses) consent (§2.2) ─────

@router.get('/access-grants', response_model=TenantAccessGrantsResponse)
def list_access_grants(
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantsResponse:
    rows = TenantAccessService(db).list_for_tenant(scope)
    return TenantAccessGrantsResponse(
        grants=[TenantAccessGrantRead.from_row(g, u, t) for g, u, t in rows],
        active_count=sum(1 for g, _, _ in rows if g.status == TenantAccessGrantStatus.ACTIVE),
    )


@router.post('/access-grants/{grant_id}/approve', response_model=TenantAccessGrantRead)
def approve_access_grant(
    grant_id: UUID,
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantRead:
    return _grant_read(db, TenantAccessService(db).approve(grant_id, scope))


@router.post('/access-grants/{grant_id}/deny', response_model=TenantAccessGrantRead)
def deny_access_grant(
    grant_id: UUID,
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantRead:
    return _grant_read(db, TenantAccessService(db).deny(grant_id, scope))
