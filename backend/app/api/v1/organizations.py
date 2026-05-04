from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope, get_access_scope
from app.models.organization import Organization
from app.repositories.organization_repository import OrganizationRepository
from app.schemas.organization import OrganizationCreate, OrganizationRead
from app.services.audit_service import AuditService

router = APIRouter()


@router.post('', status_code=201, dependencies=[Depends(require_network_admin)])
def create_organization(
    payload: OrganizationCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> OrganizationRead:
    if not scope.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='No tenant context.')
    org = Organization(id=uuid4(), tenant_id=scope.tenant_id, **payload.model_dump())
    db.add(org)
    AuditService(db).log(
        action='organization.created',
        entity_type='organization',
        entity_id=org.id,
        actor_user_id=scope.user.id,
        payload={'name': payload.name, 'city': payload.city, 'tenant_id': str(scope.tenant_id)},
    )
    db.commit()
    db.refresh(org)
    return OrganizationRead.model_validate(org)


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
