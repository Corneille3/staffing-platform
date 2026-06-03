"""The isolation acceptance test (MULTITENANCY_HANDOFF §11), at the application
layer: two fully-populated tenants must not see each other's data through the
API, while the platform operator sees both tenants' counts but no row data.

(Point §11.6 — a WHERE-less SELECT returning zero cross-tenant rows — is the
RLS-specific guarantee and is covered separately when RLS lands.)
"""
from datetime import date, time
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.deps import get_db_session
from app.main import app
from app.models.enums import OrganizationType, RequestStatus, UserRole
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.tests.conftest import make_token


def _make_client(db_session, sub):
    from fastapi.testclient import TestClient

    def _override():
        yield db_session

    app.dependency_overrides[get_db_session] = _override
    return TestClient(app, headers={"Authorization": f"Bearer {make_token(sub, 'x')}"})


def _build_tenant(db_session, slug, city):
    tenant = Tenant(id=uuid4(), name=f"Net {slug}", slug=f"{slug}-{uuid4().hex[:6]}")
    org = Organization(
        id=uuid4(), tenant_id=tenant.id, name=f"Org {slug}",
        type=OrganizationType.CHILDCARE, city=city, preferred_language="fr", is_active=True,
    )
    admin = User(
        id=uuid4(), clerk_user_id=f"iso-{slug}-admin", first_name="Adm", last_name=slug,
        email=f"adm-{uuid4().hex[:6]}@{slug}.example", role=UserRole.NETWORK_ADMIN, preferred_language="fr",
    )
    db_session.add_all([tenant, org, admin])
    db_session.flush()
    db_session.add_all([
        TenantMembership(id=uuid4(), user_id=admin.id, tenant_id=tenant.id,
                         role=UserRole.NETWORK_ADMIN, is_active=True),
        OrganizationMembership(id=uuid4(), user_id=admin.id, organization_id=org.id,
                               role=UserRole.NETWORK_ADMIN, is_active=True),
    ])
    request = StaffingRequest(
        id=uuid4(), organization_id=org.id, created_by_user_id=admin.id,
        request_type="urgent_replacement", title=f"Shift {slug}", city=city,
        work_date=date(2026, 9, 1), start_time=time(8, 0), end_time=time(16, 0),
        urgency_level=2, status=RequestStatus.NOTIFIED,
    )
    db_session.add(request)
    db_session.flush()
    return SimpleNamespace(tenant=tenant, org=org, admin=admin, request=request)


@pytest.fixture
def two_tenants(db_session):
    a = _build_tenant(db_session, "reseau-qc", "Quebec")
    b = _build_tenant(db_session, "fcpe-mtl", "Montreal")
    op = User(id=uuid4(), clerk_user_id="iso-op", first_name="Op", last_name="Erator",
              email=f"op-{uuid4().hex[:6]}@staffig.example", role=UserRole.PLATFORM_ADMIN,
              preferred_language="en")
    db_session.add(op)
    db_session.flush()
    yield SimpleNamespace(a=a, b=b, op=op)
    app.dependency_overrides.pop(get_db_session, None)


def test_tenant_admin_sees_only_own_requests(two_tenants, db_session):
    client_a = _make_client(db_session, two_tenants.a.admin.clerk_user_id)
    data = client_a.get("/api/v1/admin/requests?tab=all").json()
    titles = {row["title"] for row in data["items"]}
    assert "Shift reseau-qc" in titles
    assert "Shift fcpe-mtl" not in titles


def test_cross_tenant_request_by_id_is_hidden(two_tenants, db_session):
    client_a = _make_client(db_session, two_tenants.a.admin.clerk_user_id)
    resp = client_a.get(f"/api/v1/requests/{two_tenants.b.request.id}")
    assert resp.status_code in (403, 404)


def test_each_admin_isolated(two_tenants, db_session):
    client_b = _make_client(db_session, two_tenants.b.admin.clerk_user_id)
    data = client_b.get("/api/v1/admin/requests?tab=all").json()
    titles = {row["title"] for row in data["items"]}
    assert "Shift fcpe-mtl" in titles
    assert "Shift reseau-qc" not in titles


def test_platform_operator_sees_both_tenant_counts(two_tenants, db_session):
    client_op = _make_client(db_session, two_tenants.op.clerk_user_id)
    data = client_op.get("/api/v1/platform/tenants").json()
    slugs = {t["slug"] for t in data["tenants"]}
    assert two_tenants.a.tenant.slug in slugs
    assert two_tenants.b.tenant.slug in slugs
    # Counts only — rows never carry worker names or request titles.
    for row in data["tenants"]:
        assert set(row) == {
            "id", "name", "slug", "region", "status", "org_count",
            "substitute_count", "fill_rate_30d", "admin_name", "admin_email", "since",
        }
