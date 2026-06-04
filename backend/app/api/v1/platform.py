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
from app.auth.permissions import (
    require_platform_admin,
    require_platform_operator,
    require_platform_owner,
)
from app.auth.scope import AccessScope
from app.models.platform_operator import PlatformOperator
from app.models.user import User
from app.schemas.platform import (
    PlatformOperatorInvite,
    PlatformOperatorRead,
    PlatformOperatorRoleUpdate,
    PlatformOperatorsResponse,
    PlatformSettingsRead,
    PlatformSettingsUpdate,
    PlatformTenantCreate,
    PlatformTenantCreated,
    PlatformTenantsResponse,
)
from app.schemas.tenant import TenantNetworkCreate
from app.services.platform_operator_service import PlatformOperatorService
from app.services.platform_service import PlatformService
from app.services.platform_settings_service import PlatformSettingsService
from app.services.tenant_service import TenantService

router = APIRouter(dependencies=[Depends(require_platform_admin)])


def _operator_read(operator: PlatformOperator, user: User) -> PlatformOperatorRead:
    return PlatformOperatorRead(
        id=operator.id,
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        role=operator.role.value,
        mfa_enabled=operator.mfa_enabled,
        status='pending' if user.clerk_user_id is None else 'active',
        invited_at=operator.invited_at,
        last_active_at=operator.last_active_at,
    )


@router.get('/operators', response_model=PlatformOperatorsResponse)
def list_operators(
    scope: AccessScope = Depends(require_platform_operator),
    db: Session = Depends(get_db_session),
) -> PlatformOperatorsResponse:
    rows = PlatformOperatorService(db).list_operators()
    return PlatformOperatorsResponse(
        operators=[_operator_read(op, user) for op, user in rows],
        viewer_role=scope.platform_operator_role,
    )


@router.post('/operators', status_code=status.HTTP_201_CREATED, response_model=PlatformOperatorRead)
def invite_operator(
    payload: PlatformOperatorInvite,
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> PlatformOperatorRead:
    operator, user = PlatformOperatorService(db).invite(
        email=payload.email, role=payload.role,
        first_name=payload.first_name, last_name=payload.last_name,
        preferred_language=payload.preferred_language, scope=scope,
    )
    return _operator_read(operator, user)


@router.patch('/operators/{operator_id}', response_model=PlatformOperatorRead)
def change_operator_role(
    operator_id: UUID,
    payload: PlatformOperatorRoleUpdate,
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> PlatformOperatorRead:
    operator, user = PlatformOperatorService(db).change_role(operator_id, payload.role, scope)
    return _operator_read(operator, user)


@router.delete('/operators/{operator_id}', status_code=status.HTTP_204_NO_CONTENT)
def remove_operator(
    operator_id: UUID,
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> None:
    PlatformOperatorService(db).remove(operator_id, scope)


@router.post('/operators/{operator_id}/resend', response_model=PlatformOperatorRead)
def resend_operator_invite(
    operator_id: UUID,
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> PlatformOperatorRead:
    operator, user = PlatformOperatorService(db).resend_invite(operator_id, scope)
    return _operator_read(operator, user)


@router.get('/settings', response_model=PlatformSettingsRead)
def get_settings(db: Session = Depends(get_db_session)) -> PlatformSettingsRead:
    return PlatformSettingsRead.model_validate(PlatformSettingsService(db).get())


@router.patch('/settings', response_model=PlatformSettingsRead)
def update_settings(
    payload: PlatformSettingsUpdate,
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> PlatformSettingsRead:
    updated = PlatformSettingsService(db).update(payload.model_dump(exclude_unset=True), scope)
    return PlatformSettingsRead.model_validate(updated)


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
