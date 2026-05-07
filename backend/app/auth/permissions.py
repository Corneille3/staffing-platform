"""Role-based dependencies. The DB is the source of truth for roles.

These dependencies resolve to the caller's ``AccessScope`` (which itself
loads the DB user via ``clerk_user_id``) and check the role on the DB
user, not the JWT. Clerk is identity-only — its JWT and publicMetadata
must never be trusted to grant or change platform access.

``require_authenticated`` is the only exception: it is just a JWT
validity gate (used as a global dependency on ``/api/v1``), and does
not need the DB lookup.
"""

from collections.abc import Callable

from fastapi import Depends, HTTPException, status

from app.auth.current_user import get_current_user
from app.auth.scope import AccessScope, get_access_scope
from app.core.constants import ROLE_NETWORK_ADMIN, ROLE_ORG_ADMIN, ROLE_PLATFORM_ADMIN, ROLE_WORKER


def require_role(*allowed_roles: str) -> Callable[..., AccessScope]:
    """FastAPI dependency factory: 403 unless the caller's *DB* role is allowed."""

    allowed = set(allowed_roles)

    def _checker(scope: AccessScope = Depends(get_access_scope)) -> AccessScope:
        if scope.user.role.value not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail='You do not have permission to perform this action.',
            )
        return scope

    return _checker


require_authenticated = get_current_user
require_platform_admin = require_role(ROLE_PLATFORM_ADMIN)
require_network_admin = require_role(ROLE_PLATFORM_ADMIN, ROLE_NETWORK_ADMIN)
require_admin = require_role(ROLE_PLATFORM_ADMIN, ROLE_NETWORK_ADMIN, ROLE_ORG_ADMIN)
require_worker = require_role(ROLE_WORKER)

# Backward-compat alias used by audit_logs route.
require_apf = require_network_admin
