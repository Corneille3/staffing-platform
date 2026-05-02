from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.repositories.assignment_repository import AssignmentRepository
from app.schemas.assignment import AssignmentCancel, AssignmentCreate, AssignmentRead
from app.services.assignment_service import AssignmentService

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
