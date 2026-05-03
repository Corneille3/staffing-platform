from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.scope import AccessScope, get_access_scope
from app.repositories.organization_repository import OrganizationRepository
from app.schemas.organization import OrganizationRead

router = APIRouter()


@router.get('')
def list_organizations(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[OrganizationRead]]:
    organizations = OrganizationRepository(db).list_for_scope(scope)
    return {'items': [OrganizationRead.model_validate(item) for item in organizations]}


@router.get('/{organization_id}')
def get_organization(
    organization_id: UUID,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> OrganizationRead:
    organization = OrganizationRepository(db).get(organization_id)
    if organization is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Organization not found')
    if not scope.is_platform_admin:
        if scope.is_network_admin:
            if not scope.tenant_id or organization.tenant_id != scope.tenant_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
        elif organization.id not in scope.org_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')
    return OrganizationRead.model_validate(organization)
