"""Self-serve replacement — the atomic claim (SELF_SERVE_REPLACEMENT §3, §9).

The unit tests use the savepoint session for behaviour; the concurrency test
(§9, the one that matters) uses independent connections off the shared engine so
the claims genuinely race, then cleans up its committed rows by hand.
"""
import threading
from datetime import date, datetime, time, timezone
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.enums import (
    AssignmentStatus,
    OrganizationType,
    RequestOrigin,
    RequestRole,
    RequestStatus,
    RequestType,
    UserRole,
)
from app.models.organization import Organization
from app.models.staffing_request import StaffingRequest
from app.models.tenant import Tenant
from app.models.tenant_membership import TenantMembership
from app.models.user import User
from app.services.replacement_service import ReplacementService


def _make_request(session, org_id, creator_id, *, origin, status, replaces=None) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=org_id, created_by_user_id=creator_id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=origin, auto_assign=origin != RequestOrigin.COORDINATOR,
        replaces_assignment_id=replaces, title='Couverture matin', city='IntTestCity',
        work_date=date(2026, 7, 1), start_time=time(8, 0), end_time=time(16, 0),
    )
    session.add(req)
    session.flush()
    return req


def _confirmed_assignment(session, request_id, worker_id) -> Assignment:
    a = Assignment(
        id=uuid4(), staffing_request_id=request_id, worker_user_id=worker_id,
        assigned_by_user_id=worker_id, status=AssignmentStatus.CONFIRMED,
        assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
    )
    session.add(a)
    session.flush()
    return a


def _scenario(session, seed, giver, claimer_is_giver_org=True):
    """Original (assigned) request + giver's confirmed assignment, plus the open
    worker_replacement request that points at it. Returns the replacement req."""
    original = _make_request(
        session, seed.org.id, giver.id,
        origin=RequestOrigin.COORDINATOR, status=RequestStatus.ASSIGNED,
    )
    giver_assignment = _confirmed_assignment(session, original.id, giver.id)
    replacement = _make_request(
        session, seed.org.id, giver.id,
        origin=RequestOrigin.WORKER_REPLACEMENT, status=RequestStatus.OPEN,
        replaces=giver_assignment.id,
    )
    return replacement, giver_assignment


# ── behaviour (savepoint session) ───────────────────────────────────────────────

def test_claim_open_replacement_assigns_and_releases_original(db_session, seed):
    replacement, giver_assignment = _scenario(db_session, seed, seed.worker_a)

    result = ReplacementService(db_session).claim(
        replacement.id, seed.worker_b.id, seed.tenant.id,
    )

    assert result.worker_user_id == seed.worker_b.id
    assert result.status == AssignmentStatus.CONFIRMED
    db_session.refresh(replacement)
    assert replacement.status == RequestStatus.ASSIGNED
    assert replacement.assigned_worker_user_id == seed.worker_b.id
    db_session.refresh(giver_assignment)
    assert giver_assignment.status == AssignmentStatus.RELEASED


def test_second_claimer_gets_409(db_session, seed):
    replacement, _ = _scenario(db_session, seed, seed.worker_a)
    ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)

    with pytest.raises(HTTPException) as exc:
        # worker_a (the giver here) tries to grab it after worker_b won.
        ReplacementService(db_session).claim(replacement.id, seed.worker_a.id, seed.tenant.id)
    assert exc.value.status_code == 409
    assert exc.value.detail == 'already_filled'


def test_double_tap_by_winner_is_idempotent(db_session, seed):
    replacement, _ = _scenario(db_session, seed, seed.worker_a)
    first = ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    again = ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    assert again.id == first.id  # same assignment, no 409, no duplicate


def test_claim_from_another_tenant_is_rejected(db_session, seed):
    replacement, _ = _scenario(db_session, seed, seed.worker_a)
    # Right request id, wrong tenant → the org/tenant predicate misses → 409.
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).claim(replacement.id, seed.worker_b.id, uuid4())
    assert exc.value.status_code == 409


def test_coordinator_request_is_not_claimable(db_session, seed):
    coord_req = _make_request(
        db_session, seed.org.id, seed.org_admin.id,
        origin=RequestOrigin.COORDINATOR, status=RequestStatus.OPEN,
    )
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).claim(coord_req.id, seed.worker_b.id, seed.tenant.id)
    assert exc.value.status_code == 409  # origin not in self-serve set


# ── concurrency (§9 — independent connections, real race) ───────────────────────

def test_fifty_simultaneous_claims_yield_exactly_one_winner(db_engine):
    """§9.7: fire many claims at one request at once → exactly one assignment
    row, zero double-bookings. The acceptance test that makes the feature safe."""
    n_claimers = 50
    tenant_id = uuid4()
    org_id = uuid4()
    giver_id = uuid4()
    original_req_id = uuid4()
    giver_assignment_id = uuid4()
    replacement_req_id = uuid4()
    claimer_ids = [uuid4() for _ in range(n_claimers)]
    all_user_ids = [giver_id, *claimer_ids]
    req_ids = [original_req_id, replacement_req_id]

    setup = Session(bind=db_engine)
    try:
        setup.add(Tenant(id=tenant_id, name='Race Net', slug=f'race-{uuid4().hex[:8]}'))
        setup.add(Organization(
            id=org_id, tenant_id=tenant_id, name='Race Org',
            type=OrganizationType.CHILDCARE, city='RaceCity',
        ))
        setup.flush()
        for uid in all_user_ids:
            setup.add(User(
                id=uid, first_name='Race', last_name='Worker',
                email=f'race-{uid.hex[:10]}@inttest.example', role=UserRole.WORKER,
                preferred_language='fr',
            ))
            setup.add(TenantMembership(
                id=uuid4(), user_id=uid, tenant_id=tenant_id, role=UserRole.WORKER,
            ))
        setup.flush()
        # Original (assigned) request + the giver's confirmed assignment.
        setup.add(StaffingRequest(
            id=original_req_id, organization_id=org_id, created_by_user_id=giver_id,
            request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
            status=RequestStatus.ASSIGNED, origin=RequestOrigin.COORDINATOR,
            title='Quart original', city='RaceCity',
            work_date=date(2026, 7, 1), start_time=time(8, 0), end_time=time(16, 0),
        ))
        setup.add(Assignment(
            id=giver_assignment_id, staffing_request_id=original_req_id, worker_user_id=giver_id,
            assigned_by_user_id=giver_id, status=AssignmentStatus.CONFIRMED,
            assigned_at=datetime.now(timezone.utc), confirmed_at=datetime.now(timezone.utc),
        ))
        setup.flush()  # giver assignment must exist before the request FKs it
        # The open replacement request everyone races to claim.
        setup.add(StaffingRequest(
            id=replacement_req_id, organization_id=org_id, created_by_user_id=giver_id,
            request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
            status=RequestStatus.OPEN, origin=RequestOrigin.WORKER_REPLACEMENT,
            auto_assign=True, replaces_assignment_id=giver_assignment_id,
            title='Besoin de suppléance', city='RaceCity',
            work_date=date(2026, 7, 1), start_time=time(8, 0), end_time=time(16, 0),
        ))
        setup.commit()
        setup.close()

        results: dict[UUID, object] = {}
        barrier = threading.Barrier(n_claimers)

        def claim(uid: UUID):
            s = Session(bind=db_engine)
            try:
                barrier.wait()  # release all threads at the same instant
                ReplacementService(s).claim(replacement_req_id, uid, tenant_id)
                results[uid] = 'ok'
            except HTTPException as exc:
                results[uid] = exc.status_code
            except Exception as exc:  # pragma: no cover - surfaces unexpected races
                results[uid] = repr(exc)
            finally:
                s.close()

        threads = [threading.Thread(target=claim, args=(uid,)) for uid in claimer_ids]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        winners = [uid for uid, r in results.items() if r == 'ok']
        losers = [r for uid, r in results.items() if r != 'ok']
        assert len(winners) == 1, f'expected exactly one winner, got {len(winners)}: {results}'
        assert all(r == 409 for r in losers), f'all losers must be 409: {losers}'

        verify = Session(bind=db_engine)
        try:
            req = verify.get(StaffingRequest, replacement_req_id)
            assert req.status == RequestStatus.ASSIGNED
            assert req.assigned_worker_user_id == winners[0]
            # Exactly one assignment row on the replacement request.
            claim_assignments = verify.scalars(
                select(Assignment).where(Assignment.staffing_request_id == replacement_req_id)
            ).all()
            assert len(claim_assignments) == 1
            assert claim_assignments[0].worker_user_id == winners[0]
            assert claim_assignments[0].status == AssignmentStatus.CONFIRMED
            # The giver's original assignment was released.
            giver_a = verify.get(Assignment, giver_assignment_id)
            assert giver_a.status == AssignmentStatus.RELEASED
        finally:
            verify.close()
    finally:
        _cleanup(db_engine, req_ids, all_user_ids, org_id, tenant_id)


def _cleanup(db_engine, req_ids, user_ids, org_id, tenant_id):
    s = Session(bind=db_engine)
    try:
        s.execute(delete(Assignment).where(Assignment.staffing_request_id.in_(req_ids)))
        s.execute(delete(AuditLog).where(AuditLog.organization_id == org_id))
        s.execute(delete(StaffingRequest).where(StaffingRequest.id.in_(req_ids)))
        s.execute(delete(TenantMembership).where(TenantMembership.tenant_id == tenant_id))
        s.execute(delete(User).where(User.id.in_(user_ids)))
        s.execute(delete(Organization).where(Organization.id == org_id))
        s.execute(delete(Tenant).where(Tenant.id == tenant_id))
        s.commit()
    finally:
        s.close()
