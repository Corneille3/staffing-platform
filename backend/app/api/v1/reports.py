from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.services.reporting_service import ReportingService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('/network-summary')
def get_network_summary(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, object]:
    return {'summary': ReportingService(db).network_summary(scope)}


@router.get('/organization-summary/{organization_id}')
def get_organization_summary(
    organization_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, object]:
    return {'summary': ReportingService(db).organization_summary(organization_id, scope)}
