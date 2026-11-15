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

from datetime import datetime, timezone
from urllib.parse import quote
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.auth.clerk import delete_clerk_user
from app.auth.scope import AccessScope
from app.core.config import settings
from app.models.enums import TenantAccessGrantStatus, TenantStatus, UserRole
from app.models.organization_membership import OrganizationMembership
from app.models.tenant import Tenant
from app.models.tenant_access_grant import TenantAccessGrant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.notifications.email_service import EmailMessage, EmailNotificationService
from app.notifications.i18n import localized, localized_subject
from app.schemas.tenant import TenantNetworkCreate
from app.services.audit_service import AuditService
from app.services.platform_audit_service import PlatformAuditService
from app.services.platform_lead_service import mark_lead_piloting
from app.services.platform_settings_service import reserved_slugs
from app.services.user_service import REMOVED_EMAIL_MARKER


class TenantService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit_service = AuditService(db)
        self.platform_audit = PlatformAuditService(db)
        self.email = EmailNotificationService()

    def _portal_url(self) -> str:
        if settings.allowed_origins:
            return settings.allowed_origins[0].rstrip('/')
        return 'http://localhost:3000'

    def _send_tenant_invite_email(self, admin: User, tenant: Tenant) -> None:
        """Email the invited tenant admin a sign-up link. Best-effort — skipped
        when SMTP isn't configured. Path-based routing for now (see
        project_multitenancy_decisions): the admin signs up, /auth/sync links
        them to this tenant, and they land in the onboarding wizard."""
        signup_url = f'{self._portal_url()}/sign-up?email_address={quote(admin.email)}'
        fr = (
            f'Bonjour {admin.first_name},\n\n'
            f'Vous avez été invité(e) à créer votre réseau « {tenant.name} » sur Staffig.\n\n'
            f'Créez votre compte avec cette adresse courriel :\n'
            f'{signup_url}\n\n'
            f'Après votre inscription, vous configurerez votre réseau en quelques étapes.\n'
        )
        en = (
            f'Hello {admin.first_name},\n\n'
            f'You have been invited to set up your network "{tenant.name}" on Staffig.\n\n'
            f'Create your account with this email address:\n'
            f'{signup_url}\n\n'
            f'After you sign up, a short wizard will help you configure your network.\n'
        )
        subject = localized_subject(
            admin.preferred_language,
            f'[Staffig] Invitation à créer votre réseau « {tenant.name} »',
            f'[Staffig] Set up your Staffig network "{tenant.name}"',
        )
        self.email.send(EmailMessage(
            to_email=admin.email,
            subject=subject,
            body=localized(admin.preferred_language, fr, en),
        ))

    def create_network(
        self, payload: TenantNetworkCreate, scope: AccessScope
    ) -> tuple[Tenant, User]:
        tenant, admin = self.stage_network(payload, scope)
        self.db.commit()
        self.db.refresh(tenant)
        self.db.refresh(admin)
        self.send_invite_email(admin, tenant)
        return tenant, admin

    def send_invite_email(self, admin: User, tenant: Tenant) -> None:
        """Best-effort: the tenant + admin already exist, and Resend invite
        covers a lost email. Call it only after the commit."""
        try:
            self._send_tenant_invite_email(admin, tenant)
        except Exception:  # pragma: no cover - never block creation on email
            pass

    def stage_network(
        self, payload: TenantNetworkCreate, scope: AccessScope
    ) -> tuple[Tenant, User]:
        """Validate and add the tenant, its first admin and the audit rows to
        the session — no commit, no email. The caller owns the transaction, so
        a lead can be linked to the tenant in the same all-or-nothing write
        (SPEC_PLATFORM_LEADS §7)."""
        slug = payload.slug.strip().lower()
        admin_email = payload.admin_email.lower()

        if slug in reserved_slugs(self.db):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'The slug "{slug}" is reserved and cannot be used.',
            )

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
            phone=payload.admin_phone,  # already E.164 via NormalizedPhone
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
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='tenant.invited',
            target_type='tenant', target_id=str(tenant.id),
            payload={'slug': tenant.slug, 'name': tenant.name},
        )

        self.db.flush()
        return tenant, admin

    def _get_tenant_or_404(self, tenant_id: UUID) -> Tenant:
        tenant = self.db.get(Tenant, tenant_id)
        # REMOVED is terminal: the console forgets those rows (status filter),
        # so the lifecycle endpoints must too — without this, suspend() on a
        # removed tenant resurrected it as "suspended" with every member
        # tombstoned, and reactivate() made it a memberless "active" zombie.
        if tenant is None or tenant.status == TenantStatus.REMOVED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Network not found')
        return tenant

    def _caller_tenant(self, scope: AccessScope) -> Tenant:
        if scope.tenant_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='No tenant in scope.')
        return self._get_tenant_or_404(scope.tenant_id)

    def get_profile(self, scope: AccessScope) -> Tenant:
        """The caller's own tenant (onboarding wizard + workspace header)."""
        return self._caller_tenant(scope)

    def update_profile(self, payload, scope: AccessScope) -> Tenant:
        tenant = self._caller_tenant(scope)
        if payload.name is not None:
            tenant.name = payload.name.strip()
        if payload.region is not None:
            tenant.region = payload.region.strip() or None
        if payload.preferred_language is not None:
            tenant.preferred_language = payload.preferred_language
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def complete_onboarding(self, scope: AccessScope) -> Tenant:
        """Wizard finish — flip onboarding -> active (idempotent)."""
        tenant = self._caller_tenant(scope)
        if tenant.status in (TenantStatus.ONBOARDING, TenantStatus.PENDING):
            tenant.status = TenantStatus.ACTIVE
            tenant.is_active = True
            if tenant.activated_at is None:
                tenant.activated_at = datetime.now(timezone.utc)
            self.audit_service.log(
                action='tenant.onboarding_completed', entity_type='tenant', entity_id=tenant.id,
                actor_user_id=scope.user.id, payload={'tenant_slug': tenant.slug},
            )
            # Same transaction: the sales lead this tenant came from enters pilot.
            mark_lead_piloting(self.db, tenant.id)
            self.db.commit()
            self.db.refresh(tenant)
        return tenant

    def suspend(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        """Operator pauses an active tenant (non-payment, ToS). Data preserved."""
        tenant = self._get_tenant_or_404(tenant_id)
        if tenant.status not in (TenantStatus.ACTIVE, TenantStatus.ONBOARDING):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only an active network can be suspended. '
                       'Revoke a pending invite instead.',
            )
        tenant.status = TenantStatus.SUSPENDED
        tenant.is_active = False
        self.audit_service.log(
            action='tenant.suspended', entity_type='tenant', entity_id=tenant.id,
            actor_user_id=scope.user.id, payload={'tenant_slug': tenant.slug},
        )
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='tenant.suspended',
            target_type='tenant', target_id=str(tenant.id), payload={'slug': tenant.slug},
        )
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def reactivate(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        tenant = self._get_tenant_or_404(tenant_id)
        if tenant.status != TenantStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only a suspended network can be reactivated.',
            )
        tenant.status = TenantStatus.ACTIVE
        tenant.is_active = True
        if tenant.activated_at is None:
            tenant.activated_at = datetime.now(timezone.utc)
        self.audit_service.log(
            action='tenant.reactivated', entity_type='tenant', entity_id=tenant.id,
            actor_user_id=scope.user.id, payload={'tenant_slug': tenant.slug},
        )
        self.platform_audit.log(
            actor_user_id=scope.user.id, action='tenant.reactivated',
            target_type='tenant', target_id=str(tenant.id), payload={'slug': tenant.slug},
        )
        self.db.commit()
        self.db.refresh(tenant)
        return tenant

    def resend_invite(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        """Re-send the sign-up email to a pending tenant's admin."""
        tenant = self._get_tenant_or_404(tenant_id)
        if tenant.status != TenantStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only a pending invite can be resent.',
            )
        admin = self.db.scalar(
            select(User)
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(
                TenantMembership.tenant_id == tenant_id,
                TenantMembership.role == UserRole.NETWORK_ADMIN,
                TenantMembership.is_active.is_(True),
            )
        )
        if admin is not None:
            self._send_tenant_invite_email(admin, tenant)
        self.audit_service.log(
            action='tenant.invite_resent', entity_type='tenant', entity_id=tenant.id,
            actor_user_id=scope.user.id, payload={'tenant_slug': tenant.slug},
        )
        self.db.commit()
        return tenant

    def revoke_invite(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        """Cancel a pending invite (hard-suspend; the admin never signed up).
        Reuses the soft-delete cascade but guards on pending status."""
        tenant = self._get_tenant_or_404(tenant_id)
        if tenant.status != TenantStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Only a pending invite can be revoked. Suspend an active tenant instead.',
            )
        return self.remove_tenant(tenant_id, scope)

    def remove_tenant(self, tenant_id: UUID, scope: AccessScope) -> Tenant:
        """Soft-delete a tenant and cascade-deactivate every member.

        Refuses to delete the tenant the acting user is a member of
        (prevents the platform admin from locking themselves out of their
        primary tenant).
        """
        tenant = self.db.get(Tenant, tenant_id)
        if tenant is None or tenant.status == TenantStatus.REMOVED:
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

        # Close the §2.2 access grants: an ACTIVE visit ends now (it would
        # otherwise keep authorizing reads on the tombstoned data until it
        # expired), and a pending request can no longer be consented to.
        self.db.execute(
            update(TenantAccessGrant)
            .where(
                TenantAccessGrant.tenant_id == tenant_id,
                TenantAccessGrant.status == TenantAccessGrantStatus.ACTIVE,
            )
            .values(status=TenantAccessGrantStatus.EXPIRED, expires_at=datetime.now(timezone.utc))
        )
        self.db.execute(
            update(TenantAccessGrant)
            .where(
                TenantAccessGrant.tenant_id == tenant_id,
                TenantAccessGrant.status == TenantAccessGrantStatus.REQUESTED,
            )
            .values(status=TenantAccessGrantStatus.DENIED)
        )

        tenant.is_active = False
        # Distinct terminal state (migration 0019): suspension also writes
        # is_active=False, so the console filters on status — without this a
        # removed tenant would ghost as "Active" or, worse, hide suspended
        # rows from the list (the 2026-08-06 regression).
        tenant.status = TenantStatus.REMOVED

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
