# CLAUDE.md

This file is the working reference for Claude (or any AI agent) collaborating on the
APF Staffing Platform. It supersedes older planning docs where they conflict —
`IMPLEMENTATION_PLAN.md` describes the *initial* foundation phase and is partially
superseded; `Implementation-idea.md` and the project README describe the *current*
product direction. Read `.codex` for a timeline of what has shipped.

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
- `pytest` (14/14) and `next build` / `tsc --noEmit` pass

## Known gaps (be aware of these before suggesting fixes)

1. **No row-level / org scoping yet.** Role gates are enforced (any
   authenticated user is required, admin/APF roles are required where
   appropriate), but endpoints don't filter results by the caller's
   organization. An `org_admin` from Org A can call
   `/reports/network-summary` and see counts that span all orgs;
   `/assignments` returns every assignment regardless of who owns the
   request. Closing this needs a `current_db_user` dependency that
   resolves the Clerk JWT → `users` row → `organization_memberships`,
   then service-layer filters that take the membership set.
2. **Email/SMS are stubs.** `notifications/email_service.py` etc. exist but
   are not wired to SES or any provider.
3. **All 6 GitHub workflows are placeholder echos.** No CI runs anything real.
4. **Tests cover auth gates and route registration, no integration flows.**
   No coverage for publish/respond/assign or the `/auth/sync` linking
   path.
5. **`request-create-form.tsx` accepts any `org_id`** without checking the
   current user's membership.
6. **Backend JWT verification falls back to unverified claims** when
   `CLERK_JWKS_URL` is empty (i.e. local dev without a Clerk dev instance).
   That fallback exists by design, but make sure prod always has the JWKS
   URL set so `_decode_verified()` is taken.

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
