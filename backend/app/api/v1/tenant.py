"""Tenant-admin self-service endpoints — the onboarding wizard + workspace
profile (MULTITENANCY_HANDOFF §6). Scoped to the caller's own tenant; steps 2-4
of the wizard reuse the existing org-create / coordinator-invite / worker-invite
endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope
from app.schemas.tenant import TenantProfileRead, TenantProfileUpdate
from app.services.tenant_service import TenantService

router = APIRouter(dependencies=[Depends(require_network_admin)])


@router.get('/profile', response_model=TenantProfileRead)
def get_profile(
    scope: AccessScope = Depends(require_network_admin),
    db: Session = Depends(get_db_session),
) -> TenantProfileRead:
    return TenantProfileRead.model_validate(TenantService(db).get_profile(scope))


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
