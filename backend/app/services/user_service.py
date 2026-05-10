from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.clerk import delete_clerk_user
from app.auth.scope import AccessScope
from app.models.enums import UserRole
from app.models.organization_membership import OrganizationMembership
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.services.audit_service import AuditService

# Marker for the email-tombstone applied on remove. The original email
# moves to the right of this marker so the unique-by-email constraint
# frees up for re-invitation while the audit log payload still carries
# the original. Kept short and unambiguous so future code can still
# parse it back if needed.
REMOVED_EMAIL_MARKER = '+removed-'


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)

    def remove(self, user_id: UUID, scope: AccessScope) -> User:
        """Soft-delete a user. Network admins can remove users in their
        own tenant; platform admins can remove anyone except other platform
        admins. The acting user can never remove themselves.

        Soft-delete sets ``is_active=False`` on the user and on all of
        their tenant + organization memberships. The Clerk identity is
        also deleted (best-effort) so the deactivated user can't keep
        using their existing Clerk session.
        """
        target = self.db.get(User, user_id)
        if target is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')

        if target.id == scope.user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='You cannot remove your own account.',
            )

        if target.role == UserRole.PLATFORM_ADMIN and not scope.is_platform_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Only a platform admin can remove a platform admin.',
            )

        if scope.is_network_admin:
            if not scope.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail='No tenant associated with your account.',
                )
            target_membership = self.db.scalar(
                select(TenantMembership).where(
                    TenantMembership.user_id == target.id,
                    TenantMembership.tenant_id == scope.tenant_id,
                    TenantMembership.is_active.is_(True),
                )
            )
            if target_membership is None:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail='Out of scope.',
                )

        original_email = target.email
        target.is_active = False
        # Free the email for future re-invitation. Insert a unique marker
        # in the local-part (before the '@') so the new email stays
        # syntactically valid for EmailStr but no longer collides with the
        # unique-by-email constraint. Original email is preserved in the
        # audit log payload below.
        if REMOVED_EMAIL_MARKER not in target.email:
            local, _, domain = original_email.partition('@')
            target.email = f'{local}{REMOVED_EMAIL_MARKER}{uuid4().hex[:12]}@{domain}'

        self.db.execute(
            update(TenantMembership)
            .where(TenantMembership.user_id == target.id)
            .values(is_active=False)
        )
        self.db.execute(
            update(OrganizationMembership)
            .where(OrganizationMembership.user_id == target.id)
            .values(is_active=False)
        )

        clerk_user_id = target.clerk_user_id
        clerk_deleted = True
        if clerk_user_id:
            clerk_deleted = delete_clerk_user(clerk_user_id)

        self.audit_service.log(
            action='user.removed',
            entity_type='user',
            entity_id=target.id,
            actor_user_id=scope.user.id,
            payload={
                'email': original_email,
                'role': target.role.value,
                'clerk_user_id': clerk_user_id,
                'clerk_deleted': clerk_deleted,
            },
        )

        self.db.commit()
        self.db.refresh(target)
        return target
