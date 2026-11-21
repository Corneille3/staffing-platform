"""Platform-operator (tier 0) endpoints — MULTITENANCY_HANDOFF §5.

Mounted at /api/v1/platform, platform_admin only. The read endpoint returns
aggregate counts ONLY (privacy boundary §5.2) — it routes through PlatformService,
which deliberately cannot return worker/request/shift rows. Lifecycle mutations
delegate to TenantService.
"""
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import (
    require_platform_admin,
    require_platform_operator,
    require_platform_operator_mfa,
    require_platform_owner,
)
from app.auth.scope import AccessScope
from app.models.platform_operator import PlatformOperator
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.platform import (
    OrphanRemovePayload,
    OrphanScanResponse,
    PlatformAuditResponse,
    PlatformOperatorInvite,
    PlatformOperatorRead,
    PlatformOperatorRoleUpdate,
    PlatformOperatorsResponse,
    PlatformSettingsRead,
    PlatformSettingsUpdate,
    PlatformTenantCreate,
    PlatformTenantCreated,
    PlatformTenantsResponse,
    TenantAccessGrantRead,
    TenantAccessGrantsResponse,
    TenantAccessRequestCreate,
)
from app.schemas.tenant import TenantNetworkCreate, TenantRemoval
from app.services.housekeeping_service import HousekeepingService
from app.services.platform_audit_service import AUDIT_CATEGORIES, PlatformAuditService
from app.services.platform_operator_service import PlatformOperatorService
from app.services.platform_service import PlatformService
from app.services.platform_settings_service import PlatformSettingsService
from app.services.tenant_access_service import TenantAccessService
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
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant, _admin = TenantService(db).create_network(
        TenantNetworkCreate(**payload.model_dump()), scope,
    )
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post(
    '/tenants/{tenant_id}/access-request',
    status_code=status.HTTP_201_CREATED,
    response_model=TenantAccessGrantRead,
)
def request_tenant_access(
    tenant_id: UUID,
    payload: TenantAccessRequestCreate,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantRead:
    """§2.2 — any operator role may ask (2FA required; checked in the service)."""
    grant = TenantAccessService(db).request(tenant_id, payload.reason, scope)
    tenant = db.get(Tenant, tenant_id)
    return TenantAccessGrantRead.from_row(grant, scope.user, tenant)


@router.get('/access-grants', response_model=TenantAccessGrantsResponse)
def list_access_grants(
    scope: AccessScope = Depends(require_platform_operator),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantsResponse:
    """Every grant, platform-wide — operator emails + visit reasons, so it
    follows the operator-list visibility policy (owner/operator, not support;
    P6 of the 2026-10-25 review). `support` still sees their own requests on
    the tenant rows, and release stays open to every role."""
    grants, active = TenantAccessService(db).list_for_platform()
    return TenantAccessGrantsResponse(
        grants=[TenantAccessGrantRead.from_row(g, u, t) for g, u, t in grants],
        active_count=active,
    )


@router.post('/access-grants/release', response_model=TenantAccessGrantRead)
def release_access_grant(
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> TenantAccessGrantRead:
    """§2.2 — the operator ends their own current visit early. No id needed:
    the single-visit invariant means there is at most one active grant."""
    grant = TenantAccessService(db).release_current(scope)
    return TenantAccessGrantRead.from_row(grant, scope.user, db.get(Tenant, grant.tenant_id))


@router.post('/tenants/{tenant_id}/suspend', response_model=PlatformTenantCreated)
def suspend_tenant(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).suspend(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/reactivate', response_model=PlatformTenantCreated)
def reactivate_tenant(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).reactivate(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/resend', response_model=PlatformTenantCreated)
def resend_invite(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).resend_invite(tenant_id, scope)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)


@router.post('/tenants/{tenant_id}/revoke', response_model=PlatformTenantCreated)
def revoke_invite(
    tenant_id: UUID,
    scope: AccessScope = Depends(require_platform_operator_mfa),
    # Same rule as the removal: a reason when the invite came from a lead.
    payload: TenantRemoval | None = Body(default=None),
    db: Session = Depends(get_db_session),
) -> PlatformTenantCreated:
    tenant = TenantService(db).revoke_invite(tenant_id, scope, payload.reason if payload else None)
    return PlatformTenantCreated(id=tenant.id, slug=tenant.slug, status=tenant.status.value)

@router.get('/audit-log', response_model=PlatformAuditResponse)
def list_audit_log(
    category: str | None = Query(default=None),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    scope: AccessScope = Depends(require_platform_operator),
    db: Session = Depends(get_db_session),
) -> PlatformAuditResponse:
    """The tier-0 audit trail, newest first — **owner only**: it names every
    operator, what they did and to which network. A read, so no 2FA gate
    (same policy as the operator list)."""
    if not scope.is_platform_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Only a platform owner can read the audit trail.',
        )
    if category is not None and category not in AUDIT_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Unknown category "{category}".',
        )
    rows, total = PlatformAuditService(db).list_rows(category, limit, offset)
    return PlatformAuditResponse(rows=rows, total=total)


@router.get('/housekeeping/orphans', response_model=OrphanScanResponse)
def scan_orphans(
    scope: AccessScope = Depends(require_platform_operator),
    db: Session = Depends(get_db_session),
) -> OrphanScanResponse:
    """Housekeeping scan — diff Clerk accounts against DB users and surface
    both orphan species. Read-only, but exposes emails platform-wide, so it
    follows the operator-list visibility policy (owner/operator, not support)."""
    return HousekeepingService(db).scan()


@router.post('/housekeeping/orphans/remove', response_model=OrphanScanResponse)
def remove_orphan(
    payload: OrphanRemovePayload,
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> OrphanScanResponse:
    """One-click cleanup for a scanned orphan. Destructive → same gate as
    tenant lifecycle mutations. Returns a fresh scan so the UI list stays
    honest without a second round-trip."""
    service = HousekeepingService(db)
    if payload.kind == 'clerk':
        service.remove_clerk_orphan(payload.id, scope)
    else:
        try:
            user_id = UUID(payload.id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='A db-kind orphan id must be a user UUID.',
            )
        service.remove_db_orphan(user_id, scope)
    return service.scan()
