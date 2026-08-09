"""Wipe staffing/shift data so a test round can start from a clean slate.

Deletes every staffing_request and its dependent rows (assignments, responses,
notifications, requirements). PRESERVES tenants, organizations, users,
memberships, worker profiles and availability — so the invite/onboarding setup
survives and only the shift traffic is cleared.

Usage (inside the backend container):
    docker compose exec backend python -m app.scripts.reset_staffing_data
    docker compose exec backend python -m app.scripts.reset_staffing_data --tenant cpe-les-petites-etoiles

Without --tenant it clears ALL staffing data in the database (intended for a
local dev DB). --tenant scopes the wipe to one network by slug.
"""
import argparse
import sys

from sqlalchemy import delete, func, select

import app.models  # noqa: F401  (register all mappers)
from app.db.session import SessionLocal
from app.models.assignment import Assignment
from app.models.organization import Organization
from app.models.request_notification import RequestNotification
from app.models.request_requirement import RequestRequirement
from app.models.request_response import RequestResponse
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant


def _request_id_filter(session, tenant_slug: str | None):
    """The staffing_request ids in scope — all, or one tenant's orgs."""
    stmt = select(StaffingRequest.id)
    if tenant_slug is not None:
        tenant = session.scalar(select(Tenant).where(Tenant.slug == tenant_slug))
        if tenant is None:
            print(f"No tenant with slug '{tenant_slug}'.", file=sys.stderr)
            sys.exit(1)
        org_ids = select(Organization.id).where(Organization.tenant_id == tenant.id)
        stmt = stmt.where(StaffingRequest.organization_id.in_(org_ids))
    return stmt


def reset(tenant_slug: str | None) -> None:
    session = SessionLocal()
    try:
        req_ids = _request_id_filter(session, tenant_slug).subquery()
        req_id_col = select(req_ids)

        total = session.scalar(
            select(func.count()).select_from(req_ids)
        ) or 0
        if total == 0:
            scope = f"tenant '{tenant_slug}'" if tenant_slug else "the database"
            print(f"No staffing requests found for {scope} — nothing to clear.")
            return

        # Children first, then assignments (staffing_requests.replaces_assignment_id
        # is ON DELETE SET NULL, so clearing assignments won't orphan a request),
        # then the requests themselves.
        for model, col in (
            (RequestNotification, RequestNotification.staffing_request_id),
            (RequestResponse, RequestResponse.staffing_request_id),
            (RequestRequirement, RequestRequirement.staffing_request_id),
            (Assignment, Assignment.staffing_request_id),
        ):
            result = session.execute(delete(model).where(col.in_(req_id_col)))
            print(f"  deleted {result.rowcount or 0} {model.__tablename__}")

        result = session.execute(
            delete(StaffingRequest).where(StaffingRequest.id.in_(req_id_col))
        )
        print(f"  deleted {result.rowcount or 0} staffing_requests")

        session.commit()
        scope = f"tenant '{tenant_slug}'" if tenant_slug else "all networks"
        print(f"✓ Cleared staffing data for {scope}. Tenants, orgs, and users kept.")
    finally:
        session.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset staffing/shift data (keeps users/orgs/tenants).")
    parser.add_argument("--tenant", help="Limit the wipe to one network by slug.")
    args = parser.parse_args()
    reset(args.tenant)
