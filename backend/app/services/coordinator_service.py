from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.coordinator import CoordinatorInviteCreate
from app.services.audit_service import AuditService


class CoordinatorService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)

    def invite(self, payload: CoordinatorInviteCreate, scope: AccessScope) -> tuple[User, list[Organization]]:
        if not scope.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='No tenant associated with your account.',
            )
        if not payload.org_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='At least one organization must be assigned.',
            )

        existing = self.db.scalar(select(User).where(User.email == payload.email))
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='A user with that email already exists.',
            )

        # Verify all orgs belong to this tenant
        orgs = list(self.db.scalars(
            select(Organization).where(
                Organization.id.in_(payload.org_ids),
                Organization.tenant_id == scope.tenant_id,
            )
        ).all())
        if len(orgs) != len(payload.org_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='One or more organizations are not in your tenant.',
            )

        user = User(
            id=uuid4(),
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=payload.email,
            phone=payload.phone,
            role=UserRole.ORG_ADMIN,
            preferred_language=payload.preferred_language,
        )
        self.db.add(user)
        self.db.flush()

        self.db.add(TenantMembership(
            id=uuid4(),
            user_id=user.id,
            tenant_id=scope.tenant_id,
            role=UserRole.ORG_ADMIN,
        ))

        for org in orgs:
            self.db.add(OrganizationMembership(
                id=uuid4(),
                user_id=user.id,
                organization_id=org.id,
                role=UserRole.ORG_ADMIN,
            ))

        self.audit_service.log(
            action='coordinator.invited',
            entity_type='user',
            entity_id=user.id,
            actor_user_id=scope.user.id,
            payload={
                'email': payload.email,
                'tenant_id': str(scope.tenant_id),
                'org_ids': [str(oid) for oid in payload.org_ids],
            },
        )
        self.db.commit()
        self.db.refresh(user)
        return user, orgs

    def list_for_tenant(self, tenant_id: UUID) -> list[tuple[User, list[Organization]]]:
        # All org_admin users that have a membership in any org under this tenant
        tenant_org_ids = list(self.db.scalars(
            select(Organization.id).where(Organization.tenant_id == tenant_id)
        ).all())
        if not tenant_org_ids:
            return []

        memberships = list(self.db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id.in_(tenant_org_ids),
                OrganizationMembership.is_active.is_(True),
            )
        ).all())

        # Group by user_id
        user_org_ids: dict[UUID, list[UUID]] = {}
        for m in memberships:
            user_org_ids.setdefault(m.user_id, []).append(m.organization_id)

        if not user_org_ids:
            return []

        users = list(self.db.scalars(
            select(User).where(
                User.id.in_(list(user_org_ids.keys())),
                User.role == UserRole.ORG_ADMIN,
            ).order_by(User.last_name, User.first_name)
        ).all())

        orgs_by_id = {o.id: o for o in self.db.scalars(
            select(Organization).where(Organization.id.in_(tenant_org_ids))
        ).all()}

        return [
            (u, [orgs_by_id[oid] for oid in user_org_ids.get(u.id, []) if oid in orgs_by_id])
            for u in users
        ]
