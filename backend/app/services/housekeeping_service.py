"""Orphan-account scan + cleanup (2026-06-06 E2E finding #4).

Two orphan species accumulate in practice:

- **Clerk-only** — a Clerk account matching no *active* DB user by
  ``clerk_user_id`` or email. Created by uninvited sign-ups (Clerk account
  exists, /auth/sync 403s before a DB row lands) and by failed best-effort
  Clerk deletes during a DB-side remove. Previously only cleanable in the
  Clerk dashboard — ``remove_by_email`` 404s without a DB row.
- **DB-only** — an active ``users`` row with no active TenantMembership,
  no active OrganizationMembership, and no PlatformOperator row. Invisible
  to every management listing but still holds the unique email. This is
  the species ``UserService.remove_by_email`` was built for; the scan
  makes them discoverable instead of requiring the admin to know the email.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.clerk import delete_clerk_user, fetch_user_details, list_clerk_users, primary_email
from app.auth.scope import AccessScope
from app.models.organization_membership import OrganizationMembership
from app.models.platform_operator import PlatformOperator
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.platform import OrphanRead, OrphanScanResponse
from app.services.platform_audit_service import PlatformAuditService
from app.services.user_service import UserService


def _from_epoch_ms(value) -> datetime | None:
    if not isinstance(value, (int, float)):
        return None
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc)


class HousekeepingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = PlatformAuditService(db)

    def scan(self) -> OrphanScanResponse:
        active_users = list(self.db.scalars(
            select(User).where(User.is_active.is_(True))
        ))
        active_clerk_ids = {u.clerk_user_id for u in active_users if u.clerk_user_id}
        active_emails = {u.email.lower() for u in active_users}

        clerk_users = list_clerk_users()
        clerk_available = clerk_users is not None

        clerk_only: list[OrphanRead] = []
        for record in clerk_users or []:
            clerk_id = record.get('id')
            email = primary_email(record)
            if not clerk_id or clerk_id in active_clerk_ids:
                continue
            if email and email.lower() in active_emails:
                continue
            name = f"{record.get('first_name') or ''} {record.get('last_name') or ''}".strip()
            clerk_only.append(OrphanRead(
                kind='clerk',
                id=clerk_id,
                email=email,
                name=name or None,
                created_at=_from_epoch_ms(record.get('created_at')),
                last_sign_in_at=_from_epoch_ms(record.get('last_sign_in_at')),
            ))

        db_only = [
            OrphanRead(
                kind='db',
                id=str(user.id),
                email=user.email,
                name=f'{user.first_name} {user.last_name}'.strip() or None,
                role=user.role.value,
                created_at=user.created_at,
                clerk_linked=user.clerk_user_id is not None,
            )
            for user in active_users
            if self._is_db_orphan(user)
        ]

        return OrphanScanResponse(
            clerk_only=clerk_only,
            db_only=db_only,
            clerk_available=clerk_available,
            scanned_at=datetime.now(timezone.utc),
        )

    def remove_clerk_orphan(self, clerk_user_id: str, scope: AccessScope) -> None:
        """Delete a Clerk account with no active DB counterpart. Re-verifies
        orphan-hood at delete time — the scan result the admin clicked may
        be stale (e.g. the user got invited between scan and click)."""
        linked = self.db.scalar(select(User).where(
            User.clerk_user_id == clerk_user_id,
            User.is_active.is_(True),
        ))
        if linked is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='That Clerk account is now linked to an active user — rescan.',
            )
        details = fetch_user_details(clerk_user_id)
        details_email = primary_email(details)
        if details_email and self.db.scalar(select(User).where(
            User.email == details_email.lower(),
            User.is_active.is_(True),
        )):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='That email now belongs to an active user — rescan.',
            )
        if not delete_clerk_user(clerk_user_id):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail='Clerk rejected the delete — try again or use the Clerk dashboard.',
            )
        self.audit.log(
            actor_user_id=scope.user.id,
            action='housekeeping.clerk_orphan_removed',
            target_type='clerk_user',
            target_id=clerk_user_id,
            payload={'email': details_email},
        )
        self.db.commit()

    def remove_db_orphan(self, user_id: UUID, scope: AccessScope) -> User:
        """Route a DB-only orphan through the standard remove (tombstone +
        membership deactivation + best-effort Clerk delete + audit). The
        orphan re-check keeps this endpoint from doubling as a general
        user-removal API."""
        target = self.db.get(User, user_id)
        if target is None or not target.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail='No active user with that id — it may already be removed.',
            )
        if not self._is_db_orphan(target):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='That user is reachable through normal management flows — rescan.',
            )
        return UserService(self.db).remove(target.id, scope)

    def _is_db_orphan(self, user: User) -> bool:
        has_tenant = self.db.scalar(
            select(TenantMembership.id).where(
                TenantMembership.user_id == user.id,
                TenantMembership.is_active.is_(True),
            ).limit(1)
        )
        if has_tenant:
            return False
        has_org = self.db.scalar(
            select(OrganizationMembership.id).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            ).limit(1)
        )
        if has_org:
            return False
        is_operator = self.db.scalar(
            select(PlatformOperator.id).where(PlatformOperator.user_id == user.id).limit(1)
        )
        return not is_operator
