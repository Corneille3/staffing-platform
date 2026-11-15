"""Operator-level sales pipeline — SPEC_PLATFORM_LEADS §5.

Mounted at /api/v1/platform/leads. Tier-0 `owner` and `marketing` only:
`operator`, `support` and every tenant-side identity get the same 403, with
no hint whether a lead exists. Writes add the 2FA gate (when enforced).
« Invite as a network » is the owner's alone.

Not in this module yet: the public intake.
"""
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import (
    require_platform_leads, require_platform_leads_mfa, require_platform_owner,
)
from app.auth.scope import AccessScope
from app.models.tenant import Tenant
from app.schemas.platform_leads import (
    Kind, LeadCreate, LeadDetail, LeadEventCreate, LeadEventOut, LeadImportResult,
    LeadInvite, LeadInviteResult, LeadListResponse, LeadOut, LeadStats, LeadTenantSummary,
    LeadUpdate, Segment, Source, Status, Wave,
)
from app.services.platform_lead_conversion import LeadConversionService
from app.services.platform_lead_import import LeadImportService
from app.services.platform_lead_service import PlatformLeadService

router = APIRouter(dependencies=[Depends(require_platform_leads)])


@router.get('', response_model=LeadListResponse)
def list_leads(
    status_: Status | None = Query(default=None, alias='status'),
    segment: Segment | None = None,
    province: str | None = Query(default=None, min_length=2, max_length=2),
    wave: Wave | None = None,
    kind: Kind | None = None,
    source: Source | None = None,
    q: str | None = Query(default=None, max_length=120),
    next_action_before: date | None = None,
    sort: Literal['next_action', 'score', 'updated'] = 'next_action',
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db_session),
) -> LeadListResponse:
    rows, total = PlatformLeadService(db).search(
        status_=status_, segment=segment, province=province, wave=wave, kind=kind, source=source, q=q,
        next_action_before=next_action_before, sort=sort, limit=limit, offset=offset,
    )
    return LeadListResponse(
        items=[LeadOut.model_validate(row) for row in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post('', status_code=status.HTTP_201_CREATED, response_model=LeadOut)
def create_lead(
    payload: LeadCreate,
    scope: AccessScope = Depends(require_platform_leads_mfa),
    db: Session = Depends(get_db_session),
) -> LeadOut:
    return LeadOut.model_validate(PlatformLeadService(db).create(payload, scope))


# Fixed paths are declared before /{lead_id} so they are never read as an id.

@router.get('/stats', response_model=LeadStats)
def lead_stats(db: Session = Depends(get_db_session)) -> LeadStats:
    return PlatformLeadService(db).stats()


@router.post('/import', response_model=LeadImportResult)
def import_leads(
    file: UploadFile = File(...),
    scope: AccessScope = Depends(require_platform_leads_mfa),
    db: Session = Depends(get_db_session),
) -> LeadImportResult:
    """CSV or XLSX with the headers of the *Leads* sheet (§8). Upsert on the
    ID column: a known lead only gets its descriptive fields refreshed —
    status, next action and notes are the operator's and are never overwritten."""
    return LeadImportService(db).run(file.filename or '', file.file.read(), scope)


@router.get('/{lead_id}', response_model=LeadDetail)
def get_lead(lead_id: UUID, db: Session = Depends(get_db_session)) -> LeadDetail:
    service = PlatformLeadService(db)
    lead = service.get(lead_id)
    detail = LeadDetail.model_validate(lead)
    detail.events = service.recent_events(lead.id)
    if lead.tenant_id is not None:
        detail.tenant = _tenant_summary(db.get(Tenant, lead.tenant_id))
    return detail


def _tenant_summary(tenant: Tenant) -> LeadTenantSummary:
    return LeadTenantSummary(
        id=tenant.id, name=tenant.name, slug=tenant.slug, status=tenant.status.value,
    )


@router.patch('/{lead_id}', response_model=LeadOut)
def update_lead(
    lead_id: UUID,
    payload: LeadUpdate,
    scope: AccessScope = Depends(require_platform_leads_mfa),
    db: Session = Depends(get_db_session),
) -> LeadOut:
    return LeadOut.model_validate(PlatformLeadService(db).update(lead_id, payload, scope))


@router.post('/{lead_id}/events', status_code=status.HTTP_201_CREATED, response_model=LeadEventOut)
def add_lead_event(
    lead_id: UUID,
    payload: LeadEventCreate,
    scope: AccessScope = Depends(require_platform_leads_mfa),
    db: Session = Depends(get_db_session),
) -> LeadEventOut:
    return PlatformLeadService(db).add_event(lead_id, payload, scope)


@router.post('/{lead_id}/invite', status_code=status.HTTP_201_CREATED, response_model=LeadInviteResult)
def invite_lead_as_network(
    lead_id: UUID,
    payload: LeadInvite,
    # Creating a tenant stays the owner's call — marketing runs the pipeline
    # up to `pilot` and hands over (§14).
    scope: AccessScope = Depends(require_platform_owner),
    db: Session = Depends(get_db_session),
) -> LeadInviteResult:
    lead, tenant = LeadConversionService(db).invite(lead_id, payload, scope)
    return LeadInviteResult(lead=LeadOut.model_validate(lead), tenant=_tenant_summary(tenant))
