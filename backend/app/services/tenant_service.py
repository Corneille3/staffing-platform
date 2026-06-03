"""Tenant (network) management — platform admin operations.

A "tenant" is a customer business that runs the platform; each tenant has
its own isolated data and its own network admin. The first tenant (APF)
is bootstrapped via Alembic migration 20260507_0003. Additional tenants
are created and (soft-)deleted here by a platform admin.

Creating a tenant atomically:
  1. ``Tenant`` row (with the supplied name + slug)
  2. ``User`` row for the first network admin (role=network_admin,
     ``clerk_user_id`` left NULL — they link on first sign-in)
  3. ``TenantMembership`` linking them

Removing a tenant cascades: every active member of the tenant is
soft-deleted the same way ``UserService.remove`` does it (is_active
flipped, email tombstoned, memberships deactivated, Clerk identity
deleted best-effort). The Tenant row itself is set is_active=False —
data is preserved for audit but the tenant is no longer operational.
"""

from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.clerk import delete_clerk_user
from app.auth.scope import AccessScope
from app.models.enums import TenantStatus, UserRole
from app.models.organization_membership import OrganizationMembership
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.tenant import TenantNetworkCreate
from app.services.audit_service import AuditService
from app.services.user_service import REMOVED_EMAIL_MARKER


class TenantService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)

    def create_network(
        self, payload: TenantNetworkCreate, scope: AccessScope
    ) -> tuple[Tenant, User]:
        slug = payload.slug.strip().lower()
        admin_email = payload.admin_email.lower()

        if self.db.scalar(select(Tenant).where(Tenant.slug == slug)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'A tenant with slug "{slug}" already exists.',
            )

        if self.db.scalar(select(User).where(User.email == admin_email)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='A user with that email already exists.',
            )

        tenant = Tenant(
            id=uuid4(),
            name=payload.name.strip(),
            slug=slug,
            region=payload.region.strip() if payload.region else None,
            # Invited tenant starts PENDING — it goes ONBOARDING when the admin
            # signs up and ACTIVE when they finish the wizard (P2).
            status=TenantStatus.PENDING,
            is_active=True,
        )
        self.db.add(tenant)
        self.db.flush()

        admin = User(
            id=uuid4(),
            first_name=payload.admin_first_name.strip(),
            last_name=payload.admin_last_name.strip(),
            email=admin_email,
            phone=payload.admin_phone.strip() if payload.admin_phone else None,
            role=UserRole.NETWORK_ADMIN,
            preferred_language=payload.admin_preferred_language,
            is_active=True,
        )
        self.db.add(admin)
        self.db.flush()

        self.db.add(TenantMembership(
            id=uuid4(),
            user_id=admin.id,
            tenant_id=tenant.id,
            role=UserRole.NETWORK_ADMIN,
            is_active=True,
        ))

        self.audit_service.log(
            action='tenant.created',
            entity_type='tenant',
            entity_id=tenant.id,
            actor_user_id=scope.user.id,
            payload={
                'tenant_name': tenant.name,
                'tenant_slug': tenant.slug,
                'admin_email': admin.email,
                'admin_user_id': str(admin.id),
            },
        )

        self.db.commit()
        self.db.refresh(tenant)
        self.db.refresh(admin)
        return tenant, admin

    def remove_tenant(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        """Soft-delete a tenant and cascade-deactivate every member.

        Refuses to delete the tenant the acting user is a member of
        (prevents the platform admin from locking themselves out of their
        primary tenant).
        """
        tenant = self.db.get(Tenant, tenant_id)
        if tenant is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Network not found')

        actor_membership = self.db.scalar(
            select(TenantMembership).where(
                TenantMembership.user_id == scope.user.id,
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.is_active.is_(True),
            )
        )
        if actor_membership is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='You cannot remove your own network. Hand it off to another '
                       'platform admin first.',
            )

        members = list(self.db.scalars(
            select(User)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.is_active.is_(True),
                User.is_active.is_(True),
            )
        ).unique().all())

        for member in members:
            original_email = member.email
            if REMOVED_EMAIL_MARKER not in member.email:
                local, _, domain = original_email.partition('@')
                member.email = f'{local}{REMOVED_EMAIL_MARKER}{uuid4().hex[:12]}@{domain}'
            member.is_active = False

            if member.clerk_user_id:
                delete_clerk_user(member.clerk_user_id)

            self.audit_service.log(
                action='user.removed',
                entity_type='user',
                entity_id=member.id,
                actor_user_id=scope.user.id,
                payload={
                    'email': original_email,
                    'role': member.role.value,
                    'clerk_user_id': member.clerk_user_id,
                    'reason': 'tenant.removed',
                    'tenant_id': str(tenant_id),
                },
            )

        # Cascade: every TenantMembership and OrganizationMembership tied to
        # this tenant goes inactive. (For OrganizationMemberships, scope
        # through Organization → tenant_id since OrganizationMembership has
        # no direct tenant_id column.)
        self.db.execute(
            update(TenantMembership)
            .where(TenantMembership.tenant_id == tenant_id)
            .values(is_active=False)
        )
        self.db.execute(
            update(OrganizationMembership)
            .where(OrganizationMembership.user_id.in_(
                select(User.id)
                .join(TenantMembership, TenantMembership.user_id == User.id)
                .where(TenantMembership.tenant_id == tenant_id)
            ))
            .values(is_active=False)
        )

        tenant.is_active = False

        self.audit_service.log(
            action='tenant.removed',
            entity_type='tenant',
            entity_id=tenant.id,
            actor_user_id=scope.user.id,
            payload={
                'tenant_name': tenant.name,
                'tenant_slug': tenant.slug,
                'cascaded_member_count': len(members),
            },
        )

        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def list_all(self) -> list[tuple[Tenant, User | None]]:
        """All tenants + each tenant's primary admin (if any).

        Either a ``network_admin`` or a ``platform_admin`` counts — the
        first APF admin is a platform_admin after migration 20260510_0004
        but is still the operational admin of the APF tenant via their
        active TenantMembership. The lookup picks the oldest active
        membership-holder per tenant.
        """
        tenants = list(self.db.scalars(select(Tenant).order_by(Tenant.created_at.desc())).all())

        result: list[tuple[Tenant, User | None]] = []
        for tenant in tenants:
            admin = self.db.scalar(
                select(User)
                .join(TenantMembership, TenantMembership.user_id == User.id)
                .where(
                    TenantMembership.tenant_id == tenant.id,
                    TenantMembership.is_active.is_(True),
                    User.role.in_([UserRole.NETWORK_ADMIN, UserRole.PLATFORM_ADMIN]),
                    User.is_active.is_(True),
                )
                .order_by(User.created_at.asc())
                .limit(1)
            )
            result.append((tenant, admin))
        return result
