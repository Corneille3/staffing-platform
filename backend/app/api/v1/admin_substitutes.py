"""Admin substitute directory — flat list + optional ranking-against-request.

Used by the coordinator surface (`/admin/substitutes`). When called with
``rank_against_request_id``, every returned worker is enriched with a 0-100
match score and the eligibility reasons from MatchingService, and the response
includes a brief on the request being ranked against so the UI can render the
'Ranking against REQ-XXXX' header bar.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.api.v1.workers import _to_worker_read
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.repositories.staffing_request_repository import StaffingRequestRepository
from app.schemas.admin import AdminSubstitutesResponse
from app.services.matching_service import MatchingService
from app.services.worker_service import WorkerService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('', response_model=AdminSubstitutesResponse)
def list_admin_substitutes(
    rank_against_request_id: UUID | None = Query(None),
    rank_against_draft_id: UUID | None = Query(None, description='Reserved for M2 draft-ranked lookups'),
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> dict:
    workers = WorkerService(db).list_for_scope(scope)

    request_id = rank_against_request_id or rank_against_draft_id
    if request_id is None:
        items = [
            {'worker': _to_worker_read(w, db), 'match_score': None, 'eligible': None, 'reasons': []}
            for w in workers
        ]
        items.sort(key=lambda r: (r['worker'].first_name, r['worker'].last_name))
        return {'items': items, 'rank_against': None}

    repo = StaffingRequestRepository(db)
    staffing_request = repo.get(request_id)
    if staffing_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Staffing request not found.')
    if not repo.can_access(staffing_request, scope):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Out of scope.')

    matcher = MatchingService(db=db)
    scored: list[dict] = []
    for worker in workers:
        result = matcher.eligibility_result(staffing_request, worker)
        scored.append({
            'worker': _to_worker_read(worker, db),
            'match_score': result.score,
            'eligible': result.eligible,
            'would_notify': result.eligible and matcher.wants_notification(staffing_request, worker),
            'reasons': result.reasons,
        })
    scored.sort(key=lambda r: r['match_score'] or 0, reverse=True)

    rank_against = {
        'id': staffing_request.id,
        'title': staffing_request.title,
        'city': staffing_request.city,
        'work_date': staffing_request.work_date,
        'language_requirement': staffing_request.language_requirement,
        'required_qualifications': [
            r if isinstance(r, str) else r.get('code', '')
            for r in (staffing_request.required_qualifications or [])
        ],
        'required_certifications': [
            r if isinstance(r, str) else r.get('code', '')
            for r in (staffing_request.required_certifications or [])
        ],
    }

    return {'items': scored, 'rank_against': rank_against}
