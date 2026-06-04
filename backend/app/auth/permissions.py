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


def _require_operator_mfa(scope: AccessScope) -> None:
    """2FA is mandatory before any sensitive tier-0 action (PLATFORM_HANDOFF §1).
    The flag mirrors Clerk's two_factor_enabled (synced on /auth/sync)."""
    if not scope.platform_operator_mfa:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Enable two-factor authentication to perform this action.',
        )


def require_platform_owner(scope: AccessScope = Depends(get_access_scope)) -> AccessScope:
    """Tier-0 `owner` only, with 2FA (PLATFORM_HANDOFF §1) — managing operators
    + editing settings/plans. Layered on require_platform_admin (the surface gate)."""
    if scope.user.role.value != ROLE_PLATFORM_ADMIN or not scope.is_platform_owner:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Only a platform owner can perform this action.',
        )
    _require_operator_mfa(scope)
    return scope


def require_platform_operator(scope: AccessScope = Depends(get_access_scope)) -> AccessScope:
    """Tier-0 `owner` or `operator` (PLATFORM_HANDOFF §2.1) — the operator
    list is visible to both, but not to `support`. Read-only: no 2FA gate."""
    if (
        scope.user.role.value != ROLE_PLATFORM_ADMIN
        or scope.platform_operator_role not in ('owner', 'operator')
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='You do not have permission to perform this action.',
        )
    return scope


def require_platform_operator_mfa(
    scope: AccessScope = Depends(require_platform_operator),
) -> AccessScope:
    """`owner` or `operator` with 2FA — tenant lifecycle mutations
    (invite/suspend/reactivate/resend/revoke per the §1 capability table;
    `support` never qualifies)."""
    _require_operator_mfa(scope)
    return scope

# Backward-compat alias used by audit_logs route.
require_apf = require_network_admin
