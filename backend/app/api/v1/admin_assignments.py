from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.assignment import AssignmentRead, AssignmentTimesPatch
from app.services.admin_request_service import AdminRequestService
from app.services.assignment_service import AssignmentService

router = APIRouter()


@router.patch('/{assignment_id}/times', dependencies=[Depends(require_admin)])
def correct_assignment_times(
    assignment_id: UUID,
    payload: AssignmentTimesPatch,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AssignmentRead:
    allowed_org_ids = AdminRequestService(db)._scoped_org_ids(scope)
    assignment = AssignmentService(db).correct_times(
        assignment_id, payload, scope.user.id, allowed_org_ids,
    )
    return AssignmentRead.model_validate(assignment)
