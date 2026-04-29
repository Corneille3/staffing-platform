from fastapi import APIRouter, Depends

from app.auth.current_user import CurrentUserModel, get_current_user

router = APIRouter()


@router.get('/me')
def read_current_user(current_user: CurrentUserModel = Depends(get_current_user)) -> dict[str, object]:
    return current_user.model_dump()
