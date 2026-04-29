from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.models.user import User
from app.schemas.user import UserRead

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('')
def list_users(db: Session = Depends(get_db_session)) -> dict[str, list[UserRead]]:
    users = list(db.scalars(select(User).order_by(User.first_name, User.last_name)).all())
    return {'items': [UserRead.model_validate(user) for user in users]}


@router.get('/{user_id}')
def get_user(user_id: UUID, db: Session = Depends(get_db_session)) -> UserRead:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='User not found')
    return UserRead.model_validate(user)
