"""Clerk token verification.

Decodes Clerk-issued JWTs. When ``settings.clerk_jwks_url`` is configured,
the token signature is verified against the JWKS (cached for 1 hour) and
the issuer is enforced. When the JWKS URL is empty (local dev without a
Clerk instance), claims are read unverified — the API still requires a
bearer token but does not trust it cryptographically.
"""

from dataclasses import dataclass
from threading import Lock
from time import monotonic

import httpx
from jose import JWTError, jwt

from app.core.config import settings

JWKS_TTL_SECONDS = 3600


@dataclass(slots=True)
class ClerkTokenPayload:
    sub: str
    email: str | None
    role: str | None


class ClerkAuthError(Exception):
    pass


class _JwksCache:
    def __init__(self) -> None:
        self._lock = Lock()
        self._jwks: dict | None = None
        self._fetched_at: float = 0.0

    def get(self, url: str) -> dict:
        with self._lock:
            now = monotonic()
            if self._jwks is None or (now - self._fetched_at) > JWKS_TTL_SECONDS:
                self._jwks = self._fetch(url)
                self._fetched_at = now
            return self._jwks

    @staticmethod
    def _fetch(url: str) -> dict:
        try:
            response = httpx.get(url, timeout=5.0)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ClerkAuthError(f'Failed to fetch JWKS: {exc}') from exc


_jwks_cache = _JwksCache()


def _decode_unverified(token: str) -> dict:
    try:
        return jwt.get_unverified_claims(token)
    except JWTError as exc:
        raise ClerkAuthError('Invalid token payload') from exc


def _decode_verified(token: str, jwks_url: str) -> dict:
    try:
        headers = jwt.get_unverified_headers(token)
    except JWTError as exc:
        raise ClerkAuthError('Invalid token header') from exc

    kid = headers.get('kid')
    if not kid:
        raise ClerkAuthError('Token missing kid header')

    jwks = _jwks_cache.get(jwks_url)
    key = next((k for k in jwks.get('keys', []) if k.get('kid') == kid), None)
    if key is None:
        raise ClerkAuthError('Signing key not found in JWKS')

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[headers.get('alg', 'RS256')],
            issuer=settings.clerk_issuer_url or None,
            options={'verify_aud': False},
        )
    except JWTError as exc:
        raise ClerkAuthError(f'Token verification failed: {exc}') from exc


def decode_token(token: str) -> ClerkTokenPayload:
    if settings.clerk_jwks_url:
        claims = _decode_verified(token, settings.clerk_jwks_url)
    else:
        claims = _decode_unverified(token)
        issuer = claims.get('iss')
        if settings.clerk_issuer_url and issuer and issuer != settings.clerk_issuer_url:
            raise ClerkAuthError('Token issuer does not match configured Clerk issuer')

    sub = claims.get('sub')
    if not sub:
        raise ClerkAuthError('Token subject is missing')

    metadata = claims.get('public_metadata')
    role = metadata.get('role') if isinstance(metadata, dict) else None
    role = role or claims.get('org_role') or claims.get('role')

    return ClerkTokenPayload(sub=sub, email=claims.get('email'), role=role)


def fetch_user_details(user_id: str) -> dict:
    """Fetch a Clerk user's full record via the Backend API.

    Returns an empty dict if the secret key is unset (dev mode) or the
    request fails. The default Clerk session JWT carries no email/name
    claims unless a custom session token template is configured, so we
    fall back to the REST API to populate users on first sync.
    """
    if not settings.clerk_secret_key:
        return {}
    try:
        response = httpx.get(
            f'https://api.clerk.com/v1/users/{user_id}',
            headers={'Authorization': f'Bearer {settings.clerk_secret_key}'},
            timeout=5.0,
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError):
        return {}


def primary_email(details: dict) -> str | None:
    primary_id = details.get('primary_email_address_id')
    addresses = details.get('email_addresses') or []
    if primary_id:
        for entry in addresses:
            if entry.get('id') == primary_id:
                return entry.get('email_address')
    if len(addresses) == 1:
        return addresses[0].get('email_address')
    return None


def public_metadata_role(details: dict) -> str | None:
    metadata = details.get('public_metadata') or {}
    if isinstance(metadata, dict):
        candidate = metadata.get('role')
        if candidate in {'worker', 'org_admin', 'network_admin', 'platform_admin'}:
            return candidate
    return None
