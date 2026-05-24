"""Admin multi-site organizations screen endpoints (ADMIN_ORG_HISTORY_HANDOFF §2).

GET  /api/v1/admin/organizations        — sites in the caller's scope + metrics
PATCH /api/v1/admin/organizations/{id}  — edit a site (the §2.3 edit modal)
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.admin import (
    AdminOrganizationsResponse,
    AdminOrganizationSite,
    AdminOrganizationUpdate,
)
from app.services.admin_organization_service import AdminOrganizationService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('', response_model=AdminOrganizationsResponse)
def list_admin_organizations(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AdminOrganizationsResponse:
    sites = AdminOrganizationService(db).list_sites(scope)
    return AdminOrganizationsResponse(items=sites)


@router.patch('/{organization_id}', response_model=AdminOrganizationSite)
def patch_admin_organization(
    organization_id: UUID,
    payload: AdminOrganizationUpdate,
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AdminOrganizationSite:
    service = AdminOrganizationService(db)
    service.update_site(organization_id, payload, scope)
    # Return the freshly-computed site row (with metrics) for the org.
    sites = service.list_sites(scope)
    return next(s for s in sites if s.id == organization_id)
