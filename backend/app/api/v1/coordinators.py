from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_network_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.coordinator import CoordinatorInviteCreate, CoordinatorRead
from app.schemas.organization import OrganizationRead
from app.services.coordinator_service import CoordinatorService

router = APIRouter()


def _to_coordinator_read(user, orgs) -> CoordinatorRead:
    return CoordinatorRead(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        phone=user.phone,
        preferred_language=user.preferred_language,
        is_active=user.is_active,
        organizations=[OrganizationRead.model_validate(o) for o in orgs],
    )


@router.get('', dependencies=[Depends(require_network_admin)])
def list_coordinators(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict[str, list[CoordinatorRead]]:
    if not scope.tenant_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='No tenant context.')
    results = CoordinatorService(db).list_for_tenant(scope.tenant_id)
    return {'items': [_to_coordinator_read(u, orgs) for u, orgs in results]}


@router.post('/invite', status_code=201, dependencies=[Depends(require_network_admin)])
def invite_coordinator(
    payload: CoordinatorInviteCreate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> CoordinatorRead:
    user, orgs = CoordinatorService(db).invite(payload, scope)
    return _to_coordinator_read(user, orgs)
