from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.clerk import fetch_user_details, primary_email
from app.auth.current_user import CurrentUserModel, get_current_user
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter()


@router.get('/me')
def read_current_user(current_user: CurrentUserModel = Depends(get_current_user)) -> dict[str, object]:
    return current_user.model_dump()


@router.post('/sync', response_model=UserRead)
def sync_current_user(
    current_user: CurrentUserModel = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> User:
    """Resolve the signed-in Clerk user to a row in ``users``.

    DB owns roles and memberships; Clerk is the identity layer only.
    Every user must be pre-created via an invite endpoint (or the
    one-time bootstrap migration) before they can sign in. Sign-in by
    an unrecognised email is rejected with 403.
    """
    existing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
    if existing is not None:
        return existing

    email = current_user.email or primary_email(fetch_user_details(current_user.sub))
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Could not determine email for current Clerk user.',
        )

    by_email = db.scalar(select(User).where(User.email == email))
    if by_email is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Not invited. Contact your network administrator to be added.',
        )

    by_email.clerk_user_id = current_user.sub
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        racing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
        if racing is not None:
            return racing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Could not link user (concurrent write).',
        )
    db.refresh(by_email)
    return by_email
