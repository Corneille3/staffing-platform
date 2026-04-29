from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.repositories.organization_repository import OrganizationRepository
from app.schemas.organization import OrganizationRead

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('')
def list_organizations(db: Session = Depends(get_db_session)) -> dict[str, list[OrganizationRead]]:
    organizations = OrganizationRepository(db).list()
    return {'items': [OrganizationRead.model_validate(item) for item in organizations]}


@router.get('/{organization_id}')
def get_organization(organization_id: UUID, db: Session = Depends(get_db_session)) -> OrganizationRead:
    organization = OrganizationRepository(db).get(organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Organization not found')
    return OrganizationRead.model_validate(organization)
