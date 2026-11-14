from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from pydantic import BaseModel, EmailStr

from app.api.deps import get_db_session
from app.auth.permissions import require_admin, require_network_admin, require_platform_operator_mfa
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import UserRole
from app.models.organization_membership import OrganizationMembership
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.schemas.user import UserRead
from app.services.user_service import UserService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('')
def list_users(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[UserRead]]:
    users = _list_users_for_scope(db, scope)
    return {'items': [UserRead.model_validate(user) for user in users]}


@router.get('/{user_id}')
def get_user(
    user_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> UserRead:
    user = next((item for item in _list_users_for_scope(db, scope) if item.id == user_id), None)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
    return UserRead.model_validate(user)


@router.delete('/{user_id}', dependencies=[Depends(require_network_admin)])
def remove_user(
    user_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> UserRead:
    target = UserService(db).remove(user_id, scope)
    return UserRead.model_validate(target)


class RemoveByEmailPayload(BaseModel):
    email: EmailStr


@router.post('/remove-by-email')
def remove_user_by_email(
    payload: RemoveByEmailPayload,
    # A removal — owner/operator with 2FA, like the housekeeping orphan remove.
    scope: AccessScope = Depends(require_platform_operator_mfa),
    db: Session = Depends(get_db_session),
) -> UserRead:
    """Platform-admin cleanup tool for orphan users whose email is in
    the ``users`` table but who don't appear in any management listing
    (no active TenantMembership or OrganizationMembership)."""
    target = UserService(db).remove_by_email(payload.email, scope)
    return UserRead.model_validate(target)


def _list_users_for_scope(db: Session, scope: AccessScope) -> list[User]:
    stmt = select(User).order_by(User.first_name, User.last_name)

    if scope.is_platform_admin or scope.is_network_admin:
        if not scope.tenant_id:
            return []
        stmt = (
            stmt
            .join(TenantMembership, TenantMembership.user_id == User.id)
            .where(
                TenantMembership.tenant_id == scope.tenant_id,
                TenantMembership.is_active.is_(True),
            )
        )
        return list(db.scalars(stmt).unique().all())

    if scope.is_org_admin:
        if not scope.org_ids:
            return []
        org_user_ids = select(OrganizationMembership.user_id).where(
            OrganizationMembership.organization_id.in_(scope.org_ids),
            OrganizationMembership.is_active.is_(True),
        )
        tenant_worker_ids = (
            select(TenantMembership.user_id)
            .join(User, User.id == TenantMembership.user_id)
            .where(
                TenantMembership.tenant_id == scope.tenant_id,
                TenantMembership.is_active.is_(True),
                User.role == UserRole.WORKER,
            )
        )
        stmt = stmt.where(
            (User.id == scope.user.id)
            | User.id.in_(org_user_ids)
            | User.id.in_(tenant_worker_ids)
        )
        return list(db.scalars(stmt).unique().all())

    return []
