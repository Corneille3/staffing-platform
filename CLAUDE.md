# CLAUDE.md

This file is the working reference for Claude (or any AI agent) collaborating on the
APF Staffing Platform. It supersedes older planning docs where they conflict —
`IMPLEMENTATION_PLAN.md` describes the *initial* foundation phase and is partially
superseded; `Implementation-idea.md` and the project README describe the *current*
product direction. Read `.codex` for a timeline of what has shipped.

## ⚡ Session pickup

When the user opens a new session and asks where we left off, **first check
that all the recent implementation is visible** — do not rely on what their
editor is showing, since stale VS Code buffers have caused phantom "missing
code" reports more than once.

Run, in this order:

```
git -C /home/corneille3/STAFFIG-PLATFORM status
git -C /home/corneille3/STAFFIG-PLATFORM log --oneline -10
```

The working tree should be clean and the most recent commits should include
the row-level scoping (`AccessScope`), the RBAC enforcement, the `/auth/sync`
linking endpoint, and the Clerk wiring. If anything looks missing in the
editor, walk the user through the same "Revert File / restart Terraform LSP /
close-and-reopen the IDE" troubleshooting from prior sessions — the disk
state is authoritative.

**Last shipped (most recent first):**
1. B1 — CoverageType enum (same_day_urgent · planned_absence · recurring ·
   emergency), create form contact fields, bilingual badge on worker cards.
   Bug fix: assignment cancellation resets worker response to notified
   instead of declined so they can re-respond.
2. A11 — "Request filled" notice + Re-notify workers action. Worker
   requests page shows filled requests with bilingual notice. Admin
   `RequestWorkflowCard` gains "Re-notify workers" button (shown when
   status=responses_received and no accepted responses remain).
   `POST /requests/{id}/renotify` resets declined responses and
   re-dispatches notifications to eligible workers.
2. A10 — Notification feed. `GET /notifications/feed?worker_user_id=`
   synthesises typed events (new_request · urgent · assigned · cancelled ·
   not_selected) from existing tables. `/worker/notifications` page renders
   grouped bilingual cards with relative timestamps. 🔔 Alerts nav tab added.
2. A8 + A9 — Assignment detail enrichments + preferred cities.
   A8: `contact_name`, `contact_phone`, `contact_email`, `arrival_instructions`
   added to `staffing_requests` (model, migration, schema, SQL doc, TS types,
   seed). Worker assignment card surfaces contact block (tappable tel/mailto
   links), arrival instructions, and a Google Calendar add-to-calendar link;
   coordinator notes hidden from worker view. A9: preferred cities picker on
   `/worker/availability` — chip list with × remove + text input to add;
   backed by `worker_regions` table; PATCH `/workers/{id}/availability` now
   accepts `supported_cities: list[str]` and replaces region rows atomically.
2. Bug fixes + admin UX polish — psycopg3 UUID adapter registration via
   `register_default_adapters` (fixed 500 on `GET /workers`); admin request
   workflow sorted newest-first by `created_at`; worker response status labels
   humanised ("Notified — awaiting reply" / "Accepted" / "Declined") in
   `RequestWorkflowCard`. Assigned requests already hidden from worker view
   (status filter `["open","notified","responses_received"]` was in place from A3)
   and reappear automatically when an assignment is cancelled.
2. Assignment cancellation (`POST /assignments/{id}/cancel`) — rolls back
   request to `responses_received`, resets worker response, audit logged.
   Unique constraint on `assignments.staffing_request_id` dropped so
   requests can be re-assigned after cancellation.
3. Admin `RequestWorkflowCard` — `WorkerReviewCard` with eligibility chips
   (city, language, qualifications, certifications) per accepted worker;
   `AssignedWorkerCard` + `CancelAssignmentModal` for cancellation flow.
4. `GET /requests/{id}/eligibility` — per-rule pass/fail for a worker
   against a request. `MatchingService.eligibility_result()` is the
   canonical eligibility check (also used internally by `eligible_workers`).
   `EligibilityReason` / `EligibilityResult` in `schemas/eligibility.py`.
5. Worker-side human status labels (`frontend/src/lib/status-labels.ts`) —
   bilingual EN/FR, driven by `worker.preferred_language`. Covers response,
   assignment, request, and availability statuses. `workerRequestPerspective()`
   derives the correct combined label from request + response state.
6. `GET /workers` filter pushed to query layer (`list_for_scope`).
7. Row-level / org scoping via `AccessScope` (`backend/app/auth/scope.py`)
8. RBAC enforcement on every `/api/v1/*` endpoint
9. `POST /auth/sync` — Clerk → DB user link/provision flow

**Top remaining gaps** (see "Known gaps" section for the full list):
1. Email/SMS notifications are stubs
2. CI workflows are placeholder echos
3. No integration test coverage (auth gates only)

If the user asks "what's next?" — check the Implementation roadmap section.

## What this project is

A bilingual (FR/EN) substitute-staffing dispatch MVP for Quebec daycares, schools, and
community centres. Three distinct audiences live inside one repo:

- **Workers** — accept/decline shift requests, manage availability
- **Org admins** — create requests, run dispatch, confirm assignments
- **APF admins** — network-wide oversight and reporting

The product is **three apps in one shell**, not a single admin console with role
toggles. Treat each surface as having its own UX language.

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic, PostgreSQL 16
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, inline styles
- **Local dev**: Docker Compose (`db`, `backend`, `frontend`)
- **Auth**: Clerk (see `docs/decisions/adr-004-auth-provider-clerk.md`) —
  `@clerk/nextjs` integrated on the frontend, backend verifies Clerk JWTs
  via JWKS, frontend forwards the JWT on every API call
- **Infra**: Terraform scaffold for AWS (VPC, RDS, EC2 app-runtime, S3+CloudFront,
  SES, Secrets Manager — Clerk keys + issuer URL + JWKS URL stored as
  secrets) — **not deployed yet, do not deploy**

## Repository layout

```
backend/              FastAPI service
  app/
    api/v1/           Route handlers grouped by resource
    auth/             Clerk JWT decode (NOT production-safe yet — see Gaps)
    core/             config, logging, security
    db/               SQLAlchemy base + session
    models/           ORM models (normalized per docs/schema-alignment.md)
    notifications/    email/sms/in-app stubs
    repositories/     persistence layer
    schemas/          Pydantic request/response schemas
    scripts/          seed_dev_data.py
    services/         domain logic (matching, request lifecycle, etc.)
    tests/            pytest (smoke-only today)
  migrations/         Alembic — single initial migration
frontend/
  src/
    middleware.ts             clerkMiddleware (active when Clerk key set)
    app/
      layout.tsx              root: ClerkProvider (conditional) + RoleProvider
      page.tsx                root redirector by role
      sign-in/[[...]]/        Clerk catch-all sign-in route
      sign-up/[[...]]/        Clerk catch-all sign-up route
      admin/*                 org admin surface (dashboard / tables)
      worker/*                worker surface (mobile-first, card-based)
      apf/*                   APF oversight surface (dark, read-only)
    components/        admin-navigation, role-switcher, worker-availability-control,
                       request-create-form, request-workflow-card, panels, etc.
    lib/
      api.ts           server-side fetch helpers (Docker-internal URL,
                       attaches Clerk JWT via auth() when configured)
      browser-api.ts   client-side fetch helpers (NEXT_PUBLIC_API_BASE_URL,
                       attaches Clerk JWT via window.Clerk.session.getToken)
      role-context.tsx RoleProvider with Clerk + Dev variants, useRole,
                       ROLE_HOME map
      worker-session.tsx active-worker context with Clerk + Dev variants
                         (Clerk variant matches by clerk_user_id)
      types.ts         shared TS types
infra/                Terraform modules + dev/prod environments (idle)
docs/
  decisions/          ADR-001..003 (single account / public app+private DB / no NAT)
  initial_database_schema.sql
  schema-alignment.md  decision: normalized tables for matching/compliance data
.github/workflows/    placeholder CI (all are echo stubs today)
docker-compose.yml
Makefile              up / down / migrate / seed / test
cleanup.sh            local disk reclaim helper for Docker iteration
```

## Frontend architecture (current)

Three role-scoped surfaces share the same root layout but have **distinct shells,
nav, and visual language**:

| Path        | Audience    | Shell feel                                          |
|-------------|-------------|-----------------------------------------------------|
| `/admin/*`  | Org admins  | Light cream, top nav, dashboard + tables            |
| `/worker/*` | Workers     | Mobile-first, bottom nav, large cards, big buttons  |
| `/apf/*`    | APF admins  | Dark, sticky header, metrics + read-only tables     |

### Auth wiring (Clerk, conditional)

The frontend integrates `@clerk/nextjs` end-to-end and is **conditionally
activated** based on whether `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set:

- **Key present** →
  - `ClerkProvider` wraps the app
  - `clerkMiddleware` (in `src/middleware.ts`) protects every route except
    `/sign-in/*` and `/sign-up/*`
  - `ClerkSyncBoundary` (mounted in the root layout) fires
    `POST /api/v1/auth/sync` once when a user becomes signed in. The
    backend resolves the Clerk identity to a `users` row: lookup by
    `clerk_user_id` → lookup by email (link if found) → JIT-create. Names
    and email are pulled from JWT claims when present, otherwise from the
    Clerk Backend API (`GET /v1/users/{id}`) using `CLERK_SECRET_KEY`.
  - `RoleProvider` reads role from `useUser().publicMetadata.role`
    (with the dev role-switcher available as a preview override)
  - `WorkerSessionProvider` auto-picks the worker whose `clerk_user_id`
    equals the signed-in `useUser().user.id`; manual override still wins
  - `lib/api.ts` and `lib/browser-api.ts` attach
    `Authorization: Bearer <Clerk JWT>` to every request
  - Backend (`auth/clerk.py`) verifies the JWT signature against the
    Clerk JWKS (cached for 1h) and enforces the issuer claim
  - Every `/api/v1/*` route requires authentication. `auth/permissions.py`
    exposes `require_admin` (apf_admin or org_admin) and `require_apf`
    (apf_admin only); these are applied as dependencies on writes,
    assignments, reports, and audit logs. Routes accept/decline workers
    can hit (worker actions, GET request listings) stay open to all
    authenticated roles
  - Row-level scoping via `auth/scope.py`: `get_access_scope` resolves
    the caller's `users` row + active `organization_memberships` into an
    `AccessScope` (`is_apf`, `is_org_admin`, `is_worker`, `org_ids`).
    Repositories expose `list_for_scope(scope)` methods that filter by
    role: APF sees all rows; org_admin filtered by `org_ids`; worker
    filtered by `user.id` (responses, assignments) or membership
    (notifications). Routes that fetch a single resource call
    `repo.can_access(resource, scope)` and return 403 on mismatch.
- **Key absent** → middleware passes through, no `ClerkProvider`, the dev
  role switcher + worker picker run as the only auth shim, no
  `Authorization` header is sent. This keeps the local stack working
  before any Clerk dev instance is set up.

The conditional pattern is uniform: `RoleProvider` and
`WorkerSessionProvider` each ship with a `Clerk*` variant and a `Dev*`
variant. The export picks one based on the env var, so `useRole()` and
`useWorkerSession()` look the same regardless.

To turn on Clerk locally:
1. Create a Clerk app, copy the publishable + secret keys, and grab
   `Frontend API` (issuer) and `JWKS Endpoint` from the Clerk dashboard.
2. Add to `frontend/.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
3. Add to `backend/.env`:
   ```
   CLERK_ISSUER_URL=https://your-instance.clerk.accounts.dev
   CLERK_JWKS_URL=https://your-instance.clerk.accounts.dev/.well-known/jwks.json
   ```
4. Recreate the frontend container so the new package + env vars take effect:
   ```
   docker compose down
   docker volume rm staffig-platform_frontend_node_modules
   docker compose up --build
   ```
5. Visit `/sign-in` to authenticate.

### Dev role + worker selection (always available)

A floating **role-switcher** pill (bottom-right) writes
`localStorage["apf.devRole"]` and navigates to the matching surface. The root
`/` redirects based on that role.

The worker surface additionally uses a **WorkerSession** context. On first
visit to `/worker/*`, users pick which worker they are previewing as
(`localStorage["apf.workerId"]`). Sign-out from the profile page clears it.

These dev shims still run even when Clerk is enabled — they act as
preview overrides on top of the real Clerk session, useful for jumping
between roles or impersonating a specific worker without juggling multiple
Clerk users.

### Two API helpers

- **`lib/api.ts`** — used in **server components** (admin pages). Reads from
  `API_BASE_URL` (default `http://backend:8000`, the Docker network URL).
- **`lib/browser-api.ts`** — used in **client components** (worker pages,
  interactive admin components). Reads from `NEXT_PUBLIC_API_BASE_URL`
  (default `http://localhost:8000`).

Don't mix them. Server components fetching during render → `api.ts`. Client
components fetching in `useEffect` or on user action → `browser-api.ts`.

## Backend architecture (current)

Standard FastAPI layout: routes (`api/v1/*`) → services (`services/*`) →
repositories (`repositories/*`) → SQLAlchemy models. Pydantic schemas in
`schemas/*`. Domain enums in `models/enums.py`.

Key business logic lives in `services/matching_service.py` — given a published
staffing request, returns eligible workers filtered by:

1. Active + has profile
2. Availability = available
3. Worker's supported cities include the request city
4. Worker has every required qualification (code match)
5. Worker has every required certification (code match)
6. Language match (request lang ∈ worker langs OR worker is bilingual)

The request lifecycle is `draft → open → notified → responses_received →
assigned → completed` (with `cancelled` / `expired` as terminal exits). This is
implemented across `staffing_request_service`, `response_service`, and
`assignment_service`. All transitions write `audit_logs`.

## Schema policy

Per `docs/schema-alignment.md`: **normalized tables for any field that drives
matching, compliance, reporting, or permissions**. JSONB is fine for audit
payloads, provider-specific notification payloads, and incidental metadata —
never for core matching dimensions.

Concretely: worker capabilities (`worker_regions`, `worker_qualifications`,
`worker_certifications`) and request constraints (`request_requirements`) are
all separate tables. The API may still expose convenience arrays
(`supported_cities`, `qualifications`, `required_qualifications`, etc.) for
frontend ergonomics, but the underlying storage stays normalized.

Since there is no production data yet, schema corrections happen by editing the
initial migration directly — do not stack compatibility migrations.

## What's working end-to-end

- Docker Compose stack boots; backend, frontend, DB all healthy
- `make migrate && make seed` populates a working dataset
- Full admin lifecycle: create → publish → notify → accept/decline → assign
- Frontend reads live data from FastAPI for all three surfaces
- Three role-scoped surfaces with distinct shells: `/admin/*`, `/worker/*`,
  `/apf/*`, with a role-aware redirect at `/`
- Clerk integration (when keys are configured): sign-in, sign-up,
  middleware-protected routes, JWT forwarded server-side and client-side,
  signature-verified backend JWKS check, role read from
  `publicMetadata.role`, `/auth/sync` links/provisions a `users` row on
  first sign-in, worker matched by `clerk_user_id`
- Backend RBAC: every `/api/v1/*` route requires authentication via the
  global `require_authenticated` dependency. Per-route role gates use
  `require_admin` (apf+org) or `require_apf` (apf only) — applied to
  request writes, assignments, audit logs, and reports
- Backend row-level scoping via `AccessScope`: requests, assignments,
  organizations, notifications, request_responses, and reports are
  filtered by the caller's identity. APF sees the network; org_admin
  sees only their orgs; workers see only their own data. Cross-scope
  access returns 403.
- `pytest` (14/14) and `next build` / `tsc --noEmit` pass

## Known gaps (be aware of these before suggesting fixes)

1. **Email/SMS are stubs.** `notifications/email_service.py` etc. exist but
   are not wired to SES or any provider.
2. **All 6 GitHub workflows are placeholder echos.** No CI runs anything real.
3. **Tests cover auth gates and route registration, no integration flows.**
   No coverage for publish/respond/assign or the `/auth/sync` linking
   path. With `AccessScope` in place, scoped behavior (worker sees only
   own, org_admin sees only their orgs) is also untested end-to-end.
4. **`request-create-form.tsx` accepts any `org_id`** without checking the
   current user's membership against the org list. The backend now
   restricts `/organizations` GET to the caller's orgs, so the dropdown
   already self-filters — but the form should also gate that the
   selected `created_by_user_id` is the current user.
5. **Backend JWT verification falls back to unverified claims** when
   `CLERK_JWKS_URL` is empty (i.e. local dev without a Clerk dev instance).
   That fallback exists by design, but make sure prod always has the JWKS
   URL set so `_decode_verified()` is taken.
6. **Org admins without memberships see nothing.** A user signing in
   with `role=org_admin` but no `organization_memberships` rows will see
   empty lists across requests, assignments, organizations, reports.
   Provisioning memberships is a manual DB step today; an
   admin-management UI / "promote to org" flow is a future addition.

## Implementation roadmap (Implementation-idea.md alignment)

This roadmap closes the gap between the current code and the product vision in
`Implementation-idea.md`. Items are ordered by dependency + leverage. Tick
each as it ships and keep "Current focus" in sync.

**Current focus:** D1 — Network Overview metrics (APF surface).

### Phase A — Worker UX core (the doc's heaviest emphasis)

- [x] **A1. Human-friendly status labels.** Replace raw enums in worker views
  with: *Response sent · Waiting for confirmation · Confirmed · Not selected
  · Cancelled · Completed*. Centralize in a label helper used by request
  cards, assignment cards, and notifications.
  *Shipped: `frontend/src/lib/status-labels.ts` (bilingual EN/FR), wired
  into `worker/page.tsx`, `worker/requests/page.tsx`,
  `worker/assignments/page.tsx`, `worker/availability/page.tsx`. Locale
  derived from `worker.preferred_language`.*
- [x] **A2. Eligibility-reason badges on Available Coverage cards.** Surface
  the matching rules (`services/matching_service.py`) per request: ✓ city,
  ✓ language, ✓ qualification, or "Missing: <requirement>". Backend
  returns reasons; frontend renders chips.
  *Shipped: `backend/app/schemas/eligibility.py`,
  `MatchingService.eligibility_result()`,
  `GET /api/v1/requests/{id}/eligibility`, and worker request card chips.
  Added focused matching tests for city, language, bilingual, qualification,
  and certification reasons.*
- [x] **A3. Available Coverage tabs + filters.** Tabs: All / Urgent / Today /
  This Week. Filters: city, date, urgent-only. No advanced filters.
  *Shipped: worker request page tabs plus simple city/date/urgent filters in
  `frontend/src/app/worker/requests/page.tsx`. Filters apply before Pending /
  Accepted / Declined grouping and include a clear-filters action.*
- [x] **A4. Worker home top card.** Greeting, current availability,
  urgent-alerts on/off, quick buttons (Set unavailable / Update availability
  / View available coverage).
  *Shipped: `/worker` top card shows greeting, availability, urgent-alert
  status, quick actions, and an editable urgent-alert toggle. Backend worker
  profile PATCH now accepts `urgent_alert_opt_in` as well as availability.*
- [x] **A5. Worker home sections.** "Urgent Requests", "Available Coverage
  Near You" (cards), "Upcoming Assignment" — replacing any dashboard density.
  *Shipped: `/worker` now separates urgent requests, nearby available
  coverage, and the next upcoming assignment with mobile-first cards.*
- [x] **A6. Accept-flow confirmation modal.** "Confirm availability" step,
  then post-accept state shows *Response sent. The coordinator will confirm.*
  Distinct from "Assigned".
  *Shipped: worker request Accept actions now open a confirm-availability
  modal before submitting. Accepted cards show explicit coordinator-confirm
  copy while assignment labels remain separate.*
- [x] **A7. Decline-flow with optional reason.** Reasons: Not available / Too
  far / Not interested / Conflict / Other. Reason is optional in MVP.
  *Shipped: DeclineModal with reason select, decline_reason stored on
  request_responses, surfaced on declined cards. Backend: nullable
  decline_reason column + schema/service/route threaded through.*
- [x] **A8. Assignment detail enrichments.** Contact person + phone/email,
  arrival/parking instructions, add-to-calendar link (Google Calendar URL),
  coordinator notes hidden from worker view.
  *Shipped: `contact_name`, `contact_phone`, `contact_email`,
  `arrival_instructions` on `staffing_requests`; worker assignment card
  surfaces all four with tappable links and a calendar button.*
- [x] **A9. Availability screen polish.** Preferred cities picker on
  `/worker/availability` — chips with remove + text input to add; backed by
  `worker_regions`; PATCH `/workers/{id}/availability` accepts
  `supported_cities`. Preferred days deferred (no matching logic yet).
  *Shipped: city picker live on `/worker/availability`.*
- [x] **A10. Notifications grouped by type.** Types: new request · urgent ·
  assigned · not selected · cancelled. Human copy, bilingual EN/FR.
  *Shipped: `GET /notifications/feed?worker_user_id=` synthesises typed
  events from `request_notifications`, `assignments`, and accepted-but-not-
  selected responses. `/worker/notifications` page groups by type with
  colour-coded cards and relative timestamps. 🔔 Alerts tab added to
  worker bottom nav.*
- [x] **A11. "Request filled" notice + Re-notify workers.**
  Worker requests page shows a muted "Filled (n)" section for assigned
  requests where the worker had a response; bilingual "This request has
  been filled / Ce remplacement a été pourvu" copy.
  Re-notify: `POST /requests/{id}/renotify` re-runs matching, resets
  declined workers to notified, creates new notification rows, sets
  status → notified. Admin "Re-notify workers" button appears on
  `RequestWorkflowCard` when status is `responses_received` and no
  accepted responses remain (post-assignment-cancellation path).

### Phase B — Schema/domain extensions to support the new flows

- [x] **B1. Coverage urgency types.** `CoverageType` enum added:
  `same_day_urgent`, `planned_absence`, `recurring`, `emergency`.
  Column on `staffing_requests` (model, migration, schema, SQL doc, TS
  types, seed). Create form has coverage type dropdown + on-site contact
  fields (contact name, phone, email, arrival instructions — were missing
  from form despite existing on the model). Coverage type badge on worker
  request cards (bilingual). Admin workflow card shows type inline.
  Bug fixed: assignment cancellation now resets the worker's response to
  `notified` (not `declined`) so they appear back in Pending and can
  re-respond.
- [x] **B2. Response state — viewed + no-response.** Added `viewed_at` to
  `request_responses` (model, migration, schema, SQL doc, TS types).
  `POST /requests/{id}/responses/view` transitions `notified → viewed` and
  sets `viewed_at` (idempotent; no-op on already-viewed). Worker page calls
  mark-viewed (fire-and-forget) when opening Accept or Decline modal; copy
  on accepted cards now distinguishes "Response sent · Awaiting confirmation"
  vs "Response received by coordinator · Awaiting confirmation" based on
  `request.status`. Admin `workerResponseLabel` handles `viewed` ("Viewed —
  awaiting reply") and `no_response` ("No response"); `viewed_at` timestamp
  shown inline under the worker name in the response board.
- [x] **B3. Organization type enum.** Replaced 3-value enum with 6 values:
  `childcare`, `long_term_care`, `community_care`, `home_care`,
  `assisted_living`, `other`. Updated migration, model, SQL doc, seed.
  Human labels in admin Organizations page and as a sub-hint under the
  org dropdown in the create-request form.
- [x] **B4. Care-sector-neutral copy pass.** Audited all frontend UI
  strings. Locked vocabulary: *Coverage Request* (replaces "staffing
  request"), *Substitute* (replaces "worker" in user-facing labels),
  *Coverage Desk* (replaces "Dashboard" in admin nav). Changes: admin nav
  Dashboard→Coverage Desk, Workers→Substitutes; admin page title/panels
  updated; workers page eyebrow/title/panel updated; request detail
  description updated; workflow card "Worker responses"→"Substitute
  responses", "Assigned worker"→"Assigned substitute", "Confirm this
  worker"→"Confirm this substitute", cancellation reason updated; worker
  requests heading "Available requests"→"Available coverage"; create form
  placeholder copy de-childcarified.

### Phase C — Coordinator (org admin) surface

- [x] **C1. Rename "Admin Dashboard" → "Coverage Desk / Coverage Board".**
  Done as part of B4 copy pass — admin nav now reads "Coverage Desk".
- [x] **C2. Per-request Responses board.** Request detail page now shows a
  proper per-response board: one card per notified substitute, color-coded
  by status (notified/viewed/accepted/declined/no_response), with
  viewed_at timestamp and decline_reason surfaced. Iterates over responses
  (not all workers). "Substitute:" label fixed in assignment panel.
- [x] **C3. Substitute Directory page.** `/admin/workers` now renders a
  `SubstituteDirectory` client component with filters: availability
  (All/Available/Unavailable chips), city dropdown, language dropdown,
  qualification/certification text search. Shows match count and
  clear-filters action. Each card shows language + city chips plus
  qualifications/certifications.
- [x] **C4. Coverage History page.** `/admin/requests/history` shows closed
  requests (assigned/completed/cancelled/expired) sorted newest-first.
  Each card shows outcome text (assigned substitute name + time-to-fill,
  or cancelled duration), color-coded status badge, org/city/date, links
  to request detail. Active requests page now filters to in-progress only
  and shows "View coverage history (N closed) →" link when closed records
  exist.

### Phase D — Network admin (APF) surface

- [ ] **D1. Network Overview metrics.** Fill rate, time-to-fill, shortage by
  region, active substitute pool, unfilled requests, demand trends.
  Backend aggregations + dark-themed dashboard cards.
- [ ] **D2. Substitute Pool view.** Network-wide worker list with status +
  utilization.
- [ ] **D3. Activity History.** Network-wide audit-log-style feed.

### Working order

We work top-to-bottom but Phase B items can be pulled forward when an A item
needs them (e.g., A6's "Response sent" copy benefits from B2's `viewed_at`).
Don't start C or D until Phase A is materially done — the worker surface is
the unique product surface and CLAUDE.md already names it the priority.

## Working agreements

- **No AWS deployment yet.** The Terraform is scaffold for later. Don't
  `terraform apply` anything without explicit approval.
- **Frontend is the current priority** (per Implementation-idea.md), specifically
  the worker surface.
- **Don't add backwards-compatibility shims for the schema** — there's no prod
  data; correct migrations in place.
- **Don't introduce a UI library** (Tailwind, shadcn, Mantine, etc.) without
  discussing it first. The codebase is intentionally on inline styles.
- **Don't claim a feature works without exercising it.** Type-checking the code
  is necessary but not sufficient — the user wants behavioral verification.
- **Three distinct shells.** Don't fold worker / admin / apf into one shared
  layout. They are different products.
- **Mobile-first for worker.** Card-based, large touch targets, almost no dense
  tables on the worker surface. Tables are fine for admin and apf.

## Useful commands

```bash
make up          # docker compose up --build
make down
make migrate     # alembic upgrade head inside backend container
make seed        # python -m app.scripts.seed_dev_data
make test        # pytest in backend container
docker compose exec frontend npm run build
docker compose exec frontend npx tsc --noEmit
./cleanup.sh           # safe between-build prune
./cleanup.sh --deep    # aggressive prune when disk gets tight
```

## When making changes

- **Schema changes** → update `backend/migrations/versions/20260420_0001_initial_schema.py`
  *and* the matching SQLAlchemy model *and* `docs/initial_database_schema.sql`.
  Refresh the schema-alignment doc if the policy itself changes.
- **New API route** → add to `api/v1/*`, register in `api/v1/router.py`, add a
  fetch helper in `lib/api.ts` and/or `lib/browser-api.ts` as needed, expose
  through whichever surface(s) need it.
- **New worker page** → drop into `frontend/src/app/worker/<name>/page.tsx` as a
  `"use client"` component, use `useWorkerSession()` for the active worker, and
  add a link to the bottom nav in `app/worker/layout.tsx` if it needs one.
- **New admin page** → server component under `frontend/src/app/admin/`, fetch
  via `lib/api.ts`, add to `AdminNavigation` if top-level.
- **Touching matching logic** → update `services/matching_service.py` and add a
  test (this is the part most worth covering).
- **Auth changes** → if you add a new role claim, surface it on both
  `auth/clerk.py` (claim extraction) and `lib/role-context.tsx`
  (`isRole()` guard). If you add a Clerk-derived field, add it to
  `users.clerk_user_id`-style columns rather than relying on JWT claims at
  query time.
- **Touching env config** → keep `backend/.env.example`, the root
  `.env.example`, `frontend/.env.local.example`, and the Terraform
  `terraform.tfvars` + `secrets-manager` module in sync. Drift across
  these is the most common source of subtle breakage.
