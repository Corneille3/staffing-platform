from fastapi import Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.clerk import ClerkAuthError, decode_token
from app.core.constants import ROLE_WORKER
from app.core.security import bearer_scheme, extract_bearer_token


class CurrentUserModel(BaseModel):
    sub: str
    email: str | None = None
    role: str = ROLE_WORKER
    is_authenticated: bool = True


def get_current_user(credentials=Depends(bearer_scheme)) -> CurrentUserModel:
    token = extract_bearer_token(credentials)
    if not token:
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
