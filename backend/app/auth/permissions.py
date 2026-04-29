from collections.abc import Callable

from fastapi import Depends, HTTPException, status

from app.auth.current_user import CurrentUserModel, get_current_user
from app.core.constants import ROLE_APF_ADMIN, ROLE_ORG_ADMIN, ROLE_WORKER


def require_role(*allowed_roles: str) -> Callable[..., CurrentUserModel]:
    """FastAPI dependency factory: 403 unless the current role is allowed."""

    allowed = set(allowed_roles)

    def _checker(current_user: CurrentUserModel = Depends(get_current_user)) -> CurrentUserModel:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You do not have permission to perform this action.',
            )
        return current_user

    return _checker


require_authenticated = get_current_user
require_admin = require_role(ROLE_APF_ADMIN, ROLE_ORG_ADMIN)
require_apf = require_role(ROLE_APF_ADMIN)
require_worker = require_role(ROLE_WORKER)
