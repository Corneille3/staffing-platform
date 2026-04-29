from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.schemas.worker import WorkerAvailabilityUpdate, WorkerProfileRead, WorkerRead
from app.services.worker_service import WorkerService

router = APIRouter()


@router.get('', dependencies=[Depends(require_admin)])
def list_workers(db: Session = Depends(get_db_session)) -> dict[str, list[WorkerRead]]:
    workers = WorkerService(db).list()
    items = [
        WorkerRead(
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
        for worker in workers
    ]
    return {'items': items}


@router.get('/{user_id}')
def get_worker(user_id: UUID, db: Session = Depends(get_db_session)) -> WorkerRead:
    worker = WorkerService(db).get(user_id)
    if worker is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker not found')
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


@router.patch('/{user_id}/availability')
def update_worker_availability(
    user_id: UUID,
    payload: WorkerAvailabilityUpdate,
    db: Session = Depends(get_db_session),
) -> WorkerProfileRead:
    profile = WorkerService(db).update_availability(user_id, payload.availability_status)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker profile not found')
    return WorkerProfileRead.model_validate(profile)
