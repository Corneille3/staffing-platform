from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from sqlalchemy import select

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import EmploymentType
from app.models.tenant_membership import TenantMembership
from app.schemas.availability import (
    AvailabilityCellRead,
    AvailabilityCopyRequest,
    AvailabilityGridRead,
    AvailabilityGridWrite,
)
from app.schemas.worker import (
    WorkerAvailabilityUpdate,
    WorkerInviteCreate,
    WorkerOnboardCreate,
    WorkerProfileRead,
    WorkerRead,
)
from app.services.availability_service import AvailabilityService
from app.services.worker_service import WorkerService

router = APIRouter()


def _to_worker_read(worker, db: Session) -> WorkerRead:
    membership = db.scalar(select(TenantMembership).where(
        TenantMembership.user_id == worker.id,
        TenantMembership.is_active.is_(True),
    ))
    return WorkerRead(
        id=worker.id,
        clerk_user_id=worker.clerk_user_id,
        first_name=worker.first_name,
        last_name=worker.last_name,
        email=worker.email,
        phone=worker.phone,
        preferred_language=worker.preferred_language,
        is_active=worker.is_active,
        employment_type=membership.employment_type if membership else EmploymentType.CONTRACTOR,
        profile=WorkerProfileRead.model_validate(worker.worker_profile) if worker.worker_profile else None,
    )


@router.get('')
def list_workers(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[WorkerRead]]:
    workers = WorkerService(db).list_for_scope(scope)
    return {'items': [_to_worker_read(worker, db) for worker in workers]}


@router.post('/invite', status_code=201, dependencies=[Depends(require_network_admin)])
def invite_worker(
    payload: WorkerInviteCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> WorkerRead:
    worker = WorkerService(db).invite(payload, scope)
    return _to_worker_read(worker, db)


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
    return _to_worker_read(worker, db)


@router.post('/{user_id}/onboard', status_code=201)
def onboard_worker(
    user_id: UUID,
    payload: WorkerOnboardCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> WorkerProfileRead:
    if not scope.is_admin and scope.user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
    profile = WorkerService(db).onboard(user_id, payload)
    return WorkerProfileRead.model_validate(profile)


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
    profile = WorkerService(db).update_availability(
        user_id,
        availability_status=payload.availability_status,
        urgent_alert_opt_in=payload.urgent_alert_opt_in,
        notify_far=payload.notify_far,
        notify_weekend_overnight=payload.notify_weekend_overnight,
        supported_cities=payload.supported_cities,
    )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Worker profile not found')
    return WorkerProfileRead.model_validate(profile)


def _check_scope_self(scope: AccessScope, user_id: UUID) -> None:
    if not scope.is_admin and scope.user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only manage their own availability.',
        )


@router.get('/{user_id}/availability/grid')
def get_availability_grid(
    user_id: UUID,
    week_start: date,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AvailabilityGridRead:
    _check_scope_self(scope, user_id)
    cells = AvailabilityService(db).get_week(user_id, week_start)
    return AvailabilityGridRead(
        week_start=week_start,
        cells=[AvailabilityCellRead.model_validate(c) for c in cells],
    )


@router.post('/{user_id}/availability/grid')
def put_availability_grid(
    user_id: UUID,
    payload: AvailabilityGridWrite,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AvailabilityGridRead:
    _check_scope_self(scope, user_id)
    cells = AvailabilityService(db).replace_week(user_id, payload.week_start, payload.cells)
    return AvailabilityGridRead(
        week_start=payload.week_start,
        cells=[AvailabilityCellRead.model_validate(c) for c in cells],
    )


@router.post('/{user_id}/availability/grid/copy-previous')
def copy_previous_availability_week(
    user_id: UUID,
    payload: AvailabilityCopyRequest,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AvailabilityGridRead:
    _check_scope_self(scope, user_id)
    cells = AvailabilityService(db).copy_previous_week(user_id, payload.target_week_start)
    return AvailabilityGridRead(
        week_start=payload.target_week_start,
        cells=[AvailabilityCellRead.model_validate(c) for c in cells],
    )
