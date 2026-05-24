"""Admin-surface schemas (substitutes ranking, request drafts).

Distinct from /apf schemas because the admin surface is the dispatcher view
(per-org or per-tenant for coordinators), not network oversight.
"""
from datetime import date as date_cls
from uuid import UUID

from pydantic import BaseModel

from app.schemas.eligibility import EligibilityReason
from app.schemas.worker import WorkerRead


class AdminSubstituteRow(BaseModel):
    """A worker row, optionally enriched with match score for a specific request."""
    worker: WorkerRead
    match_score: int | None = None
    eligible: bool | None = None
    reasons: list[EligibilityReason] = []


class RankAgainstBrief(BaseModel):
    id: UUID
    title: str
    city: str
    work_date: date_cls
    language_requirement: str | None = None
    required_qualifications: list[str] = []
    required_certifications: list[str] = []


class AdminSubstitutesResponse(BaseModel):
    items: list[AdminSubstituteRow]
    rank_against: RankAgainstBrief | None = None
