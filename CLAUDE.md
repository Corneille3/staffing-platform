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
  backend verifies Clerk JWTs; frontend will integrate `@clerk/nextjs`
- **Infra**: Terraform scaffold for AWS (VPC, RDS, EC2 app-runtime, S3+CloudFront,
  SES, Secrets Manager — Clerk keys stored as secrets) — **not deployed yet,
  do not deploy**

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
    app/
      layout.tsx              root: RoleProvider + dev RoleSwitcher
      page.tsx                root redirector by role
      admin/*                 org admin surface (dashboard / tables)
      worker/*                worker surface (mobile-first, card-based)
      apf/*                   APF oversight surface (dark, read-only)
    components/        admin-navigation, role-switcher, worker-availability-control,
                       request-create-form, request-workflow-card, panels, etc.
    lib/
      api.ts           server-side fetch helpers (Docker-internal URL)
      browser-api.ts   client-side fetch helpers (NEXT_PUBLIC_API_BASE_URL)
      role-context.tsx RoleProvider, useRole, ROLE_HOME map
      worker-session.tsx active-worker context for the worker surface
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

The frontend integrates `@clerk/nextjs` and is **conditionally wired** based on
whether `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set:

- **Key present** → `ClerkProvider` wraps the app, `clerkMiddleware` protects
  every route except `/sign-in/*` and `/sign-up/*`. Sign-in / sign-up live at
  `/sign-in/[[...sign-in]]/page.tsx` and `/sign-up/[[...sign-up]]/page.tsx`
  using Clerk's catch-all components.
- **Key absent** → middleware passes through, no `ClerkProvider`, dev role
  switcher + worker picker remain the only auth shim. This keeps the local
  stack working until a Clerk dev instance is set up.

To turn on Clerk locally:
1. Create a Clerk app, copy the publishable + secret keys.
2. Add to `frontend/.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
3. Recreate the frontend container so the new package + env vars take effect:
   ```
   docker compose down
   docker volume rm staffig-platform_frontend_node_modules
   docker compose up --build
   ```
4. Visit `/sign-in` to authenticate.

### Dev role + worker selection

A floating **role-switcher** pill (bottom-right) writes
`localStorage["apf.devRole"]` and navigates to the matching surface. The root
`/` redirects based on that role.

The worker surface additionally uses a **WorkerSession** context. On first
visit to `/worker/*`, users pick which worker they are previewing as
(`localStorage["apf.workerId"]`). Sign-out from the profile page clears it.

These dev shims still run even when Clerk is enabled — they let you preview
each surface without juggling multiple Clerk users. They will be retired once
roles are read from Clerk's `publicMetadata.role` and the active worker is
matched by `clerk_user_id`.

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

## What's working end-to-end (per `.codex`, last update 2026-04-25)

- Docker Compose stack boots; backend, frontend, DB all healthy
- `make migrate && make seed` populates a working dataset
- Full admin lifecycle: create → publish → notify → accept/decline → assign
- Frontend reads live data from FastAPI for all three surfaces
- `pytest` and `next build` both pass

## Known gaps (be aware of these before suggesting fixes)

1. **Auth is not production-safe.** `auth/clerk.py` reads claims via
   `jwt.get_unverified_claims()` — no JWKS signature verification yet.
   Treat anything except endpoint shape as untrusted until that's wired.
2. **No frontend → backend authorization.** Neither `lib/api.ts` nor
   `lib/browser-api.ts` sends an `Authorization` header. The dev role/worker
   selection is purely client-side make-believe.
3. **`require_role()` exists but is unused.** No route enforces RBAC yet.
4. **All 6 GitHub workflows are placeholder echos.** No CI runs anything real.
5. **Clerk integration is partial.** `@clerk/nextjs` is installed and
   `ClerkProvider` + middleware + sign-in/sign-up routes exist (conditionally
   on `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`). Still pending: forwarding Clerk
   JWTs in `lib/api.ts` / `lib/browser-api.ts`, JWKS-based signature
   verification on the backend, reading roles from `publicMetadata.role`,
   and matching the active worker by `clerk_user_id`.
6. **Email/SMS are stubs.** `notifications/email_service.py` etc. exist but
   are not wired to SES or any provider.
7. **Tests are smoke-only.** No coverage for publish/respond/assign flows.
8. **`request-create-form.tsx` accepts any `org_id`** without checking the
   current user's membership.

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
