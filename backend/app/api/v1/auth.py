from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.clerk import fetch_user_details, primary_email, public_metadata_role
from app.auth.current_user import CurrentUserModel, get_current_user
from app.core.constants import ROLE_NETWORK_ADMIN, ROLE_ORG_ADMIN, ROLE_PLATFORM_ADMIN, ROLE_WORKER
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter()


@router.get('/me')
def read_current_user(current_user: CurrentUserModel = Depends(get_current_user)) -> dict[str, object]:
    return current_user.model_dump()


_VALID_ROLES = {ROLE_WORKER, ROLE_ORG_ADMIN, ROLE_NETWORK_ADMIN, ROLE_PLATFORM_ADMIN}


def _names_from(details: dict, email: str) -> tuple[str, str]:
    first = (details.get('first_name') or '').strip()
    last = (details.get('last_name') or '').strip()
    if first or last:
        return first or 'New', last or 'User'

    local = email.split('@', 1)[0]
    parts = local.replace('.', ' ').replace('_', ' ').replace('-', ' ').split()
    if len(parts) >= 2:
        return parts[0].capitalize(), parts[-1].capitalize()
    return (parts[0].capitalize() if parts else 'New'), 'User'


@router.post('/sync', response_model=UserRead)
def sync_current_user(
    current_user: CurrentUserModel = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> User:
    """Resolve the signed-in Clerk user to a row in ``users``.

    Idempotent: looks up by ``clerk_user_id``, then by email (and links if
    found), otherwise JIT-creates a new ``users`` row. A pre-existing
    user's role is preserved on the link path; only the JIT-create path
    reads ``public_metadata.role`` to decide a role (default: worker).
    """
    existing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
    if existing is not None:
        details = fetch_user_details(current_user.sub)
        new_role = current_user.role or public_metadata_role(details)
        if new_role and new_role in _VALID_ROLES and existing.role.value != new_role:
            existing.role = UserRole(new_role)
            db.commit()
            db.refresh(existing)
        return existing

    details = fetch_user_details(current_user.sub)
    email = current_user.email or primary_email(details)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Could not determine email for current Clerk user.',
        )

    by_email = db.scalar(select(User).where(User.email == email))
    if by_email is not None:
        by_email.clerk_user_id = current_user.sub
        db.commit()
        db.refresh(by_email)
        return by_email

    role_str = current_user.role or public_metadata_role(details) or ROLE_WORKER
    if role_str not in _VALID_ROLES:
        role_str = ROLE_WORKER

    first_name, last_name = _names_from(details, email)

    user = User(
        id=uuid4(),
        clerk_user_id=current_user.sub,
        email=email,
        first_name=first_name,
        last_name=last_name,
        role=UserRole(role_str),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        racing = db.scalar(select(User).where(User.clerk_user_id == current_user.sub))
        if racing is not None:
            return racing
        racing = db.scalar(select(User).where(User.email == email))
        if racing is not None:
            racing.clerk_user_id = current_user.sub
            db.commit()
            db.refresh(racing)
            return racing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Could not provision user (concurrent write).',
        )
    db.refresh(user)
    return user
