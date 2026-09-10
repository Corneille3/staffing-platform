from __future__ import annotations

from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.coordinator import CoordinatorInviteCreate
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.services.audit_service import AuditService


class CoordinatorService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)
        self.email = EmailNotificationService()

    def _portal_url(self) -> str:
        if settings.allowed_origins:
            return settings.allowed_origins[0].rstrip('/')
        return 'http://localhost:3000'

    def _send_invite_email(self, user: User, orgs: list[Organization]) -> None:
        portal_url = self._portal_url()
        signup_url = f'{portal_url}/sign-up?email_address={quote(user.email)}'
        org_names = ', '.join(org.name for org in orgs) if orgs else 'your assigned organization(s)'
        org_names_fr = ', '.join(org.name for org in orgs) if orgs else 'votre/vos organisation(s) assignée(s)'

        fr = (
            f'Bonjour {user.first_name},\n\n'
            f'Vous avez été invité(e) à coordonner {org_names_fr}.\n\n'
            f'Créez votre compte Staffig avec cette adresse courriel :\n'
            f'{signup_url}\n\n'
            f'Lors de votre inscription, la plateforme reliera automatiquement votre compte à votre rôle.\n'
        )
        en = (
            f'Hello {user.first_name},\n\n'
            f'You have been invited as a coordinator for {org_names}.\n\n'
            f'Create your Staffig account with this email address:\n'
            f'{signup_url}\n\n'
            f'When you sign up, the platform will link your account to your assigned role automatically.\n'
        )
        subject = localized_subject(
            user.preferred_language,
            f'[Staffig] Invitation à coordonner {org_names_fr}',
            f'[Staffig] Invitation to coordinate {org_names}',
        )
        body = localized(user.preferred_language, fr, en)
        self.email.send(EmailMessage(to_email=user.email, subject=subject, body=body))

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
        try:
            self._send_invite_email(user, orgs)
        except Exception:
            # Invitation creation is the primary action; email delivery is best-effort.
            pass
        return user, orgs

    def list_for_tenant(self, tenant_id: UUID) -> list[tuple[User, list[Organization]]]:
        # Active org_admin users holding an active membership in an org under
        # this tenant. Removed coordinators (soft-deleted: ``User.is_active``
        # False, memberships deactivated) are left out of the listing — the
        # trail lives in the audit log (``user.removed``, surfaced by the APF
        # activity feed's "removals" chip), and a removed account has no
        # reactivation path (its email is tombstoned with a hash suffix).
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

        user_org_ids: dict[UUID, list[UUID]] = {}
        for m in memberships:
            user_org_ids.setdefault(m.user_id, []).append(m.organization_id)

        if not user_org_ids:
            return []

        users = list(self.db.scalars(
            select(User).where(
                User.id.in_(list(user_org_ids)),
                User.role == UserRole.ORG_ADMIN,
                User.is_active.is_(True),
            ).order_by(User.last_name, User.first_name)
        ).all())

        orgs_by_id = {o.id: o for o in self.db.scalars(
            select(Organization).where(Organization.id.in_(tenant_org_ids))
        ).all()}

        return [
            (u, [orgs_by_id[oid] for oid in user_org_ids.get(u.id, []) if oid in orgs_by_id])
            for u in users
        ]
