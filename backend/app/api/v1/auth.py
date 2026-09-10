from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.clerk import fetch_user_details, primary_email
from app.auth.current_user import CurrentUserModel, get_current_user
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import TenantStatus, UserRole
from app.models.platform_operator import PlatformOperator
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.user import MyProfileUpdate, SyncedUserRead
from app.services.audit_service import AuditService

router = APIRouter()


def _sync_operator_mfa(db: Session, user: User) -> PlatformOperator | None:
    """Mirror Clerk's ``two_factor_enabled`` into platform_operators.mfa_enabled
    (PLATFORM_HANDOFF §1). Clerk owns the MFA factor; the DB column is what the
    permission gates check. Best-effort: in dev (no Clerk secret) the lookup
    returns {} and the manually-set column value is left alone.

    Returns the operator row (when one exists) so /auth/sync can expose the
    tier-0 role to the frontend without a second query."""
    if user.role != UserRole.PLATFORM_ADMIN or not user.clerk_user_id:
        return None
    operator = db.scalar(
        select(PlatformOperator).where(PlatformOperator.user_id == user.id)
    )
    if operator is None:
        return None
    two_fa = fetch_user_details(user.clerk_user_id).get('two_factor_enabled')
    if isinstance(two_fa, bool) and operator.mfa_enabled != two_fa:
        operator.mfa_enabled = two_fa
        db.commit()
    return operator


def _synced_read(user: User, operator: PlatformOperator | None) -> SyncedUserRead:
    """Sync payload = the DB user + the tier-0 operator role (None for
    everyone who isn't a platform operator). The UI uses the role to hide
    owner/operator-only controls from `support`."""
    payload = SyncedUserRead.model_validate(user)
    payload.platform_operator_role = operator.role.value if operator else None
    return payload


def _start_onboarding_if_pending(db: Session, user: User) -> None:
    """When an invited tenant admin first links their identity, flip their
    pending tenant to `onboarding` (MULTITENANCY_HANDOFF §4)."""
    if user.role != UserRole.NETWORK_ADMIN:
        return
    membership = db.scalar(
        select(TenantMembership).where(
            TenantMembership.user_id == user.id,
            TenantMembership.role == UserRole.NETWORK_ADMIN,
            TenantMembership.is_active.is_(True),
        )
    )
    if membership is None:
        return
    tenant = db.get(Tenant, membership.tenant_id)
    if tenant is not None and tenant.status == TenantStatus.PENDING:
        tenant.status = TenantStatus.ONBOARDING


@router.get('/me')
def read_current_user(current_user: CurrentUserModel = Depends(get_current_user)) -> dict[str, object]:
    return current_user.model_dump()


def _operator_row(db: Session, user: User) -> PlatformOperator | None:
    if user.role != UserRole.PLATFORM_ADMIN:
        return None
    return db.scalar(select(PlatformOperator).where(PlatformOperator.user_id == user.id))


@router.get('/profile', response_model=SyncedUserRead)
def read_my_profile(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> SyncedUserRead:
    """The signed-in person's own DB row — the same shape /auth/sync returns,
    without the identity-linking side effects (and without the Clerk MFA
    round-trip). Feeds the coordinator "My profile" card."""
    return _synced_read(scope.user, _operator_row(db, scope.user))


@router.patch('/profile', response_model=SyncedUserRead)
def update_my_profile(
    payload: MyProfileUpdate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> SyncedUserRead:
    """Self-service phone + SMS preference (finding #3). Anyone active may
    edit their own row; nothing else is writable here. Changes are audited
    as ``user.profile_updated`` with before/after values."""
    user = scope.user
    changed: dict[str, dict[str, object]] = {}
    if 'phone' in payload.model_fields_set and payload.phone != user.phone:
        changed['phone'] = {'from': user.phone, 'to': payload.phone}
        user.phone = payload.phone
    if payload.sms_opt_out is not None and payload.sms_opt_out != user.sms_opt_out:
        changed['sms_opt_out'] = {'from': user.sms_opt_out, 'to': payload.sms_opt_out}
        user.sms_opt_out = payload.sms_opt_out
    if changed:
        AuditService(db).log(
            action='user.profile_updated',
            entity_type='user',
            entity_id=user.id,
            actor_user_id=user.id,
            payload={'fields': changed},
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return _synced_read(user, _operator_row(db, user))


@router.post('/sync', response_model=SyncedUserRead)
def sync_current_user(
    current_user: CurrentUserModel = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SyncedUserRead:
    """Resolve the signed-in Clerk user to a row in ``users``.

    DB owns roles and memberships; Clerk is the identity layer only.
    Every user must be pre-created via an invite endpoint (or the
    one-time bootstrap migration) before they can sign in. Sign-in by
    an unrecognised email is rejected with 403.
    """
    existing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
    if existing is not None:
        if not existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='Account has been deactivated.',
            )
        return _synced_read(existing, _sync_operator_mfa(db, existing))

    email = current_user.email or primary_email(fetch_user_details(current_user.sub))
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Could not determine email for current Clerk user.',
        )
    # Match invites case-insensitively at the query level — robust even against
    # any legacy row a pre-normalization invite may have stored with capitals
    # (Finding #2). Clerk lowercases sign-in emails; we lower both sides.
    email = email.strip().lower()

    by_email = db.scalar(select(User).where(func.lower(User.email) == email))
    if by_email is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Not invited. Contact your network administrator to be added.',
        )
    if not by_email.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Account has been deactivated.',
        )

    by_email.clerk_user_id = current_user.sub
    _start_onboarding_if_pending(db, by_email)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        racing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
        if racing is not None:
            return _synced_read(racing, _sync_operator_mfa(db, racing))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Could not link user (concurrent write).',
        )
    db.refresh(by_email)
    return _synced_read(by_email, _sync_operator_mfa(db, by_email))
