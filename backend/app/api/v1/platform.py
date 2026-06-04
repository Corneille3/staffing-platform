"""Platform-operator (tier 0) endpoints — MULTITENANCY_HANDOFF §5.

Mounted at /api/v1/platform, platform_admin only. The read endpoint returns
aggregate counts ONLY (privacy boundary §5.2) — it routes through PlatformService,
which deliberately cannot return worker/request/shift rows. Lifecycle mutations
delegate to TenantService.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_platform_admin
from app.auth.scope import AccessScope
from app.schemas.platform import (
    PlatformTenantCreate,
    PlatformTenantCreated,
    PlatformTenantsResponse,
)
from app.schemas.tenant import TenantNetworkCreate
from app.services.platform_service import PlatformService
from app.services.tenant_service import TenantService

router = APIRouter(dependencies=[Depends(require_platform_admin)])


@router.get('/tenants', response_model=PlatformTenantsResponse)
def list_tenants(db: Session = Depends(get_db_session)) -> PlatformTenantsResponse:
    return PlatformTenantsResponse(**PlatformService(db).tenants_overview())


@router.post('/tenants', status_code=status.HTTP_201_CREATED, response_model=PlatformTenantCreated)
def invite_tenant(
    payload: PlatformTenantCreate,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant, _admin = TenantService(db).create_network(
        TenantNetworkCreate(**payload.model_dump()), scope,
    )
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/suspend', response_model=PlatformTenantCreated)
def suspend_tenant(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).suspend(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/reactivate', response_model=PlatformTenantCreated)
def reactivate_tenant(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).reactivate(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/resend', response_model=PlatformTenantCreated)
def resend_invite(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).resend_invite(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/revoke', response_model=PlatformTenantCreated)
def revoke_invite(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).revoke_invite(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)
