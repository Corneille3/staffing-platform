"""Access scope resolution for row-level authorization.

`AccessScope` resolves the Clerk-authenticated caller into the concrete DB
identity (a `User` row) plus the set of organizations they have admin
access to. Service / repository code that must filter by ownership takes
this scope and applies whichever filter the caller's role implies.

Resolution requires that POST /auth/sync has run for this Clerk user; if
the `users.clerk_user_id` is not yet populated, the dependency raises
401 with a clear message asking the client to call /auth/sync first.
"""

from dataclasses import dataclass, field
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.current_user import CurrentUserModel, get_current_user
from app.core.constants import ROLE_APF_ADMIN, ROLE_ORG_ADMIN, ROLE_WORKER
from app.models.organization_membership import OrganizationMembership
from app.models.user import User


@dataclass(slots=True)
class AccessScope:
    user: User
    org_ids: list[UUID] = field(default_factory=list)

    @property
    def is_apf(self) -> bool:
        return self.user.role.value == ROLE_APF_ADMIN

    @property
    def is_org_admin(self) -> bool:
        return self.user.role.value == ROLE_ORG_ADMIN

    @property
    def is_worker(self) -> bool:
        return self.user.role.value == ROLE_WORKER

    @property
    def is_admin(self) -> bool:
        return self.is_apf or self.is_org_admin


def get_access_scope(
    current_user: CurrentUserModel = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> AccessScope:
    user = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='User not provisioned. Call POST /api/v1/auth/sync first.',
        )

    if user.role.value == ROLE_APF_ADMIN:
        return AccessScope(user=user)

    if user.role.value == ROLE_ORG_ADMIN:
        memberships = db.scalars(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.is_active.is_(True),
            )
        ).all()
        return AccessScope(user=user, org_ids=[m.organization_id for m in memberships])

    return AccessScope(user=user)
