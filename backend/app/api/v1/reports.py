from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.services.reporting_service import ReportingService

router = APIRouter()


@router.get('/network-summary', dependencies=[Depends(require_admin)])
def get_network_summary(db: Session = Depends(get_db_session)) -> dict[str, object]:
    return {'summary': ReportingService(db).network_summary()}


@router.get('/organization-summary/{organization_id}', dependencies=[Depends(require_admin)])
def get_organization_summary(organization_id: UUID, db: Session = Depends(get_db_session)) -> dict[str, object]:
    return {'summary': ReportingService(db).organization_summary(organization_id)}
