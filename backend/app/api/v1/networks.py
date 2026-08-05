"""Tenant (network) management endpoints — platform admin only.

A platform admin creates a new tenant by supplying the business name +
slug + the first network admin's contact info. The new admin signs up
in Clerk separately; ``/auth/sync`` links their identity by email and
they land scoped to their own tenant.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_platform_admin, require_platform_operator_mfa
from app.auth.scope import AccessScope
from app.schemas.tenant import (
    TenantAdminRead,
    TenantNetworkCreate,
    TenantNetworkRead,
)
from app.services.tenant_service import TenantService

router = APIRouter(dependencies=[Depends(require_platform_admin)])


@router.get('')
def list_networks(
    db: Session = Depends(get_db_session),
) -> dict[str, list[TenantNetworkRead]]:
    rows = TenantService(db).list_all()
    items = [
        TenantNetworkRead(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            status=tenant.status.value,
            region=tenant.region,
            is_active=tenant.is_active,
            activated_at=tenant.activated_at,
            created_at=tenant.created_at,
            network_admin=TenantAdminRead.model_validate(admin) if admin else None,
        )
        for tenant, admin in rows
    ]
    return {'items': items}


@router.post('', status_code=201)
def create_network(
    payload: TenantNetworkCreate,
    scope: AccessScope = Depends(require_platform_admin),
    db: Session = Depends(get_db_session),
) -> TenantNetworkRead:
    tenant, admin = TenantService(db).create_network(payload, scope)
    return TenantNetworkRead(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        status=tenant.status.value,
        region=tenant.region,
        is_active=tenant.is_active,
        activated_at=tenant.activated_at,
        created_at=tenant.created_at,
        network_admin=TenantAdminRead.model_validate(admin),
    )


@router.delete('/{tenant_id}')
def remove_network(
    tenant_id: UUID,
    # Most destructive lifecycle mutation (cascades member deactivation +
    # Clerk deletion) — gate it like suspend/revoke: owner/operator with 2FA,
    # never `support`. Was the least-guarded route before this.
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> TenantNetworkRead:
    tenant = TenantService(db).remove_tenant(tenant_id, scope)
    return TenantNetworkRead(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        status=tenant.status.value,
        region=tenant.region,
        is_active=tenant.is_active,
        activated_at=tenant.activated_at,
        created_at=tenant.created_at,
        network_admin=None,
    )
