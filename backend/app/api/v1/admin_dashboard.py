"""Admin Coverage Desk dashboard (ADMIN_HANDOFF §3).

GET /api/v1/admin/dashboard — one round-trip for the coordinator's morning
surface: urgent-now request, weekly KPIs, live requests, today's activity,
this-week fill-rate-by-day, and the today roster.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.permissions import require_admin
from app.auth.scope import AccessScope, get_access_scope
from app.schemas.admin import AdminDashboard
from app.services.admin_dashboard_service import AdminDashboardService

router = APIRouter(dependencies=[Depends(require_admin)])


@router.get('', response_model=AdminDashboard)
def get_admin_dashboard(
    scope: AccessScope = Depends(get_access_scope),
    db: Session = Depends(get_db_session),
) -> AdminDashboard:
    return AdminDashboardService(db).build(scope)
