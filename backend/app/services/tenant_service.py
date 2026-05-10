"""Tenant (network) management — platform admin operations.

A "tenant" is a customer business that runs the platform; each tenant has
its own isolated data and its own network admin. The first tenant (APF)
is bootstrapped via Alembic migration 20260507_0003. Additional tenants
are created here by a platform admin.

Creating a tenant atomically:
  1. ``Tenant`` row (with the supplied name + slug)
  2. ``User`` row for the first network admin (role=network_admin,
     ``clerk_user_id`` left NULL — they link on first sign-in)
  3. ``TenantMembership`` linking them
"""

from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import UserRole
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.tenant import TenantNetworkCreate
from app.services.audit_service import AuditService


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

    def list_all(self) -> list[tuple[Tenant, User | None]]:
        """All tenants + each tenant's primary network admin (if any)."""
        tenants = list(self.db.scalars(select(Tenant).order_by(Tenant.created_at.desc())).all())

        result: list[tuple[Tenant, User | None]] = []
        for tenant in tenants:
            admin = self.db.scalar(
                select(User)
                .join(TenantMembership, TenantMembership.user_id == User.id)
                .where(
                    TenantMembership.tenant_id == tenant.id,
                    TenantMembership.is_active.is_(True),
                    User.role == UserRole.NETWORK_ADMIN,
                    User.is_active.is_(True),
                )
                .order_by(User.created_at.asc())
                .limit(1)
            )
            result.append((tenant, admin))
        return result
