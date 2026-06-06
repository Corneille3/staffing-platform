"""Tenant access grants — the logged, consented, time-boxed exception to the
tier-0 privacy boundary (PLATFORM_HANDOFF §2.2).

Flow: a platform operator requests access to ONE tenant with a reason → the
tenant admin approves (or denies) from inside their workspace → the operator
gets read-only access until ``expires_at`` → the grant auto-expires.

Consent stays with the tenant: an operator can never approve their own
request, and a grant-based scope cannot approve grants for the tenant it is
visiting (see ``approve``). Both audit trails record every step.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.enums import TenantAccessGrantStatus, UserRole
from app.models.platform_operator import PlatformOperator
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.services.audit_service import AuditService
from app.services.platform_audit_service import PlatformAuditService
from app.services.platform_settings_service import PlatformSettingsService


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TenantAccessService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)
        self.platform_audit = PlatformAuditService(db)
        self.email = EmailNotificationService()

    # ── platform side ─────────────────────────────────────────────────────────

    def request(self, tenant_id: UUID, reason: str, scope: AccessScope) -> TenantAccessGrant:
        operator = self.db.scalar(
            select(PlatformOperator).where(PlatformOperator.user_id == scope.user.id)
        )
        if operator is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Only a platform operator can request tenant access.',
            )
        # §1: no 2FA → no access elevation, for every operator role.
        # (PLATFORM_MFA_ENFORCED=false relaxes this — Clerk MFA is a paid
        # feature on production instances; see auth/permissions.py.)
        if settings.platform_mfa_enforced and not operator.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Enable two-factor authentication before requesting tenant access.',
            )

        tenant = self.db.get(Tenant, tenant_id)
        if tenant is None or not tenant.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Tenant not found')

        # Members already see their own tenant — a grant would add nothing.
        membership = self.db.scalar(
            select(TenantMembership).where(
                TenantMembership.user_id == scope.user.id,
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.is_active.is_(True),
            )
        )
        if membership is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='You are already a member of this tenant.',
            )

        self.expire_stale()
        existing = self.db.scalar(
            select(TenantAccessGrant).where(
                TenantAccessGrant.operator_user_id == scope.user.id,
                TenantAccessGrant.tenant_id == tenant_id,
                TenantAccessGrant.status.in_([
                    TenantAccessGrantStatus.REQUESTED,
                    TenantAccessGrantStatus.ACTIVE,
                ]),
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='You already have a pending or active request for this tenant.',
            )
        self._guard_single_active_visit(scope.user.id)

        platform_settings = PlatformSettingsService(self.db).get()
        grant = TenantAccessGrant(
            id=uuid4(),
            operator_user_id=scope.user.id,
            tenant_id=tenant_id,
            reason=reason.strip(),
        )
        if platform_settings.access_requires_approval:
            grant.status = TenantAccessGrantStatus.REQUESTED
        else:
            # Approval toggle OFF → straight to a time-boxed session.
            grant.status = TenantAccessGrantStatus.ACTIVE
            grant.expires_at = _utcnow() + timedelta(hours=platform_settings.access_window_hours)
        self.db.add(grant)
        self.db.flush()

        self.platform_audit.log(
            actor_user_id=scope.user.id, action='access.requested',
            target_type='grant', target_id=str(grant.id),
            payload={'tenant_id': str(tenant_id), 'reason': grant.reason,
                     'auto_approved': not platform_settings.access_requires_approval},
        )
        # The tenant's own trail too — they should see who asked, and when.
        self.audit_service.log(
            action='platform_access.requested', entity_type='tenant', entity_id=tenant_id,
            actor_user_id=scope.user.id,
            payload={'operator_email': scope.user.email, 'reason': grant.reason},
        )
        self.db.commit()
        self.db.refresh(grant)

        if grant.status == TenantAccessGrantStatus.REQUESTED:
            try:
                self._notify_tenant_admin(tenant, scope.user, grant.reason)
            except Exception:  # pragma: no cover - never block the request on email
                pass
        return grant

    def _guard_single_active_visit(self, operator_user_id: UUID, *, as_operator: bool = True) -> None:
        """One visit at a time (§2.2 — the scope model resolves a single
        granted tenant). A second ACTIVE grant would be silently unreachable,
        so refuse to create one; the operator ends the current visit first."""
        row = self.db.execute(
            select(TenantAccessGrant, Tenant)
            .join(Tenant, Tenant.id == TenantAccessGrant.tenant_id)
            .where(
                TenantAccessGrant.operator_user_id == operator_user_id,
                TenantAccessGrant.status == TenantAccessGrantStatus.ACTIVE,
            )
        ).first()
        if row is not None:
            _, tenant = row
            detail = (
                f'You already hold an active grant for "{tenant.name}". '
                'End that visit before starting another.'
                if as_operator
                else f'This operator is currently visiting "{tenant.name}" — '
                     'that visit must end before this one can start.'
            )
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    def release_current(self, scope: AccessScope) -> TenantAccessGrant:
        """Operator voluntarily ends their own active visit early — flips the
        grant to EXPIRED now instead of waiting out the window. Both audit
        trails record it (same shape as the lazy expiry, but attributed)."""
        self.expire_stale()
        grant = self.db.scalar(
            select(TenantAccessGrant)
            .where(
                TenantAccessGrant.operator_user_id == scope.user.id,
                TenantAccessGrant.status == TenantAccessGrantStatus.ACTIVE,
            )
            .order_by(TenantAccessGrant.expires_at.desc())
        )
        if grant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='No active grant to end.',
            )
        grant.status = TenantAccessGrantStatus.EXPIRED
        grant.expires_at = _utcnow()

        self.audit_service.log(
            action='platform_access.released', entity_type='tenant', entity_id=grant.tenant_id,
            actor_user_id=scope.user.id, payload={'grant_id': str(grant.id)},
        )
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='access.released',
            target_type='grant', target_id=str(grant.id),
            payload={'tenant_id': str(grant.tenant_id)},
        )
        self.db.commit()
        self.db.refresh(grant)
        return grant

    def list_for_platform(self) -> tuple[list[tuple[TenantAccessGrant, User, Tenant]], int]:
        """Every grant + the live count of operators currently inside a tenant."""
        self.expire_stale()
        rows = self.db.execute(
            select(TenantAccessGrant, User, Tenant)
            .join(User, User.id == TenantAccessGrant.operator_user_id)
            .join(Tenant, Tenant.id == TenantAccessGrant.tenant_id)
            .order_by(TenantAccessGrant.requested_at.desc())
        ).all()
        grants = [(g, u, t) for g, u, t in rows]
        active = sum(1 for g, _, _ in grants if g.status == TenantAccessGrantStatus.ACTIVE)
        return grants, active

    # ── tenant side ───────────────────────────────────────────────────────────

    def list_for_tenant(self, scope: AccessScope) -> list[tuple[TenantAccessGrant, User, Tenant]]:
        if scope.tenant_id is None:
            return []
        self.expire_stale()
        rows = self.db.execute(
            select(TenantAccessGrant, User, Tenant)
            .join(User, User.id == TenantAccessGrant.operator_user_id)
            .join(Tenant, Tenant.id == TenantAccessGrant.tenant_id)
            .where(TenantAccessGrant.tenant_id == scope.tenant_id)
            .order_by(TenantAccessGrant.requested_at.desc())
        ).all()
        return [(g, u, t) for g, u, t in rows]

    def _tenant_grant_or_404(self, grant_id: UUID, scope: AccessScope) -> TenantAccessGrant:
        grant = self.db.get(TenantAccessGrant, grant_id)
        if grant is None or scope.tenant_id is None or grant.tenant_id != scope.tenant_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Request not found')
        return grant

    def _guard_consent(self, grant: TenantAccessGrant, scope: AccessScope) -> None:
        """Consent must come from the tenant — not from the requester, and not
        from an operator who is only visiting through a grant."""
        if scope.grant_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Granted access is read-only.',
            )
        if grant.operator_user_id == scope.user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can't approve your own access request.",
            )

    def approve(self, grant_id: UUID, scope: AccessScope) -> TenantAccessGrant:
        grant = self._tenant_grant_or_404(grant_id, scope)
        self._guard_consent(grant, scope)
        if grant.status != TenantAccessGrantStatus.REQUESTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only a pending request can be approved.',
            )
        self.expire_stale()
        self._guard_single_active_visit(grant.operator_user_id, as_operator=False)
        window_hours = PlatformSettingsService(self.db).get().access_window_hours
        grant.status = TenantAccessGrantStatus.ACTIVE
        grant.approved_by_user_id = scope.user.id
        grant.expires_at = _utcnow() + timedelta(hours=window_hours)

        self.audit_service.log(
            action='platform_access.approved', entity_type='tenant', entity_id=grant.tenant_id,
            actor_user_id=scope.user.id,
            payload={'grant_id': str(grant.id), 'expires_at': grant.expires_at.isoformat()},
        )
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='access.approved',
            target_type='grant', target_id=str(grant.id),
            payload={'tenant_id': str(grant.tenant_id),
                     'operator_user_id': str(grant.operator_user_id),
                     'expires_at': grant.expires_at.isoformat()},
        )
        self.db.commit()
        self.db.refresh(grant)
        return grant

    def deny(self, grant_id: UUID, scope: AccessScope) -> TenantAccessGrant:
        grant = self._tenant_grant_or_404(grant_id, scope)
        self._guard_consent(grant, scope)
        if grant.status != TenantAccessGrantStatus.REQUESTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only a pending request can be denied.',
            )
        grant.status = TenantAccessGrantStatus.DENIED

        self.audit_service.log(
            action='platform_access.denied', entity_type='tenant', entity_id=grant.tenant_id,
            actor_user_id=scope.user.id, payload={'grant_id': str(grant.id)},
        )
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='access.denied',
            target_type='grant', target_id=str(grant.id),
            payload={'tenant_id': str(grant.tenant_id),
                     'operator_user_id': str(grant.operator_user_id)},
        )
        self.db.commit()
        self.db.refresh(grant)
        return grant

    # ── expiry ────────────────────────────────────────────────────────────────

    def expire_stale(self) -> int:
        """Lazy sweep: flip overdue ACTIVE grants to EXPIRED. Called from every
        read/write path here, so the status column never lies for long; the
        authorization check itself (active_grant_tenant_id) compares expires_at
        directly and never trusts the sweep."""
        result = self.db.execute(
            update(TenantAccessGrant)
            .where(
                TenantAccessGrant.status == TenantAccessGrantStatus.ACTIVE,
                TenantAccessGrant.expires_at <= _utcnow(),
            )
            .values(status=TenantAccessGrantStatus.EXPIRED)
        )
        count = result.rowcount or 0
        if count:
            # Persist even when reached from a GET — otherwise the flip would
            # roll back with the read-only request's session.
            self.db.commit()
        return count

    # ── email ─────────────────────────────────────────────────────────────────

    def _portal_url(self) -> str:
        if settings.allowed_origins:
            return settings.allowed_origins[0].rstrip('/')
        return 'http://localhost:3000'

    def _notify_tenant_admin(self, tenant: Tenant, operator: User, reason: str) -> None:
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
        )
        if admin is None:
            return
        operator_name = f'{operator.first_name} {operator.last_name}'.strip()
        url = f'{self._portal_url()}/apf'
        fr = (
            f'Bonjour {admin.first_name},\n\n'
            f"{operator_name} (équipe Staffig) demande un accès temporaire en lecture seule "
            f'à votre espace « {tenant.name} ».\n\n'
            f'Raison : {reason}\n\n'
            f'Approuvez ou refusez la demande depuis votre espace :\n{url}\n\n'
            f"L'accès expire automatiquement et chaque consultation est journalisée.\n"
        )
        en = (
            f'Hello {admin.first_name},\n\n'
            f'{operator_name} (StaffiG team) is requesting temporary read-only access '
            f'to your workspace "{tenant.name}".\n\n'
            f'Reason: {reason}\n\n'
            f'Approve or deny the request from your workspace:\n{url}\n\n'
            f'Access expires automatically and every view is logged.\n'
        )
        subject = localized_subject(
            admin.preferred_language,
            f"[Staffig] Demande d'accès à « {tenant.name} »",
            f'[Staffig] Access request for "{tenant.name}"',
        )
        self.email.send(EmailMessage(
            to_email=admin.email,
            subject=subject,
            body=localized(admin.preferred_language, fr, en),
        ))
