from dataclasses import dataclass

from jose import JWTError, jwt

from app.core.config import settings


@dataclass(slots=True)
class CognitoTokenPayload:
    sub: str
    email: str | None
    role: str | None


class CognitoAuthError(Exception):
    pass


def decode_token(token: str) -> CognitoTokenPayload:
    try:
        claims = jwt.get_unverified_claims(token)
    except JWTError as exc:
        raise CognitoAuthError('Invalid token payload') from exc

    issuer = claims.get('iss')
    if settings.cognito_issuer_url and issuer and issuer != settings.cognito_issuer_url:
        raise CognitoAuthError('Token issuer does not match configured Cognito issuer')

    audience = claims.get('client_id') or claims.get('aud')
    if settings.cognito_app_client_id and audience and audience != settings.cognito_app_client_id:
        raise CognitoAuthError('Token audience does not match configured Cognito app client')

    sub = claims.get('sub')
    if not sub:
        raise CognitoAuthError('Token subject is missing')

    role = claims.get('custom:role') or claims.get('role')
    return CognitoTokenPayload(sub=sub, email=claims.get('email'), role=role)
