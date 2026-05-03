from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import ClerkAuthError, decode_token
from app.core.config import settings
from app.core.constants import ROLE_NETWORK_ADMIN, ROLE_WORKER
from app.core.security import bearer_scheme, extract_bearer_token

DEV_AUTH_SUB = 'dev-apf-admin'
DEV_AUTH_EMAIL = 'alice.admin@example.org'


class CurrentUserModel(BaseModel):
    sub: str
    email: str | None = None
    role: str = ROLE_WORKER
    is_authenticated: bool = True


def get_current_user(credentials=Depends(bearer_scheme)) -> CurrentUserModel:
    token = extract_bearer_token(credentials)
    if not token:
        if settings.app_env == 'dev' and settings.dev_auth_bypass and not settings.clerk_publishable_key:
            return CurrentUserModel(
                sub=DEV_AUTH_SUB,
                email=DEV_AUTH_EMAIL,
                role=ROLE_NETWORK_ADMIN,
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Authentication credentials were not provided.',
        )

    try:
        payload = decode_token(token)
    except ClerkAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    return CurrentUserModel(
        sub=payload.sub,
        email=payload.email,
        role=payload.role or ROLE_WORKER,
    )
