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
1. **Lifecycle management, multi-tenant onboarding, and outbound email
   via AWS SES.** Platform admin can now create + remove tenants from
   the UI, the in-app invite endpoints actually deliver email, and the
   "removed user blocks the email" wart is gone. Verified live
   2026-05-10 (coordinator-invite email delivered to a verified
   Gmail+alias inbox; full operator flow walked through earlier in
   the same session).

   **Multi-tenant onboarding (Option A)**: `POST /api/v1/networks`
   (gated `require_platform_admin`) creates Tenant + first
   network_admin + TenantMembership atomically. New UI at
   `/apf/networks` (list with Remove buttons) and `/apf/networks/new`
   (form). "Networks" nav item conditionally rendered when
   `session.role === "platform_admin"`. `AccessScope` change
   ("Option ii"): platform_admin behaves as network_admin-of-their-
   primary-tenant for day-to-day queries; only the new
   `/apf/networks` and `/api/v1/networks` are platform-only.
   Migration `20260510_0004` bumps the `APF_BOOTSTRAP_EMAIL` user to
   `platform_admin`.

   **User removal**: `DELETE /api/v1/users/{id}` (network_admin /
   platform_admin) soft-deletes the user, cascades all memberships
   inactive, and best-effort deletes the Clerk identity. Email is
   tombstoned (`+removed-<short-uuid>` marker in the local-part) so
   the address is free for re-invitation without violating the
   unique constraint. Migration `20260510_0005` retroactively
   tombstones inactive rows already in the DB.

   **Tenant removal**: `DELETE /api/v1/networks/{tenant_id}`
   (platform_admin only) cascades the same to every active member of
   the tenant + sets `Tenant.is_active=False`. Refuses to remove a
   tenant the actor is a member of (prevents self-lockout). UI:
   Remove pill on each `/apf/networks` row except your own
   ("your network" placeholder).

   **Orphan user cleanup**: `POST /api/v1/users/remove-by-email`
   (platform_admin only) handles users whose email is in the DB but
   who don't appear in any management listing (typical leftover from
   the pre-DB-owns-roles `/auth/sync` JIT-create path). UI:
   collapsible "Force-remove orphan user" section at the bottom of
   `/apf/networks`.

   **Outbound email via AWS SES** (replaces the silent-skip
   placeholder):
   - `infra/modules/ses` provisions the domain identity, DKIM, and
     an IAM user whose access key's `ses_smtp_password_v4` attribute
     is the SMTP password.
   - `infra/modules/secrets-manager` now also feeds
     `SMTP_HOST/PORT/USE_TLS/USERNAME/PASSWORD/FROM` into the prod
     secret. Backend's existing `EmailNotificationService` picks
     them up.
   - `infra/environments/prod/terraform.tfvars` sets
     `ses_domain_name`, `ses_mail_from_address`, plus the bootstrap
     admin keys (now Terraform-managed; previously set out-of-band
     via `aws secretsmanager update-secret`).
   - SES domain `staffig.kouamvision.com` verified in
     `ca-central-1` via 3 DKIM CNAMEs added to Cloudflare (DNS-only,
     not orange-proxied — the proxy breaks DKIM signature
     verification).
   - **SES sandbox**: until production access is granted (request
     submitted via the AWS console; ~24–48h turnaround), only
     recipient addresses pre-verified via
     `aws sesv2 create-email-identity` actually receive mail. The
     backend logs "skipped" on rejected sends; the invite endpoint
     still returns 201 (DB row is created either way).

   **Listing audit visibility**: `/apf/coordinators` and
   `/apf/substitutes` now include inactive members (rendered with a
   muted "removed" tag instead of the action button). The substitute
   page overrides the availability badge to "Removed" for inactive
   workers and excludes them from the summary counters
   ("Available now", etc.).

   **Operational hardening**:
   - `scripts/deploy-backend.sh` + `make deploy-backend` for one-
     command manual deploys. Two-phase polling waits for the origin
     to go down then come back up, then verifies the new image via
     a known-route check on `/openapi.json`. Polls the direct EC2 IP
     (Cloudflare can serve stale 5xx during restart and confused
     earlier deploys).
   - `infra/modules/app-runtime` adds
     `lifecycle.ignore_changes = [ami]` to `aws_instance.this`.
     `data.aws_ami.amazon_linux` is `most_recent=true`, which would
     otherwise replace the EC2 every apply just to pick up a new
     Amazon Linux 2023 image (losing the public IP wired into
     Cloudflare DNS).
   - Worker session 401 race fix: `WorkerSessionProvider` now
     defers `fetchWorkers()` until `useAuth().isLoaded` is true.

2. **DB-owns-roles architecture, fully deployed and partially verified live.**
   Clerk is now strictly an identity layer; DB rows are the source of truth
   for roles and memberships. After the one-time bootstrap, every user must
   be pre-created via an invite endpoint before they can sign in. See the
   **Onboarding model** section below for the full 8-step flow.

   Commits (in order, all pushed and live):
   - `50ca992` — `/auth/sync` rewrite (169→60 lines): existing-user path
     returns the row untouched; link-by-email path links `clerk_user_id`
     and **preserves the DB role**; uninvited email returns 403. Removed
     `_sync_role_from_clerk`, `_ensure_network_admin_tenant_membership`,
     `public_metadata_role` fallbacks, JIT-create-from-Clerk-metadata.
     New Alembic migration `20260507_0003` seeds the APF tenant + first
     `network_admin` + `TenantMembership`, gated on `APF_BOOTSTRAP_EMAIL`
     env var (no-op otherwise; idempotent). Coordinator + worker invite
     endpoints send a bilingual sign-in invite email (silently skipped
     today because SMTP is not configured in prod). Frontend
     `ClerkRoleProvider` detects 403 from `/auth/sync`, clears local
     overrides, signs the user out, and redirects to `/not-invited` (new
     bilingual EN/FR page; route added to public middleware).
   - `46aa1e4` — Server-side role guards on `/apf` and `/admin` layouts.
     New `requireServerSession()` (in `lib/api.ts`) calls `/auth/sync`
     server-side from the layout (idempotent — links the DB row before
     any page-level data fetch runs), redirects to `/not-invited` on
     403, and redirects to `ROLE_HOME` on role mismatch. Fixes the
     "fresh sign-up SSR crashes with 401/403 because the DB row isn't
     linked yet" bug, and the "wrong-role user lands on /apf and gets
     500" bug. Worker shell stays client-only; its existing
     `ClerkRoleProvider` already handles the same flow client-side.
   - `0b8b4ce` — `require_role` uses the DB role via `AccessScope`,
     not the JWT role. After `/auth/sync` stopped reading Clerk roles,
     `current_user.role` is None for every signed-in user; the old
     `require_admin`/`require_apf` were checking that and rejecting
     everything. Switched the role check to `scope.user.role.value`,
     which is the DB-resolved role.
   - `f1aa544` — `created_by_user_id` is now `Optional[UUID]` on
     `StaffingRequestCreate`. The form stopped sending it after the
     "Created by" dropdown was removed in `2977f2b` (backend already
     overrode it with `scope.user.id`); the schema still required it,
     causing 422.
   - `1b74c3d` — Coverage-board action buttons (publish, assign, cancel,
     renotify) now attach the Clerk JWT. The local `post()` helper in
     `RequestWorkflowCard` was doing a raw `fetch()` with no
     `Authorization` header → every action button got 401. Same fix as
     `request-create-form.tsx` from `2977f2b`.

   **Verified live so far:** APF admin sign-in still works; uninvited
   sign-up routes to `/not-invited`; pre-invited org_admin links via
   `/auth/sync` and lands on `/admin`; coordinator can create + publish
   a coverage request (via the workflow card, with auth header).
   **Not yet exercised in production:** worker invite → worker
   sign-up/onboard → match → accept → assign → cancel. See the
   "End-to-end operator-flow test plan" section near the bottom of
   this file.

2. Production deployment — fully live. AWS infrastructure provisioned
   via Terraform (VPC, RDS db.t4g.micro, EC2 t3.small, ECR, Secrets
   Manager, S3 remote state). Backend Docker image built and pushed to
   ECR; runs `alembic upgrade head` via `docker-entrypoint.sh` on every
   deploy. Secrets Manager loader added to `config.py` (boto3, reads
   `APP_ENV_SECRET_NAME` env var). Vercel project live at
   `staffig.kouamvision.com`, backend at `api.kouamvision.com`
   (second-level subdomain — Cloudflare free SSL doesn't cover
   `api.staffig.*`). Clerk production instance at
   `clerk.kouamvision.com` with all 5 DNS records verified. **HTTPS
   chain:** Cloudflare Flexible SSL — encrypted client→Cloudflare,
   plain HTTP Cloudflare→EC2 origin. Bot Fight Mode is **off** (it was
   blocking Vercel SSR datacenter IPs with 403). Long-term HTTPS
   hardening: nginx + Let's Encrypt on EC2 or Cloudflare Origin
   Certificate. Infrastructure IDs: EC2 `i-04a60b0aaf80c1528`, RDS
   endpoint `apf-staffing-platform-prod-postgres.cbeimeeggn80.ca-central-1.rds.amazonaws.com`,
   ECR `515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend`.
   CI deploy workflows exist but are gated on missing secrets
   (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `VERCEL_TOKEN`,
   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). Until those are set, deploys
   are manual — see "Manual deploy procedure" below.
2. Clerk auth wired end-to-end — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` +
   `CLERK_SECRET_KEY` set in `frontend/.env.local`; `CLERK_ISSUER_URL` +
   `CLERK_JWKS_URL` set in `backend/.env`. Dev auth bypass disabled when
   Clerk key is present. ⚠️ The historical JWT-template advice
   (`"role": "{{user.public_metadata.role}}"`) is now obsolete: under the
   DB-owns-roles model, Clerk JWTs no longer carry a `role` claim and
   nothing reads `publicMetadata.role`. The template can stay or be removed
   — the backend ignores it either way.
2. Network admin management surface — `POST /api/v1/organizations` (create
   org under tenant), `GET+POST /api/v1/coordinators` (list + invite
   coordinator with multi-org assignment). `CoordinatorService.invite()`
   validates org ownership, creates User (org_admin) + TenantMembership +
   OrganizationMembership per org. APF nav extended: Organizations +
   Coordinators pages with list/create forms. Coordinator invite form has
   toggle-style multi-org picker; coordinators scoped to all assigned orgs
   via `AccessScope.org_ids` union (already supported, no changes needed).
3. Worker onboarding flow — network admin pre-registers a worker via
   `POST /api/v1/workers/invite` (creates User + TenantMembership);
   worker signs in and is redirected to `/worker/onboarding` (redirect
   gate in `worker/layout.tsx` fires when `worker.profile === null`).
   Onboarding page: CityPicker + ChipPicker for qualifications/certs
   (preset suggestions + free text), urgent-alerts checkbox; on submit
   calls `POST /api/v1/workers/{id}/onboard` which creates WorkerProfile +
   normalized region/qual/cert rows. "Add substitute" button added to
   `/apf/substitutes` linking to `/apf/workers/new` (APF invite form).
2. Multi-tenant layer + SMS notifications — `tenants` and
   `tenant_memberships` tables added. `UserRole` enum replaced
   `apf_admin` with `platform_admin` + `network_admin`. `AccessScope`
   rewritten: `is_platform_admin`, `is_network_admin`, `is_org_admin`,
   `is_worker`; `tenant_id` derived from TenantMembership.
   `permissions.py`: `require_platform_admin`, `require_network_admin`,
   `require_admin` (all three), `require_apf` (alias for network_admin).
   All repositories updated to scope by tenant for network_admin role.
   `WorkerRepository.list_for_tenant()` added so publish/renotify only
   match workers in the same tenant pool. Seed creates APF Tenant +
   network_admin user with TenantMembership; workers also get memberships.
   SMS: `SmsNotificationService` calls Twilio REST API via `httpx` with
   Basic auth; skips gracefully when `TWILIO_ACCOUNT_SID` is empty.
   `NotificationDispatcher._send_to_worker()` fires email + SMS side-by-
   side (SMS only when `worker.phone` is set).
3. Integration tests — 18 new tests across two files covering the full
   request lifecycle and row-level access control. `app/tests/conftest.py`
   seeds org/APF admin/org admin/worker A/worker B with real DB rows;
   each test is wrapped in a transaction that rolls back via SQLAlchemy
   `join_transaction_mode='create_savepoint'`, so tests are fully isolated
   without truncating tables. `test_request_lifecycle.py`: create request,
   publish notifies eligible workers, publish excludes unavailable worker,
   accept, decline with reason, mark-viewed + idempotency, assign, assign
   requires prior acceptance, cancel resets request + worker response,
   renotify resets declined workers. `test_scoping.py`: worker sees only
   own assignments, worker cannot accept on behalf of another, org admin
   scoped to their org, APF sees all, network overview live metrics,
   auth/sync idempotent. Total test count: 38 (up from 20).
2. CI pipelines — all 6 placeholder workflows replaced with real jobs.
   `backend-dev/prod`: pytest on push/PR with postgres:16 service container,
   alembic migrate, python-m-pytest -v. `frontend-dev/prod`: npm ci +
   tsc --noEmit + next build (API_BASE_URL=localhost:8000 so server-component
   fetches don't fail at build time). `infra-dev/prod`: terraform fmt -check
   -recursive + init -backend=false + validate for both dev and prod
   environments (matrix strategy). Prod variants gate on branch=main; deploy
   steps are present as commented-out scaffolding for when AWS infra is live.
2. Email notifications — real SMTP via `smtplib`, no extra deps. Mailpit
   added to Docker Compose (SMTP :1025, web UI :8025) for local capture.
   `NotificationDispatcher` composes bilingual (FR/EN) emails for:
   worker notified (publish + renotify), assignment confirmed, assignment
   cancelled. `EmailNotificationService` reads `SMTP_HOST/PORT/FROM/
   USERNAME/PASSWORD/USE_TLS` from config — falls back to skipped-log when
   host is empty. SMS stays a logged stub. Wired into
   `StaffingRequestService.publish()`, `renotify()`, `AssignmentService.
   assign()`, `cancel()` — all fire-and-forget (email errors log, never
   block the business operation). CLAUDE.md, `.env`, `.env.example` updated
   with SMTP vars.
2. D1–D3 — Full APF oversight surface. D1: `GET /api/v1/reports/network-overview`
   aggregates fill rate, avg time-to-fill, active substitutes, unfilled count,
   status breakdown, and shortage cities (cities with open requests but no
   available substitute). `NetworkOverview` TS type + `getNetworkOverview()`
   fetch helper. APF home rebuilt with 6 KPI cards, status bar chart, shortage
   panel, org activity table, recent-closed feed. D2: `/apf/substitutes` —
   network-wide substitute pool sorted available-first, with availability badge,
   language, city chips, qualifications/certifications, and assignment utilization
   count. D3: `/apf/activity` — full audit-log feed grouped by day, newest-first,
   with colour-coded action dots, actor name, request title context, relative
   timestamps, and a sidebar action-breakdown chart. APF nav updated to three
   links: Overview · Substitute Pool · Activity. `AuditLog` TS type +
   `getAuditLogs()` fetch helper added.
2. B1 — CoverageType enum (same_day_urgent · planned_absence · recurring ·
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
1. **SES sandbox release pending.** Domain + SMTP creds are wired and
   verified; emails fire correctly, but in the ca-central-1 sandbox
   only pre-verified recipients receive them. Production-access
   request was submitted via the AWS console — typical turnaround
   24–48h. While it's pending, verify each test recipient via
   `aws sesv2 create-email-identity --region ca-central-1
   --email-identity <email>` and have them click the AWS verification
   link.
2. **Final round of full end-to-end testing pending** (post-SES
   production-access). Once arbitrary recipient addresses can receive
   email, walk the operator chain again with real coordinator and
   substitute invitees getting their actual invitation emails, then
   accept / assign / cancel and verify each notification lands. The
   pre-SES walkthrough on 2026-05-10 covered everything except real
   email delivery.
3. **GitHub Actions deploy secrets unset.** `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REPOSITORY_URL`,
   `EC2_INSTANCE_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
   Until set, every backend deploy is manual via
   `make deploy-backend`.
4. **SMS notifications not wired (Twilio credentials missing).**
   Real product gap, not just nice-to-have — substitutes check SMS
   far more reliably than email, and the same-day-urgent coverage
   path lives or dies on response latency. `SmsNotificationService`
   already calls the Twilio REST API via `httpx`; it skips
   gracefully when `TWILIO_ACCOUNT_SID` is empty.
   `NotificationDispatcher._send_to_worker()` already fires SMS
   alongside email when `worker.phone` is set, and
   `WorkerProfile.urgent_alert_opt_in` exists as the consent toggle.
   To turn on: provision a Twilio account (or AWS SNS as the
   AWS-native alternative), add the credentials to the prod
   Secrets Manager, and re-deploy. ~30 min of work end-to-end once
   the provider is chosen.
5. **SSM agent never registered for `i-04a60b0aaf80c1528`.**
   `aws ssm send-command` returns `InvalidInstanceId`. Workaround:
   `aws ec2 reboot-instances` to roll a new image (the systemd unit
   pulls `:latest` on every start) — already encoded in
   `scripts/deploy-backend.sh`. Long-term: debug the agent or
   replace the instance.
5. **HTTPS hardening.** Currently Cloudflare Flexible SSL (encrypted
   client→Cloudflare, plain HTTP Cloudflare→EC2). Long-term: nginx +
   Let's Encrypt on EC2 or Cloudflare Origin Certificate.

If the user asks "what's next?" — check the Implementation roadmap section.

## Onboarding model (DB-owns-roles, invite-only)

This is the architecture the project converged on. **Clerk is identity
only. The DB owns roles and memberships.** After the one-time bootstrap,
nobody manually edits Clerk roles or `publicMetadata` — every account
exists because some authorised user invited it via an in-app endpoint.

The 8-step flow:

1. **One-time APF bootstrap.** Alembic migration `20260507_0003`
   inserts the APF tenant (`slug=apf-network`), the first
   `network_admin` user, and a `TenantMembership` linking them. Driven
   by env vars `APF_BOOTSTRAP_EMAIL` (+ optional
   `APF_BOOTSTRAP_FIRST_NAME` / `APF_BOOTSTRAP_LAST_NAME`). Skipped
   when unset; idempotent on re-runs.
2. **APF admin signs in.** Goes to `/sign-in`, Clerk authenticates,
   `/auth/sync` links their Clerk identity to the pre-seeded DB row.
   They land on `/apf`.
3. **APF admin creates a client organization** at
   `/apf/organizations/new`. Org belongs to the APF tenant.
4. **APF admin invites a coordinator** at `/apf/coordinators/new`.
   `CoordinatorService.invite()` creates `User(role=org_admin)` +
   `TenantMembership` + one `OrganizationMembership` per assigned org.
   An invite email is queued (silently skipped today — no SMTP).
5. **Coordinator signs up** at `/sign-up` with the invited email.
   Clerk creates the identity. `/auth/sync` finds the pre-existing
   DB user by email, links `clerk_user_id`, **preserves the DB role**
   (no Clerk metadata is read or trusted). They land on `/admin`.
6. **Coordinator manages their org** — creates coverage requests,
   publishes them, assigns substitutes. All data scoped via
   `AccessScope.org_ids`.
7. **APF admin invites a worker** at `/apf/workers/new`.
   `WorkerService.invite()` creates `User(role=worker)` +
   `TenantMembership`. Invite email queued (skipped — no SMTP).
8. **Worker signs up**, `/auth/sync` links them, lands on `/worker`.
   Worker layout sees `profile === null` → redirects to
   `/worker/onboarding`. Worker fills cities/qualifications/certs →
   profile created → can start receiving requests.

Critical invariants (don't break these):

- `/auth/sync` **never** reads role from the JWT or Clerk metadata.
  It links by `clerk_user_id` (existing-user fast path) or by email
  (link-by-email path); a pre-existing DB role is preserved.
- An uninvited Clerk sign-up gets **403** from `/auth/sync`. The
  frontend catches that, signs the user out of Clerk, and redirects
  to `/not-invited`.
- `require_admin` / `require_apf` / `require_network_admin` /
  `require_platform_admin` use the **DB role** via `AccessScope`, not
  the JWT role. The `current_user.role` field is allowed to be `None`
  and is no longer trusted for authorisation.
- Role-shell layouts (`/apf`, `/admin`) call `requireServerSession()`
  server-side before rendering, which both links the DB row (if first
  sign-in) and enforces a role allowlist. `/worker` does the
  equivalent client-side via `ClerkRoleProvider`.
- All client-side action calls (publish, assign, cancel, renotify,
  invite, accept/decline, etc.) MUST attach the Clerk JWT. Use the
  helpers in `lib/browser-api.ts` whenever possible — they call
  `authHeaders()` automatically. If a component needs a one-off
  `fetch()`, it must call `useAuth().getToken()` and add the
  `Authorization: Bearer …` header explicitly.

## End-to-end operator-flow test plan

Phases 1-6 are verified live (`josycorneille3@gmail.com` as APF admin
and `edenmaeleva@yahoo.com` as a coordinator have walked through them
in production). Phases 7-8 are pending.

| Phase | Action | Expected |
|---|---|---|
| 1 | APF admin signs in | lands on `/apf`; `/auth/sync` → `200` with `role=network_admin` |
| 2 | APF creates an organization at `/apf/organizations/new` | org appears in the list, scoped to APF tenant |
| 3 | APF invites a coordinator at `/apf/coordinators/new` | DB user + tenant + org memberships created; invite email skipped |
| 4 | Coordinator signs up with the invited email | `/auth/sync` links them; lands on `/admin`; role=org_admin |
| 5 | Coordinator creates a coverage request at `/admin/requests` | request created (status=draft), `created_by_user_id` server-derived |
| 6 | Coordinator publishes the request | matching runs, eligible workers notified, status=notified |
| 7 | APF invites a worker at `/apf/workers/new` | DB user (role=worker) + TenantMembership; invite email skipped |
| 8 | Worker signs up with the invited email, fills onboarding | redirected to `/worker/onboarding` because profile=null; submit creates WorkerProfile + cities/quals/certs |
| 9 | Worker sees the published request on `/worker/requests` | only if request city/quals/lang match worker; else use "Re-notify workers" on the admin card after onboarding |
| 10 | Worker accepts via the confirm-availability modal | response status=accepted; coordinator card shows the worker |
| 11 | Coordinator confirms the substitute | assignment created (pending_confirmation→confirmed); request status=assigned |
| 12 | Worker sees assignment on `/worker/assignments` | contact info, calendar link, arrival instructions surfaced |
| 13 | Coordinator cancels the assignment with a reason | request rolls back to responses_received; worker response → notified |

Failure-mode checklist (the bugs we hit on the first run, listed so we
catch regressions):

- An action button returns 401 → some client-side `fetch()` is missing
  the Bearer header. Audit `frontend/src/components/` and
  `frontend/src/app/*/page.tsx` for raw `fetch(\`${browserApiBaseUrl}…\`)`
  patterns.
- Submitting a coverage request returns 422 → the Pydantic schema
  requires a field the frontend stopped sending. Compare the form
  body to `StaffingRequestCreate`.
- An admin endpoint returns 403 with a valid session → the role check
  is reading the JWT instead of the DB. Replace with
  `Depends(require_role(...))` from `app.auth.permissions` (which now
  goes through `AccessScope`).
- SSR crashes on `/apf` or `/admin` for the first request after sign-up
  → the server-side `requireServerSession` is missing on that layout,
  or `/auth/sync` returned non-200 server-side.

## Manual deploy procedure (until CI secrets are set)

**Frontend:** Vercel auto-deploys on push to `main` (the project is
GitHub-connected). Just `git push origin main`. If a deploy needs a
manual nudge, click "Redeploy" on the latest commit in the Vercel
dashboard.

**Backend:** one command — `make deploy-backend` (calls
`scripts/deploy-backend.sh`). It runs the full sequence in-process:

  1. ECR login (token expires every ~12h)
  2. `docker build --platform linux/amd64` → tag `:latest` and `:sha-<COMMIT>`
  3. Push both tags
  4. `aws ec2 reboot-instances` (SSM agent never registered for this
     instance, so reboot is the only restart path; the systemd unit
     pulls `:latest` on every start)
  5. Poll the **direct** EC2 IP `99.79.127.227` — not Cloudflare,
     which can serve stale 5xx during the restart and confuses
     downtime detection. Wait until origin is observed down at least
     once (proves the reboot took effect), then wait until it's
     back up. Verify the new image actually rolled by checking that
     `DELETE /api/v1/users/{user_id}` is in `/openapi.json`.

Typical end-to-end: ~90–120 s.

**Things that have bitten us, codified in the script:**
- Earlier we ran the steps as inline `&& | tail` chains. When one
  step stalled, the chain died silently and we left orphan
  `docker push` processes holding ECR registry locks. Future pushes
  blocked indefinitely. If you ever see this again:
  `pgrep -fa "docker push"`, then `sudo snap restart docker` (or
  `sudo systemctl restart docker`) — regular `kill -9` won't work
  because Docker Snap runs in its own confinement.
- Cloudflare Flexible SSL caches non-200 responses while the origin
  is restarting. Polling `https://api.kouamvision.com` can show
  60+ minutes of "downtime" when the actual origin recovered in 90s.
  Always poll the direct IP for deploy verification.
- `aws ec2 reboot-instances` is async; the instance keeps serving
  the old image for 10–30s after the call returns. The script's
  two-phase polling (wait-for-down, then wait-for-up) avoids
  false-positive success.

**To rollback** to a prior image:
```
./scripts/deploy-backend.sh <old-sha>     # builds from current source!
```
…actually that's wrong — to roll back to a *previous* image, pull
the tagged version from ECR and re-push it as `:latest`:
```
docker pull 515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend:sha-<old>
docker tag <repo>:sha-<old> <repo>:latest
docker push <repo>:latest
aws ec2 reboot-instances --region ca-central-1 --instance-ids i-04a60b0aaf80c1528
```

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
  secrets) — **not deployed yet**. Frontend will be on Vercel; S3/CloudFront
  modules skipped (Vercel replaces them). Backend API on EC2 at
  `api.staffig.kouamvision.com`. Domain `staffig.kouamvision.com` on Cloudflare.

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
.github/workflows/    real CI: pytest + migrate, tsc + next build, terraform validate
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
  - `RoleProvider` is the authoritative frontend sync gate. After Clerk loads,
    it calls `POST /api/v1/auth/sync`, waits for the synced DB user, and routes
    from the returned DB role. This prevents post-login redirects from racing
    ahead of backend user provisioning.
  - The backend resolves the Clerk identity to a `users` row: lookup by
    `clerk_user_id` → lookup by email (link if found) → JIT-create. Names
    and email are pulled from JWT claims when present, otherwise from the
    Clerk Backend API (`GET /v1/users/{id}`) using `CLERK_SECRET_KEY`.
    Existing invited DB roles are preserved unless Clerk sends an explicit
    valid role claim; `network_admin` users get an active APF tenant membership
    automatically.
  - `WorkerSessionProvider` auto-picks the worker whose `clerk_user_id`
    equals the signed-in `useUser().user.id`. Manual worker override is disabled
    in production and only available for local/dev preview.
  - `lib/api.ts` and `lib/browser-api.ts` attach
    `Authorization: Bearer <Clerk JWT>` to every request
  - Backend (`auth/clerk.py`) verifies the JWT signature against the
    Clerk JWKS (cached for 1h) and enforces the issuer claim
  - Every `/api/v1/*` route requires authentication. `auth/permissions.py`
    exposes `require_admin` (platform/network/org admins),
    `require_network_admin`, and `require_apf` (network admin alias);
    these are applied as dependencies on writes,
    assignments, reports, and audit logs. Routes accept/decline workers
    can hit (worker actions, GET request listings) stay open to all
    authenticated roles
  - Row-level scoping via `auth/scope.py`: `get_access_scope` resolves
    the caller's `users` row + active `organization_memberships` into an
    `AccessScope` (`is_platform_admin`, `is_network_admin`, `is_org_admin`,
    `is_worker`, `tenant_id`, `org_ids`). Repositories expose
    `list_for_scope(scope)` methods that filter by role: platform_admin sees
    all rows; network_admin sees their tenant; org_admin filtered by
    `org_ids`; worker filtered by `user.id` (responses, assignments) or
    membership (notifications). Routes that fetch a single resource call
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

### Dev role + worker selection (dev/local only)

A floating **role-switcher** pill (bottom-right) writes
`localStorage["apf.devRole"]` and navigates to the matching surface. The root
`/` redirects based on that role. This switcher is hidden in production.

The worker surface additionally uses a **WorkerSession** context. On first
visit to `/worker/*`, users pick which worker they are previewing as
(`localStorage["apf.workerId"]`). This picker/override is disabled in
production; production worker sessions must match the signed-in Clerk user's
`clerk_user_id`.

These dev shims may still run when Clerk is enabled outside production — they
act as preview overrides on top of the real Clerk session, useful for jumping
between roles or impersonating a specific worker without juggling multiple
Clerk users. They must not be relied on for production behavior.

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
  the synced DB user, `/auth/sync` links/provisions a `users` row on
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
- Multi-tenant layer: `tenants` + `tenant_memberships` tables, `platform_admin`
  + `network_admin` roles, all repositories tenant-scoped
- Network admin management: create orgs, invite multi-org coordinators
  (`/apf/organizations`, `/apf/coordinators`) with full list/create UI
- Worker onboarding: invite (network admin) → `/worker/onboarding` (worker),
  redirect gate in worker layout when `profile === null`
- Production onboarding hardening: first network_admin tenant bootstrap via
  Alembic migration `20260507_0003`; invited DB roles preserved (no Clerk
  metadata reads); production routing uses the synced DB role; dev role/worker
  overrides hidden in production; request creation is authenticated and scoped;
  `/users` is scoped by caller
- Multi-tenant onboarding (Option A): platform_admin creates tenants from
  `/apf/networks/new` (UI gated to `platform_admin` only). Each tenant is
  fully isolated by tenant_id; new admin signs up via Clerk → `/auth/sync`
  links → lands scoped to their own tenant.
- User and tenant removal: `DELETE /api/v1/users/{id}` (network/platform
  admin) and `DELETE /api/v1/networks/{id}` (platform admin only) cascade-
  deactivate memberships, delete the Clerk identity, and tombstone the
  email so the address is free for re-invitation. UI buttons on
  `/apf/coordinators`, `/apf/substitutes`, and `/apf/networks`. Orphan
  cleanup tool at the bottom of `/apf/networks` for users not visible in
  any management list.
- Outbound email via AWS SES (verified domain `staffig.kouamvision.com`,
  ca-central-1 sandbox until production access is granted). All four
  email triggers fire: coordinator/worker invite, request published,
  assignment confirmed, assignment cancelled.
- SMS notifications via Twilio/httpx (skips when credentials absent —
  not yet wired in prod)
- Clerk auth in production: sign-in → JWT verified → role-scoped APF
  surface accessible.
- Real CI across all 6 GitHub workflows (pytest + tsc + next build + terraform)
- `pytest` (67/67) and `tsc --noEmit` pass
- One-command manual deploy via `make deploy-backend` (build → push to
  ECR → reboot EC2 → poll direct IP → verify new image)

## Known gaps (be aware of these before suggesting fixes)

1. **Final post-SES end-to-end pass pending.** The full operator
   chain (multi-tenant onboarding → org create → coordinator invite →
   coordinator sign-up → substitute invite → substitute onboarding →
   request publish → accept → assign → cancel) was walked through on
   2026-05-10 with the email side silently skipped. After SES
   production access is granted, repeat the chain with real recipient
   addresses and verify each notification email lands.
2. **SES sandbox release pending.** Production-access request was
   submitted to AWS for the ca-central-1 SES account. Until approved
   (~24–48h), only pre-verified recipient addresses receive mail —
   verify each test recipient via `aws sesv2 create-email-identity
   --region ca-central-1 --email-identity <email>`.
4. **Backend JWT verification falls back to unverified claims** when
   `CLERK_JWKS_URL` is empty (local dev without Clerk). That fallback
   exists by design — prod must always have the JWKS URL set.
5. **SSM agent unregistered** for `i-04a60b0aaf80c1528` —
   `aws ssm send-command` returns `InvalidInstanceId`. Backend deploys
   currently use `aws ec2 reboot-instances` instead.

(SMS notifications — see "Top remaining gaps" #4. Marked as a real
product priority since substitute response latency depends on it.)

## Implementation roadmap (Implementation-idea.md alignment)

This roadmap closes the gap between the current code and the product vision in
`Implementation-idea.md`. Items are ordered by dependency + leverage. Tick
each as it ships and keep "Current focus" in sync.

**Current focus:** Production deployment.
1. Clerk production instance with `staffig.kouamvision.com` domain
2. Vercel for frontend (Next.js App Router requires Node.js server)
3. AWS EC2 + RDS via Terraform for backend API at `api.staffig.kouamvision.com`
4. Cloudflare DNS: `staffig` → Vercel, `api.staffig` → EC2

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

- [x] **D1. Network Overview metrics.** Fill rate, time-to-fill, shortage by
  region, active substitute pool, unfilled requests, demand trends.
  *Shipped: `GET /api/v1/reports/network-overview` — fill rate, avg
  time-to-fill (hours), active substitutes, unfilled count, per-status
  breakdown, shortage cities. APF home rebuilt with KPI cards, status bar
  chart, shortage panel, org activity table, recent-closed feed.*
- [x] **D2. Substitute Pool view.** Network-wide worker list with status +
  utilization.
  *Shipped: `/apf/substitutes` — sorted available-first; availability badge,
  language, city chips, qualifications/certifications, total assignment count
  with active-assignment callout. No new backend endpoint (joins workers +
  assignments on frontend).*
- [x] **D3. Activity History.** Network-wide audit-log-style feed.
  *Shipped: `/apf/activity` — audit logs grouped by day, newest-first, with
  colour-coded action dots, actor name, request title context, relative
  timestamps, sticky sidebar with action-breakdown chart and totals.*

### Phase E — Polish + pilot follow-ups

Tracked here so they're not forgotten. None are blocking; all wait
for the SES production-access approval + final end-to-end pass before
they get prioritised.

- [ ] **E1. Mobile nav (hamburger) on `/apf` and `/admin`.** Both
  headers currently flex-wrap on narrow viewports — the nav pills
  drop to a second/third row and the Sign out button drifts. Below
  ~768px, hide the nav pill row and render a hamburger icon that
  toggles a slide-out drawer containing the same links + sign-out
  at the bottom. `/worker` already has the bottom-nav pattern and
  needs no change. ~1–2 hours of work; pure frontend, no backend
  changes.
- [ ] **E2. Worker UI polish pass (post-pilot).** Functional bones
  are right (mobile-first, large touch targets, card-based,
  bilingual). What's missing is the typography hierarchy,
  micro-interactions, contrast/accessibility audit, and a coherent
  visual identity beyond inline styles. **Don't hire a designer
  before pilot data lands** — let 10–20 real substitutes use the
  app for 2–4 weeks first, capture the friction points and the
  parts they ignore, and brief the designer from that spec rather
  than from taste.
- [ ] **E3. Case-study entry on `kouamvision.com/work/`.**
  Staffig is a KouamVision project — sign-in already brands it as
  "STAFFIG PLATFORM by KouamVision". No standalone marketing site
  needed (`staffig.kouamvision.com` itself is the app). All that's
  left is a case-study entry under the parent portfolio: project
  copy, screenshots, the "what it does / who it's for" pitch,
  inheriting the existing KouamVision design system. Decoupled
  from anything in this repo.

### Working order

Phases A–D are materially shipped. Phase E waits on pilot — don't start
E2/E3 (worker polish, brand identity) before real-user feedback is in
hand; E1 (mobile nav) can be pulled in earlier if a tester complains.
Historical: we worked top-to-bottom but pulled Phase B items forward
when an A item needed them (e.g., A6's "Response sent" copy benefited
from B2's `viewed_at`).

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
