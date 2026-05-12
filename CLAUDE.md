# CLAUDE.md

Working reference for Claude on the APF Staffing Platform. Supersedes older planning docs.

## ⚡ Session pickup

Run on every new session:
```
git -C /home/corneille3/STAFFIG-PLATFORM status
git -C /home/corneille3/STAFFIG-PLATFORM log --oneline -10
```
Disk state is authoritative — stale VS Code buffers have caused phantom "missing code" reports.

**Last shipped (newest first):**
- Worker surface redesign (`feature/worker-inbox`): design system (Tailwind v4, Inter Tight / Instrument Serif / JetBrains Mono), new UI primitives (Chip, Button, Card, Avatar, BottomNav, Eyebrow, Mono), all 5 worker pages redesigned per `frontend/New design by Claude Design/HANDOFF.md`.
- Lifecycle management, multi-tenant onboarding, outbound email via AWS SES. Tenant + user removal UI, orphan cleanup. SES domain `staffig.kouamvision.com` verified (sandbox; production-access request submitted). One-command deploy via `make deploy-backend`.
- DB-owns-roles architecture live. `/auth/sync` links Clerk identity to DB row; uninvited sign-up → 403 → `/not-invited`. Server-side role guards on `/apf` + `/admin` layouts.
- Production deployment live: EC2 `i-04a60b0aaf80c1528`, RDS, ECR, Vercel at `staffig.kouamvision.com`, backend at `api.kouamvision.com`, Clerk at `clerk.kouamvision.com`.
- Full A–D roadmap shipped: worker UX core, schema extensions, coordinator surface, APF oversight surface.

## What this project is

Bilingual (FR/EN) substitute-staffing dispatch platform for care organizations. Three surfaces in one repo:

- **Workers** — accept/decline shifts, manage availability (mobile-first)
- **Org admins** — create requests, run dispatch, confirm assignments
- **APF admins** — network-wide oversight and reporting

The product is **three apps in one shell**, not a single console with role toggles.

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic, PostgreSQL 16
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, inline styles + Tailwind v4
- **Local dev**: Docker Compose (`db`, `backend`, `frontend`)
- **Auth**: Clerk — `@clerk/nextjs` on frontend, backend verifies JWTs via JWKS
- **Infra**: Terraform on AWS (VPC, RDS db.t4g.micro, EC2 t3.small, ECR, SES, Secrets Manager). Frontend on Vercel. Domain `staffig.kouamvision.com` on Cloudflare.

## Repository layout

```
backend/app/
  api/v1/         Route handlers
  auth/           Clerk JWT decode + permissions + AccessScope
  models/         ORM models (normalized)
  repositories/   Persistence (all tenant-scoped)
  services/       Domain logic (matching, request lifecycle, etc.)
  tests/          pytest (67 passing)
  migrations/     Alembic
frontend/src/
  middleware.ts             clerkMiddleware (active when key set)
  app/
    admin/*                 Org admin surface
    worker/*                Worker surface (mobile-first)
    apf/*                   APF oversight surface
  components/ui/            Chip, Button, Card, Avatar, BottomNav, Eyebrow, Mono, Meta
  lib/
    api.ts                  Server-side fetch (Docker-internal URL)
    browser-api.ts          Client-side fetch (NEXT_PUBLIC_API_BASE_URL)
    role-context.tsx        RoleProvider (Clerk + Dev variants)
    worker-session.tsx      WorkerSessionProvider (Clerk + Dev variants)
    types.ts                Shared TS types
infra/                      Terraform modules + dev/prod environments
```

## Frontend architecture

Three role-scoped surfaces:

| Path | Audience | Shell |
|---|---|---|
| `/admin/*` | Org admins | Light cream, top nav, tables |
| `/worker/*` | Workers | Mobile-first, bottom nav, cards |
| `/apf/*` | APF admins | Dark, sticky header, metrics |

**Auth (conditional on `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`):**
- Key present → `ClerkProvider` + `clerkMiddleware`, `RoleProvider` calls `/auth/sync` after login, JWT attached to every request, backend verifies via JWKS.
- Key absent → dev role-switcher + worker picker (localStorage), no auth header sent. Local dev uses `DEV_AUTH_BYPASS=true` in `backend/.env`.

**Two API helpers — never mix them:**
- `lib/api.ts` — server components, uses `http://backend:8000` (Docker internal)
- `lib/browser-api.ts` — client components, uses `NEXT_PUBLIC_API_BASE_URL`

**Design system** (from `frontend/New design by Claude Design/HANDOFF.md`):
- Tokens: `--paper #F6F4EE`, `--card #FFF`, `--ink #15140F`, `--terra #DC5A2A`, `--moss #25684A`, `--sand #E8C97A`, `--rose #C53A2A`, `--line #E5E1D3`
- Fonts: Inter Tight (UI), Instrument Serif (display/headings), JetBrains Mono (numerics)
- Rules: no gradients in product UI · no emoji (Lucide icons) · 0.5px hairline borders only · 44px min touch targets · page bg is `--paper` never `#fff` · display headings italicize one word
- Components in `frontend/src/components/ui/`
- **Visual port only** — keep FastAPI backend as-is, no stack changes

## Backend architecture

Routes → services → repositories → SQLAlchemy models. Pydantic schemas in `schemas/*`.

**Matching** (`services/matching_service.py`): active + has profile → available → city match → qualifications → certifications → language.

**Request lifecycle**: `draft → open → notified → responses_received → assigned → completed` (+ `cancelled`/`expired`). All transitions write `audit_logs`.

**AccessScope** (`auth/scope.py`): resolves caller to `is_platform_admin / is_network_admin / is_org_admin / is_worker` + `tenant_id` + `org_ids`. All repos filter by scope.

## Onboarding model (DB-owns-roles, invite-only)

Clerk is identity only. DB owns roles and memberships.

1. Bootstrap: migration `20260507_0003` seeds APF tenant + first `network_admin` (via `APF_BOOTSTRAP_EMAIL` env var).
2. APF admin signs in → `/auth/sync` links Clerk identity → lands on `/apf`.
3. APF admin creates org at `/apf/organizations/new`.
4. APF admin invites coordinator at `/apf/coordinators/new` → DB User (org_admin) + memberships.
5. Coordinator signs up with invited email → `/auth/sync` links, preserves DB role → lands on `/admin`.
6. Coordinator creates/publishes coverage requests scoped to their org.
7. APF admin invites worker at `/apf/workers/new` → DB User (worker) + TenantMembership.
8. Worker signs up → `/auth/sync` links → redirected to `/worker/onboarding` (profile=null) → fills cities/quals/certs.

**Critical invariants:**
- `/auth/sync` never reads role from JWT or Clerk metadata. Links by `clerk_user_id` or email; preserves DB role.
- Uninvited sign-up → 403 → frontend redirects to `/not-invited`.
- Role guards use DB role via `AccessScope`, not JWT.
- All client-side action calls must attach the Clerk JWT — use `lib/browser-api.ts` helpers (raw `fetch()` without `Authorization` → 401).

## Schema policy

Normalized tables for anything driving matching, compliance, reporting, or permissions. JSONB only for audit payloads and incidental metadata. No production data — fix migrations in-place, don't stack compatibility migrations.

## Manual deploy procedure

**Frontend:** `git push origin main` → Vercel auto-deploys.

**Backend:** `make deploy-backend`
- Builds + pushes to ECR, reboots EC2, polls direct IP `99.79.127.227` (not Cloudflare — it caches stale 5xx), verifies new image via `/openapi.json`.

```bash
# Rollback to a prior image
docker pull 515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend:sha-<old>
docker tag <repo>:sha-<old> <repo>:latest
docker push <repo>:latest
aws ec2 reboot-instances --region ca-central-1 --instance-ids i-04a60b0aaf80c1528
```

Infrastructure IDs:
- EC2: `i-04a60b0aaf80c1528`
- RDS: `apf-staffing-platform-prod-postgres.cbeimeeggn80.ca-central-1.rds.amazonaws.com`
- ECR: `515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend`

## Known gaps

1. **SES sandbox** — pre-verify test recipients via `aws sesv2 create-email-identity --region ca-central-1 --email-identity <email>` until production access is granted.
2. **End-to-end pass pending** — walk full operator chain once SES production access is granted.
3. **CI secrets unset** — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REPOSITORY_URL`, `EC2_INSTANCE_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. All backend deploys manual until set.
4. **SMS (Twilio) not wired in prod** — `SmsNotificationService` is ready, skips when `TWILIO_ACCOUNT_SID` is empty. ~30 min to wire once provider is chosen.
5. **SSM agent unregistered** for `i-04a60b0aaf80c1528` — deploys use `aws ec2 reboot-instances` as workaround.
6. **HTTPS hardening** — currently Cloudflare Flexible SSL (plain HTTP Cloudflare→EC2). Long-term: nginx + Let's Encrypt or Cloudflare Origin Certificate.

## Implementation roadmap

**Current focus:** Worker surface redesign (`feature/worker-inbox`), then admin surface redesign.

**HANDOFF gap tracker:** `docs/handoff-gaps.md` — full list of what was omitted from the design spec, grouped by frontend-only vs backend-blocked vs intentional stack skips.

### Phase A — Worker UX ✅ complete
A1 status labels · A2 eligibility badges · A3 tabs+filters · A4 home top card · A5 home sections · A6 accept modal · A7 decline modal · A8 assignment enrichments · A9 cities picker · A10 notifications feed · A11 re-notify

### Phase B — Schema extensions ✅ complete
B1 CoverageType enum · B2 viewed_at on responses · B3 org type enum · B4 care-sector-neutral copy

### Phase C — Coordinator surface ✅ complete
C1 Coverage Desk rename · C2 responses board · C3 substitute directory · C4 coverage history

### Phase D — APF surface ✅ complete
D1 network overview metrics · D2 substitute pool · D3 activity history

### Phase E — Polish (post-pilot)
- [ ] **E1** Mobile hamburger nav on `/apf` and `/admin` (~2h, pure frontend)
- [ ] **E2** Worker UI polish pass — after pilot data; don't brief designer before real-user feedback
- [ ] **E3** Case-study on `kouamvision.com/work/`
- [ ] **E4** Optional standalone landing at `staffig.kouamvision.com` (app → `app.staffig.*`)

### Git workflow
- Branches: `main` (prod only) ← `develop` (integration) ← `feature/*`
- All work on `feature/*` → PR to `develop` → merge to `main` for prod
- Vercel preview deployments auto-trigger on PRs (needs VERCEL_TOKEN/ORG_ID/PROJECT_ID in GitHub Actions secrets)
- Current active branch: `feature/worker-inbox`

## Working agreements

- **No `terraform apply`** without explicit approval.
- **Frontend is current priority** — worker surface first, then admin.
- **No backwards-compat schema shims** — no prod data; fix migrations in-place.
- **No UI library** (Tailwind class-heavy, shadcn, Mantine, etc.) without discussion. Codebase uses inline styles + design system tokens.
- **Don't claim a feature works without exercising it.** Type checking ≠ behavioral verification.
- **Three distinct shells** — don't fold worker/admin/apf into one layout.
- **Mobile-first for worker** — large touch targets, cards, no dense tables.
- **Never commit or push without explicit user approval.**
- **User runs all deploy commands** — print the command, never execute it.

## Useful commands

```bash
make up          # docker compose up --build
make down
make migrate     # alembic upgrade head inside backend container
make seed        # python -m app.scripts.seed_dev_data
make test        # pytest in backend container
docker compose exec frontend npx tsc --noEmit
./cleanup.sh           # safe between-build prune
./cleanup.sh --deep    # aggressive prune when disk gets tight
```

## When making changes

- **Schema changes** → update migration `20260420_0001_initial_schema.py` + SQLAlchemy model + `docs/initial_database_schema.sql`.
- **New API route** → `api/v1/*` → register in `api/v1/router.py` → fetch helper in `lib/api.ts` / `lib/browser-api.ts`.
- **New worker page** → `frontend/src/app/worker/<name>/page.tsx` (`"use client"`), use `useWorkerSession()`, add to `NAV_ITEMS` in `worker/layout.tsx` if top-level.
- **New admin page** → server component under `frontend/src/app/admin/`, fetch via `lib/api.ts`, add to `AdminNavigation`.
- **Matching logic** → `services/matching_service.py` + add a test.
- **Auth changes** → update `auth/clerk.py` + `lib/role-context.tsx` together.
- **Env config** → keep `backend/.env.example`, `frontend/.env.local.example`, and Terraform `terraform.tfvars` + secrets-manager module in sync. Drift here is the most common source of subtle breakage.
