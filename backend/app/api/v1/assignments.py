from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.models.enums import AssignmentStatus
from app.repositories.assignment_repository import AssignmentRepository
from app.schemas.assignment import AssignmentCancel, AssignmentCreate, AssignmentRead
from app.services.assignment_service import AssignmentService


class AssignmentCheckIn(BaseModel):
    latitude: Decimal | None = None
    longitude: Decimal | None = None

router = APIRouter()


@router.get('')
def list_assignments(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[AssignmentRead]]:
    assignments = AssignmentRepository(db).list_for_scope(scope)
    return {'items': [AssignmentRead.model_validate(item) for item in assignments]}


@router.post('', status_code=201, dependencies=[Depends(require_admin)])
def create_assignment(payload: AssignmentCreate, db: Session = Depends(get_db_session)) -> AssignmentRead:
    assignment = AssignmentService(db).assign(payload)
    return AssignmentRead.model_validate(assignment)


@router.post('/{assignment_id}/cancel', dependencies=[Depends(require_admin)])
def cancel_assignment(
    assignment_id: UUID,
    payload: AssignmentCancel,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    assignment = AssignmentService(db).cancel(assignment_id, payload, scope.user.id)
    return AssignmentRead.model_validate(assignment)


@router.post('/{assignment_id}/check-in')
def check_in_assignment(
    assignment_id: UUID,
    payload: AssignmentCheckIn,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    repo = AssignmentRepository(db)
    assignment = repo.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Assignment not found')
    if not scope.is_admin and assignment.worker_user_id != scope.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Workers may only check in for their own assignment.',
        )
    if assignment.status not in (AssignmentStatus.PENDING_CONFIRMATION, AssignmentStatus.CONFIRMED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Check-in is only allowed for active assignments.',
        )
    if assignment.checked_in_at is not None:
        return AssignmentRead.model_validate(assignment)
    assignment.checked_in_at = datetime.now(timezone.utc)
    assignment.checked_in_latitude = payload.latitude
    assignment.checked_in_longitude = payload.longitude
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return AssignmentRead.model_validate(assignment)
