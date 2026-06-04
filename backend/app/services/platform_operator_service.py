"""Tier-0 operator management — PLATFORM_HANDOFF §2.1.

The most security-sensitive surface in the product: the list of every
platform operator. Mutations are owner-only (enforced at the route), with
two lock-out rules enforced here:

  - an operator cannot remove themselves;
  - the last owner can never be removed or demoted.

Every change writes the platform audit trail (§4). Invites follow the
DB-owns-roles pattern: a User row (role=platform_admin, clerk_user_id NULL)
plus a PlatformOperator row; the invitee signs up with the invited email and
/auth/sync links them.
"""
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.clerk import delete_clerk_user
from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.enums import PlatformOperatorRole, UserRole
from app.models.platform_operator import PlatformOperator
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.services.platform_audit_service import PlatformAuditService
from app.services.user_service import REMOVED_EMAIL_MARKER


class PlatformOperatorService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = PlatformAuditService(db)
        self.email = EmailNotificationService()

    # ── queries ───────────────────────────────────────────────────────────────

    def list_operators(self) -> list[tuple[PlatformOperator, User]]:
        rows = self.db.execute(
            select(PlatformOperator, User)
            .join(User, User.id == PlatformOperator.user_id)
            .where(User.is_active.is_(True))
            .order_by(PlatformOperator.invited_at.asc())
        ).all()
        return [(op, user) for op, user in rows]

    def _get_or_404(self, operator_id: UUID) -> tuple[PlatformOperator, User]:
        row = self.db.execute(
            select(PlatformOperator, User)
            .join(User, User.id == PlatformOperator.user_id)
            .where(PlatformOperator.id == operator_id, User.is_active.is_(True))
        ).first()
        if row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Operator not found')
        return row[0], row[1]

    def _owner_count(self) -> int:
        return self.db.scalar(
            select(func.count())
            .select_from(PlatformOperator)
            .join(User, User.id == PlatformOperator.user_id)
            .where(
                PlatformOperator.role == PlatformOperatorRole.OWNER,
                User.is_active.is_(True),
            )
        ) or 0

    # ── mutations (owner-only at the route) ──────────────────────────────────

    def invite(
        self, email: str, role: str, first_name: str, last_name: str,
        preferred_language: str, scope: AccessScope,
    ) -> tuple[PlatformOperator, User]:
        email = email.lower()
        if self.db.scalar(select(User).where(User.email == email)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='A user with that email already exists.',
            )

        user = User(
            id=uuid4(),
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            email=email,
            role=UserRole.PLATFORM_ADMIN,
            preferred_language=preferred_language,
            is_active=True,
        )
        self.db.add(user)
        self.db.flush()

        operator = PlatformOperator(
            id=uuid4(), user_id=user.id, role=PlatformOperatorRole(role),
        )
        self.db.add(operator)
        self.db.flush()

        self.audit.log(
            actor_user_id=scope.user.id, action='operator.invited',
            target_type='operator', target_id=str(operator.id),
            payload={'email': email, 'role': role},
        )
        self.db.commit()
        self.db.refresh(operator)
        self.db.refresh(user)

        # Invitation email is best-effort — the operator row already exists.
        try:
            self._send_invite_email(user)
        except Exception:  # pragma: no cover - never block creation on email
            pass

        return operator, user

    def change_role(
        self, operator_id: UUID, new_role: str, scope: AccessScope
    ) -> tuple[PlatformOperator, User]:
        operator, user = self._get_or_404(operator_id)
        old_role = operator.role
        if old_role.value == new_role:
            return operator, user

        if old_role == PlatformOperatorRole.OWNER and self._owner_count() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You can't demote the last owner.",
            )

        operator.role = PlatformOperatorRole(new_role)
        self.audit.log(
            actor_user_id=scope.user.id, action='operator.role_changed',
            target_type='operator', target_id=str(operator.id),
            payload={'email': user.email, 'from': old_role.value, 'to': new_role},
        )
        self.db.commit()
        self.db.refresh(operator)
        return operator, user

    def remove(self, operator_id: UUID, scope: AccessScope) -> None:
        operator, user = self._get_or_404(operator_id)

        if user.id == scope.user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You can't remove yourself.",
            )
        if operator.role == PlatformOperatorRole.OWNER and self._owner_count() <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You can't remove the last owner.",
            )

        # Same soft-delete shape as UserService.remove: deactivate + tombstone
        # the email (frees it for re-invite) + best-effort Clerk delete.
        original_email = user.email
        if REMOVED_EMAIL_MARKER not in user.email:
            local, _, domain = original_email.partition('@')
            user.email = f'{local}{REMOVED_EMAIL_MARKER}{uuid4().hex[:12]}@{domain}'
        user.is_active = False
        if user.clerk_user_id:
            delete_clerk_user(user.clerk_user_id)

        self.db.delete(operator)
        self.audit.log(
            actor_user_id=scope.user.id, action='operator.removed',
            target_type='operator', target_id=str(operator_id),
            payload={'email': original_email, 'role': operator.role.value},
        )
        self.db.commit()

    def resend_invite(self, operator_id: UUID, scope: AccessScope) -> tuple[PlatformOperator, User]:
        operator, user = self._get_or_404(operator_id)
        if user.clerk_user_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='This operator has already accepted their invite.',
            )
        self._send_invite_email(user)
        self.audit.log(
            actor_user_id=scope.user.id, action='operator.invite_resent',
            target_type='operator', target_id=str(operator.id),
            payload={'email': user.email},
        )
        self.db.commit()
        return operator, user

    # ── email ─────────────────────────────────────────────────────────────────

    def _portal_url(self) -> str:
        if settings.allowed_origins:
            return settings.allowed_origins[0].rstrip('/')
        return 'http://localhost:3000'

    def _send_invite_email(self, user: User) -> None:
        """Best-effort sign-up link, same flow as tenant invites: the invitee
        signs up with this email and /auth/sync links their Clerk identity."""
        signup_url = f'{self._portal_url()}/sign-up?email_address={quote(user.email)}'
        fr = (
            f'Bonjour {user.first_name},\n\n'
            f"Vous avez été invité(e) à rejoindre l'équipe d'opération de Staffig.\n\n"
            f'Créez votre compte avec cette adresse courriel :\n'
            f'{signup_url}\n'
        )
        en = (
            f'Hello {user.first_name},\n\n'
            f'You have been invited to join the StaffiG operations team.\n\n'
            f'Create your account with this email address:\n'
            f'{signup_url}\n'
        )
        subject = localized_subject(
            user.preferred_language,
            "[Staffig] Invitation à rejoindre l'équipe Staffig",
            '[Staffig] Join the StaffiG operations team',
        )
        self.email.send(EmailMessage(
            to_email=user.email,
            subject=subject,
            body=localized(user.preferred_language, fr, en),
        ))
