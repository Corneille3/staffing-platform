"""Self-serve replacement — the atomic claim (SELF_SERVE_REPLACEMENT §3, §9).

The unit tests use the savepoint session for behaviour; the concurrency test
(§9, the one that matters) uses independent connections off the shared engine so
the claims genuinely race, then cleans up its committed rows by hand.
"""
import threading
from datetime import date, datetime, time, timedelta, timezone
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
from app.auth.scope import AccessScope
from app.models.enums import EmploymentType, ReplacementPolicy
from app.schemas.replacement import ReplacementPolicyUpdate
from app.schemas.worker import WorkerInviteCreate
from app.services.replacement_admin_service import ReplacementAdminService
from app.services.replacement_service import ReplacementService
from app.services.worker_service import WorkerService


def _worker_scope(seed, worker) -> AccessScope:
    return AccessScope(user=worker, tenant_id=seed.tenant.id)


def _admin_scope(seed) -> AccessScope:
    # seed.apf is a network_admin → sees every org in the tenant.
    return AccessScope(user=seed.apf, tenant_id=seed.tenant.id)


def _assigned_shift(session, seed, worker):
    """An assigned coordinator request + the worker's confirmed assignment."""
    original = _make_request(
        session, seed.org.id, seed.org_admin.id,
        origin=RequestOrigin.COORDINATOR, status=RequestStatus.ASSIGNED,
    )
    assignment = _confirmed_assignment(session, original.id, worker.id)
    return original, assignment


def _make_request(session, org_id, creator_id, *, origin, status, replaces=None) -> StaffingRequest:
    req = StaffingRequest(
        id=uuid4(), organization_id=org_id, created_by_user_id=creator_id,
        request_type=RequestType.URGENT_REPLACEMENT, role=RequestRole.EDUCATOR,
        status=status, origin=origin, auto_assign=origin != RequestOrigin.COORDINATOR,
        replaces_assignment_id=replaces, title='Couverture matin', city='IntTestCity',
        # Relative — release()/publish reject past shifts, a literal date rots.
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
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


# ── release (worker creates the replacement request) ────────────────────────────

def test_release_creates_open_replacement(db_session, seed):
    original, assignment = _assigned_shift(db_session, seed, seed.worker_a)

    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )

    assert replacement.origin == RequestOrigin.WORKER_REPLACEMENT
    assert replacement.status == RequestStatus.OPEN  # seed org policy defaults to auto
    assert replacement.auto_assign is True
    assert replacement.replaces_assignment_id == assignment.id
    assert replacement.release_reason == 'sick'
    assert replacement.work_date == original.work_date  # shift details copied
    # The giver still holds the shift until someone claims it (§7).
    db_session.refresh(assignment)
    assert assignment.status == AssignmentStatus.CONFIRMED


def test_release_requires_held_shift(db_session, seed):
    # worker_b doesn't hold this shift → no confirmed assignment → 409.
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).release(
            original.id, _worker_scope(seed, seed.worker_b), reason=None,
        )
    assert exc.value.status_code == 409


def test_release_rejects_unknown_reason(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).release(
            original.id, _worker_scope(seed, seed.worker_a), reason='vacation',
        )
    assert exc.value.status_code == 422


def test_release_role_not_allowed(db_session, seed):
    seed.org.replacement_allowed_roles = ['psw']  # educator no longer allowed
    db_session.flush()
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).release(
            original.id, _worker_scope(seed, seed.worker_a), reason=None,
        )
    assert exc.value.status_code == 403


def test_release_twice_is_409(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    svc = ReplacementService(db_session)
    svc.release(original.id, _worker_scope(seed, seed.worker_a), reason=None)
    with pytest.raises(HTTPException) as exc:
        svc.release(original.id, _worker_scope(seed, seed.worker_a), reason=None)
    assert exc.value.status_code == 409


def test_release_managed_policy_publishes_for_responses(db_session, seed):
    # Managed: broadcast like a normal request (NOTIFIED, not auto-assign) so
    # workers accept/decline and the coordinator assigns.
    from app.models.request_response import RequestResponse
    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    db_session.flush()
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    assert replacement.status == RequestStatus.NOTIFIED
    assert replacement.auto_assign is False
    notified = set(db_session.scalars(select(RequestResponse.worker_user_id).where(
        RequestResponse.staffing_request_id == replacement.id,
    )))
    assert seed.worker_b.id in notified  # pool alerted via the normal publish


# ── broadcast + claim endpoint + cancel + status ────────────────────────────────

def test_release_broadcasts_to_eligible_pool_excluding_giver(db_session, seed):
    from app.models.request_response import RequestResponse
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    notified = set(db_session.scalars(select(RequestResponse.worker_user_id).where(
        RequestResponse.staffing_request_id == replacement.id,
    )))
    assert seed.worker_b.id in notified       # eligible pool alerted
    assert seed.worker_a.id not in notified    # never alert the giver


def test_claim_endpoint_assigns_eligible_worker(db_session, seed, worker_b_client):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    resp = worker_b_client.post(f'/api/v1/requests/{replacement.id}/claim')
    assert resp.status_code == 200, resp.text
    assert resp.json()['worker_user_id'] == str(seed.worker_b.id)
    db_session.refresh(replacement)
    assert replacement.status == RequestStatus.ASSIGNED


def test_claim_endpoint_second_worker_409(db_session, seed, worker_a_client, worker_b_client):
    # worker_a is the giver; have an unrelated giver so both a & b can claim.
    original, _ = _assigned_shift(db_session, seed, seed.org_admin)  # org_admin holds it
    replacement = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.org_admin), reason=None,
    )
    first = worker_b_client.post(f'/api/v1/requests/{replacement.id}/claim')
    assert first.status_code == 200, first.text
    second = worker_a_client.post(f'/api/v1/requests/{replacement.id}/claim')
    assert second.status_code == 409
    assert second.json()['detail'] == 'already_filled'


def test_cancel_release_by_giver(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    svc = ReplacementService(db_session)
    replacement = svc.release(original.id, _worker_scope(seed, seed.worker_a), reason=None)
    cancelled = svc.cancel_release(replacement.id, _worker_scope(seed, seed.worker_a))
    assert cancelled.status == RequestStatus.CANCELLED


def test_cancel_release_by_non_giver_403(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    svc = ReplacementService(db_session)
    replacement = svc.release(original.id, _worker_scope(seed, seed.worker_a), reason=None)
    with pytest.raises(HTTPException) as exc:
        svc.cancel_release(replacement.id, _worker_scope(seed, seed.worker_b))
    assert exc.value.status_code == 403


def test_cancel_release_after_claim_409(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.org_admin)
    svc = ReplacementService(db_session)
    replacement = svc.release(original.id, _worker_scope(seed, seed.org_admin), reason=None)
    svc.claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    with pytest.raises(HTTPException) as exc:
        svc.cancel_release(replacement.id, _worker_scope(seed, seed.org_admin))
    assert exc.value.status_code == 409


def test_replacement_status_tally(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.org_admin)
    svc = ReplacementService(db_session)
    replacement = svc.release(original.id, _worker_scope(seed, seed.org_admin), reason=None)
    before = svc.replacement_status(replacement.id, _worker_scope(seed, seed.org_admin))
    assert before['alerted'] >= 1
    assert before['filled'] is False

    svc.claim(replacement.id, seed.worker_b.id, seed.tenant.id)
    after = svc.replacement_status(replacement.id, _worker_scope(seed, seed.org_admin))
    assert after['filled'] is True
    assert after['claimed_by_name'] == f'{seed.worker_b.first_name} {seed.worker_b.last_name}'


# ── coordinator feed + policy + employment type ─────────────────────────────────

def test_coordinator_feed_and_kpis(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    repl = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason='sick',
    )
    admin = ReplacementAdminService(db_session)
    feed = admin.coordinator_feed(_admin_scope(seed))
    assert any(i.request_id == repl.id and i.status == 'searching' for i in feed.items)
    assert feed.kpis.released_this_week >= 1

    ReplacementService(db_session).claim(repl.id, seed.worker_b.id, seed.tenant.id)
    after = admin.coordinator_feed(_admin_scope(seed))
    item = next(i for i in after.items if i.request_id == repl.id)
    assert item.status == 'filled'
    assert item.claimer_name == f'{seed.worker_b.first_name} {seed.worker_b.last_name}'
    assert item.time_to_fill_minutes is not None


def test_coordinator_feed_status_filter(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    repl = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    admin = ReplacementAdminService(db_session)
    live = admin.coordinator_feed(_admin_scope(seed), status_filter='live')
    assert any(i.request_id == repl.id for i in live.items)
    history = admin.coordinator_feed(_admin_scope(seed), status_filter='history')
    assert all(i.request_id != repl.id for i in history.items)  # still searching → not history


def test_policy_get_and_set(db_session, seed):
    admin = ReplacementAdminService(db_session)
    pol = admin.get_policy(seed.org.id, _admin_scope(seed))
    assert pol.policy == ReplacementPolicy.AUTO
    assert pol.min_release_lead_minutes == 0

    updated = admin.set_policy(
        seed.org.id,
        ReplacementPolicyUpdate(policy=ReplacementPolicy.MANAGED, min_release_lead_minutes=120),
        _admin_scope(seed),
    )
    assert updated.policy == ReplacementPolicy.MANAGED
    assert updated.min_release_lead_minutes == 120


def test_policy_out_of_scope_403(db_session, seed):
    admin = ReplacementAdminService(db_session)
    with pytest.raises(HTTPException) as exc:
        admin.get_policy(uuid4(), _admin_scope(seed))  # unknown org → not in scope
    assert exc.value.status_code == 403


def test_worker_invite_sets_employment_type(db_session, seed):
    user = WorkerService(db_session).invite(
        WorkerInviteCreate(
            first_name='Perm', last_name='Staff',
            email=f'perm-{uuid4().hex[:8]}@inttest.example',
            employment_type=EmploymentType.PERMANENT,
        ),
        _admin_scope(seed),
    )
    membership = db_session.scalar(select(TenantMembership).where(
        TenantMembership.user_id == user.id,
    ))
    assert membership.employment_type == EmploymentType.PERMANENT


# ── managed mode (coordinator assigns) + escalation sweep (§5, §7) ──────────────

def test_managed_release_assigned_by_coordinator_frees_giver(db_session, seed):
    """Managed mode: released shift broadcasts, a worker accepts, the
    coordinator assigns them — and that frees the giver's original shift."""
    from app.models.enums import ResponseStatus
    from app.schemas.assignment import AssignmentCreate
    from app.services.assignment_service import AssignmentService
    from app.services.response_service import ResponseService

    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    db_session.flush()
    original, giver_assignment = _assigned_shift(db_session, seed, seed.worker_a)
    repl = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    assert repl.status == RequestStatus.NOTIFIED

    # worker_b accepts (the normal response flow), then the coordinator assigns.
    ResponseService(db_session).set_status(repl.id, seed.worker_b.id, ResponseStatus.ACCEPTED)
    AssignmentService(db_session).assign(AssignmentCreate(
        staffing_request_id=repl.id,
        worker_user_id=seed.worker_b.id,
        assigned_by_user_id=seed.org_admin.id,
    ))

    db_session.refresh(repl)
    db_session.refresh(giver_assignment)
    assert repl.status == RequestStatus.ASSIGNED
    assert repl.assigned_worker_user_id == seed.worker_b.id
    # The coordinator's assignment freed the original holder (mirrors the claim).
    assert giver_assignment.status == AssignmentStatus.RELEASED


def test_sweep_expires_past_cutoff_open(db_session, seed):
    original, _ = _assigned_shift(db_session, seed, seed.worker_a)
    repl = ReplacementService(db_session).release(
        original.id, _worker_scope(seed, seed.worker_a), reason=None,
    )
    repl.work_date = date(2020, 1, 1)  # shift long past, never claimed
    db_session.flush()

    result = ReplacementAdminService(db_session).sweep(_admin_scope(seed))
    assert result['expired'] >= 1
    db_session.refresh(repl)
    assert repl.status == RequestStatus.EXPIRED


# ── permanent-staff absence report (§1) ─────────────────────────────────────────

def _absence_payload(seed, role=RequestRole.EDUCATOR, reason='sick'):
    from app.schemas.replacement import AbsenceReportCreate
    return AbsenceReportCreate(
        organization_id=seed.org.id, role=role,
        work_date=date.today() + timedelta(days=21),
        start_time=time(8, 0), end_time=time(16, 0),
        reason=reason, note='Rendez-vous médical',
    )


def test_report_absence_creates_staff_absence_and_broadcasts(db_session, seed):
    from app.models.request_response import RequestResponse
    repl = ReplacementService(db_session).report_absence(
        _absence_payload(seed), _worker_scope(seed, seed.worker_a),
    )
    assert repl.origin == RequestOrigin.STAFF_ABSENCE
    assert repl.replaces_assignment_id is None  # no held shift
    assert repl.auto_assign is True             # auto policy
    assert repl.status == RequestStatus.OPEN
    notified = set(db_session.scalars(select(RequestResponse.worker_user_id).where(
        RequestResponse.staffing_request_id == repl.id,
    )))
    assert seed.worker_b.id in notified  # pool alerted


def test_report_absence_managed_publishes(db_session, seed):
    seed.org.replacement_policy = ReplacementPolicy.MANAGED
    db_session.flush()
    repl = ReplacementService(db_session).report_absence(
        _absence_payload(seed), _worker_scope(seed, seed.worker_a),
    )
    assert repl.status == RequestStatus.NOTIFIED
    assert repl.auto_assign is False


def test_report_absence_role_not_allowed_403(db_session, seed):
    seed.org.replacement_allowed_roles = ['psw']  # educator not allowed
    db_session.flush()
    with pytest.raises(HTTPException) as exc:
        ReplacementService(db_session).report_absence(
            _absence_payload(seed), _worker_scope(seed, seed.worker_a),
        )
    assert exc.value.status_code == 403


def test_my_absence_reports_shows_status(db_session, seed):
    svc = ReplacementService(db_session)
    repl = svc.report_absence(_absence_payload(seed, reason=None), _worker_scope(seed, seed.worker_a))
    # The reporter can list it back with status (so it survives navigating away).
    mine = svc.my_absence_reports(_worker_scope(seed, seed.worker_a))
    row = next(m for m in mine if m['request_id'] == repl.id)
    assert row['status'] == 'searching'
    assert row['alerted'] >= 1

    svc.claim(repl.id, seed.worker_b.id, seed.tenant.id)
    mine2 = svc.my_absence_reports(_worker_scope(seed, seed.worker_a))
    row2 = next(m for m in mine2 if m['request_id'] == repl.id)
    assert row2['status'] == 'filled'
    assert row2['claimed_by_name'] == f'{seed.worker_b.first_name} {seed.worker_b.last_name}'


def test_reported_absence_is_claimable(db_session, seed):
    repl = ReplacementService(db_session).report_absence(
        _absence_payload(seed, reason=None), _worker_scope(seed, seed.worker_a),
    )
    assignment = ReplacementService(db_session).claim(repl.id, seed.worker_b.id, seed.tenant.id)
    assert assignment.worker_user_id == seed.worker_b.id
    db_session.refresh(repl)
    assert repl.status == RequestStatus.ASSIGNED  # staff_absence claimed like a release


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
