from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.worker import WorkerAvailabilityUpdate, WorkerProfileRead, WorkerRead
from app.services.worker_service import WorkerService

router = APIRouter()


def _to_worker_read(worker) -> WorkerRead:
    return WorkerRead(
        id=worker.id,
        clerk_user_id=worker.clerk_user_id,
        first_name=worker.first_name,
        last_name=worker.last_name,
        email=worker.email,
        phone=worker.phone,
        preferred_language=worker.preferred_language,
        is_active=worker.is_active,
        profile=WorkerProfileRead.model_validate(worker.worker_profile) if worker.worker_profile else None,
    )


@router.get('')
def list_workers(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[WorkerRead]]:
    workers = WorkerService(db).list()
    if not scope.is_admin:
        # Workers only see themselves.
        workers = [w for w in workers if w.id == scope.user.id]
    return {'items': [_to_worker_read(worker) for worker in workers]}


@router.get('/{user_id}')
def get_worker(
    user_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> WorkerRead:
    if not scope.is_admin and scope.user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
    worker = WorkerService(db).get(user_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker not found')
    return _to_worker_read(worker)


@router.patch('/{user_id}/availability')
def update_worker_availability(
    user_id: UUID,
    payload: WorkerAvailabilityUpdate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> WorkerProfileRead:
    if not scope.is_admin and scope.user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only update their own availability.',
        )
    profile = WorkerService(db).update_availability(user_id, payload.availability_status)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker profile not found')
    return WorkerProfileRead.model_validate(profile)
