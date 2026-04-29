"""Clerk token verification.

Clerk issues JWTs signed with a key from a per-instance JWKS endpoint.
This module decodes the token, optionally verifies the issuer, and extracts
the user identity + role.

NOTE: signature verification via JWKS is not implemented yet. Claims are
read unverified. Production hardening lives behind ``settings.clerk_jwks_url``.
"""

from dataclasses import dataclass

from jose import JWTError, jwt

from app.core.config import settings


@dataclass(slots=True)
class ClerkTokenPayload:
    sub: str
    email: str | None
    role: str | None


class ClerkAuthError(Exception):
    pass


def decode_token(token: str) -> ClerkTokenPayload:
    try:
        claims = jwt.get_unverified_claims(token)
    except JWTError as exc:
        raise ClerkAuthError('Invalid token payload') from exc

    issuer = claims.get('iss')
    if settings.clerk_issuer_url and issuer and issuer != settings.clerk_issuer_url:
        raise ClerkAuthError('Token issuer does not match configured Clerk issuer')

    sub = claims.get('sub')
    if not sub:
        raise ClerkAuthError('Token subject is missing')

    role = (
        claims.get('public_metadata', {}).get('role')
        if isinstance(claims.get('public_metadata'), dict)
        else None
    )
    role = role or claims.get('org_role') or claims.get('role')

    return ClerkTokenPayload(sub=sub, email=claims.get('email'), role=role)
