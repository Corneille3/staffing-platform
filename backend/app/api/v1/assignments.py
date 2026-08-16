from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
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
def create_assignment(
    payload: AssignmentCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    if payload.assigned_by_user_id is None:
        payload.assigned_by_user_id = scope.user.id
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
    assignment = AssignmentService(db).check_in(
        assignment_id,
        payload.latitude,
        payload.longitude,
        scope.user.id,
        scope.is_admin,
    )
    return AssignmentRead.model_validate(assignment)


@router.post('/{assignment_id}/check-out')
def check_out_assignment(
    assignment_id: UUID,
    payload: AssignmentCheckIn,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    assignment = AssignmentService(db).check_out(
        assignment_id,
        payload.latitude,
        payload.longitude,
        scope.user.id,
        scope.is_admin,
    )
    return AssignmentRead.model_validate(assignment)
