from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.repositories.assignment_repository import AssignmentRepository
from app.schemas.assignment import AssignmentCreate, AssignmentRead
from app.services.assignment_service import AssignmentService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('')
def list_assignments(db: Session = Depends(get_db_session)) -> dict[str, list[AssignmentRead]]:
    assignments = AssignmentRepository(db).list()
    return {'items': [AssignmentRead.model_validate(item) for item in assignments]}


@router.post('', status_code=201)
def create_assignment(payload: AssignmentCreate, db: Session = Depends(get_db_session)) -> AssignmentRead:
    assignment = AssignmentService(db).assign(payload)
    return AssignmentRead.model_validate(assignment)
