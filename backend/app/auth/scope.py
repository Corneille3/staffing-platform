"""Access scope resolution for row-level authorization.

Resolves the authenticated caller into their DB identity plus the set of
tenants/organizations they have access to. Repositories apply whichever
filter the caller's role implies:

  platform_admin  — sees everything across all tenants
  network_admin   — sees everything within their tenant
  org_admin       — sees their organizations within a tenant
  worker          — sees only their own data
"""

from dataclasses import dataclass, field
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.current_user import CurrentUserModel, get_current_user
from app.core.config import settings
from app.core.constants import ROLE_NETWORK_ADMIN, ROLE_ORG_ADMIN, ROLE_PLATFORM_ADMIN, ROLE_WORKER
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.platform_operator import PlatformOperator
from app.models.tenant_membership import TenantMembership
from app.models.user import User


@dataclass(slots=True)
class AccessScope:
    user: User
    tenant_id: UUID | None = None
    org_ids: list[UUID] = field(default_factory=list)
    # Tier-0 operator role (owner/operator/support) when the user is a platform
    # admin — adds granularity on top of is_platform_admin (PLATFORM_HANDOFF §1).
    platform_operator_role: str | None = None

    @property
    def is_platform_admin(self) -> bool:
        return self.user.role.value == ROLE_PLATFORM_ADMIN

    @property
    def is_platform_owner(self) -> bool:
        return self.platform_operator_role == 'owner'

    @property
    def is_network_admin(self) -> bool:
        return self.user.role.value == ROLE_NETWORK_ADMIN

    @property
    def is_org_admin(self) -> bool:
        return self.user.role.value == ROLE_ORG_ADMIN

    @property
    def is_worker(self) -> bool:
        return self.user.role.value == ROLE_WORKER

    @property
    def is_admin(self) -> bool:
        return not self.is_worker


def get_access_scope(
    current_user: CurrentUserModel = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> AccessScope:
    user = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
    if user is None and settings.app_env == 'dev' and settings.dev_auth_bypass and current_user.email:
        user = db.scalar(select(User).where(User.email == current_user.email))
        if user is not None and user.clerk_user_id is None:
            user.clerk_user_id = current_user.sub
            db.add(user)
            db.commit()
            db.refresh(user)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='User not provisioned. Call POST /api/v1/auth/sync first.',
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Account has been deactivated.',
        )

    role = user.role.value

    if role in (ROLE_PLATFORM_ADMIN, ROLE_NETWORK_ADMIN):
        # Platform admin = network admin of their primary tenant + the
        # extra capability to manage other tenants. ``tenant_id`` is
        # derived the same way as for a plain network admin so day-to-day
        # data queries (coordinators, substitutes, requests) stay scoped
        # to their tenant. Tenant-management endpoints check the role
        # itself via require_platform_admin.
        membership = db.scalar(
            select(TenantMembership).where(
                TenantMembership.user_id == user.id,
                TenantMembership.is_active.is_(True),
            )
        )
        operator_role = None
        if role == ROLE_PLATFORM_ADMIN:
            op_row = db.scalar(
                select(PlatformOperator).where(PlatformOperator.user_id == user.id)
            )
            operator_role = op_row.role.value if op_row else None
        return AccessScope(
            user=user,
            tenant_id=membership.tenant_id if membership else None,
            platform_operator_role=operator_role,
        )

    if role == ROLE_ORG_ADMIN:
        memberships = db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
        ).all()
        org_ids = [m.organization_id for m in memberships]
        tenant_id = None
        if org_ids:
            org = db.get(Organization, org_ids[0])
            if org:
                tenant_id = org.tenant_id
        return AccessScope(user=user, tenant_id=tenant_id, org_ids=org_ids)

    # WORKER
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.user_id == user.id,
            TenantMembership.is_active.is_(True),
        )
    )
    return AccessScope(user=user, tenant_id=membership.tenant_id if membership else None)
