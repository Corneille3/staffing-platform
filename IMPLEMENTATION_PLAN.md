# APF Staffing Platform Implementation Plan

## Current State

The repository currently contains two source artifacts at the root:

- `APF_Better_MVP_Build_Package_v2.pdf`
- `apf-staffing-platform-starter-local-dev-v2.zip`

No starter files have been extracted into the repository yet. The implementation steps below assume that the starter zip will become the working baseline for the project.

## Goal

Build the APF bilingual substitute dispatch MVP as a responsive web application with:

- `frontend`: Next.js web app
- `backend`: FastAPI API
- `db`: PostgreSQL
- `infra`: Terraform-managed AWS infrastructure for `dev` and `prod`

The product core is the staffing request lifecycle:

1. Organization admin creates request
2. System evaluates eligible workers
3. Notifications are sent
4. Workers accept or decline
5. Organization admin confirms one assignment
6. System records audit history and reporting data

## Phase 0: Materialize The Starter In Repo

1. Extract `apf-staffing-platform-starter-local-dev-v2.zip` into the repository root.
2. Move the starter contents up so the repo contains:
   - `frontend/`
   - `backend/`
   - `infra/`
   - `docs/`
   - `.github/workflows/`
   - `docker-compose.yml`
   - `Makefile`
   - `.env.example`
   - `.gitignore`
   - `.editorconfig`
3. Remove generated artifacts from the extracted tree:
   - all `__pycache__/`
   - all `*.pyc`
4. Replace the current root `README.md` with a real project overview.

## Phase 1: Lock Critical Decisions

These decisions must be resolved before building feature code.

### 1. Authentication Provider

**Resolved**: Clerk. See `docs/decisions/adr-004-auth-provider-clerk.md`.

The PDF originally recommended Amazon Cognito; that direction was reversed.
Clerk now handles authentication across all surfaces.

Standardized on:

- backend Clerk JWT decode in `app/auth/clerk.py`
- frontend `@clerk/nextjs` (not yet installed — pending)
- environment variables: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `CLERK_ISSUER_URL`, `CLERK_JWKS_URL`
- Terraform `secrets-manager` module stores Clerk keys + JWKS URL

### 2. Schema Direction

The PDF schema and the starter migration do not fully match.

Decide whether to keep:

- a more normalized schema close to the PDF, or
- a pragmatic MVP schema with selected JSONB fields

Create:

- `docs/schema-alignment.md`

### 3. API Naming

The PDF uses `/requests`, while the starter currently uses `/staffing-requests`.

Pick one naming convention now and keep it stable across:

- backend routes
- frontend API client
- docs
- tests

### 4. Backend Runtime Choice

The PDF mentions Lightsail as a likely MVP runtime, while the Terraform starter currently uses public EC2 plus private RDS.

Either:

- keep the EC2-based Terraform as the actual MVP decision, or
- refactor infra toward the preferred hosting model

Document the final decision in the architecture docs.

## Initial Database Schema

The PDF defines PostgreSQL as the primary database for the MVP. UUIDs should be used for domain entities, and timestamps should use timezone-aware values.

### Core Tables From The Specification

#### `organizations`

- `id` UUID PK
- `name`
- `type`
- `city`
- `region`
- `address`
- `contact_email`
- `contact_phone`
- `preferred_language`
- `is_active`
- `created_at`
- `updated_at`

#### `users`

- `id` UUID PK
- `first_name`
- `last_name`
- `email` UNIQUE
- `phone`
- `preferred_language`
- `role`
- `is_active`
- `last_login_at`
- `created_at`
- `updated_at`

#### `organization_memberships`

- `id` UUID PK
- `organization_id` FK
- `user_id` FK
- `role`
- `is_active`
- `created_at`
- `UNIQUE(organization_id, user_id, role)`

#### `worker_profiles`

- `id` UUID PK
- `user_id` FK UNIQUE
- `availability_status`
- `urgent_alert_opt_in`
- `travel_radius_km`
- `notes`
- `created_at`
- `updated_at`

#### `worker_regions`

- `id` UUID PK
- `worker_profile_id` FK
- `city`
- `region`

#### `worker_qualifications`

- `id` UUID PK
- `worker_profile_id` FK
- `qualification_code`
- `qualification_label`
- `expires_at` NULL

#### `staffing_requests`

- `id` UUID PK
- `organization_id` FK
- `request_type`
- `title`
- `description`
- `request_date`
- `start_time`
- `end_time`
- `city`
- `region`
- `location_text`
- `urgency`
- `language_requirement`
- `status`
- `created_by_user_id` FK
- `assigned_worker_user_id` FK NULL
- `published_at` NULL
- `expires_at` NULL
- `created_at`
- `updated_at`

#### `request_requirements`

- `id` UUID PK
- `staffing_request_id` FK
- `requirement_type`
- `requirement_value`

#### `request_notifications`

- `id` UUID PK
- `staffing_request_id` FK
- `worker_user_id` FK
- `channel`
- `delivery_status`
- `provider_message_id` NULL
- `sent_at`
- `delivered_at` NULL
- `created_at`

#### `request_responses`

- `id` UUID PK
- `staffing_request_id` FK
- `worker_user_id` FK
- `response_status`
- `responded_at`
- `comment` NULL
- `UNIQUE(staffing_request_id, worker_user_id)`

#### `request_assignments`

- `id` UUID PK
- `staffing_request_id` FK UNIQUE
- `worker_user_id` FK
- `assigned_by_user_id` FK
- `assignment_status`
- `assigned_at`
- `cancelled_at` NULL

#### `audit_logs`

- `id` BIGSERIAL PK
- `actor_user_id` FK NULL
- `organization_id` FK NULL
- `entity_type`
- `entity_id` UUID NULL
- `action`
- `payload` JSONB
- `created_at`

#### `notification_templates`

- `id` UUID PK
- `template_key`
- `language_code`
- `channel`
- `subject_template` NULL
- `body_template`
- `is_active`
- `UNIQUE(template_key, language_code, channel)`

### Key Indexes From The Specification

- `users(email)`
- `organization_memberships(organization_id, user_id)`
- `staffing_requests(organization_id, status, request_date)`
- `staffing_requests(status, urgency, request_date)`
- `request_notifications(staffing_request_id, worker_user_id)`
- `request_responses(staffing_request_id, response_status)`
- `audit_logs(organization_id, created_at DESC)`
- `worker_regions(region, city)`
- `worker_qualifications(qualification_code)`

### Schema Alignment Note

The starter migration currently does not match this schema exactly. Before feature work proceeds, the project must decide whether to:

- align the codebase to this normalized spec-first schema, or
- keep a reduced MVP schema and document each intentional deviation

That alignment work belongs in:

- `docs/schema-alignment.md`
- `backend/migrations/versions/20260420_0001_initial_schema.py`
- `backend/app/models/*`

## Phase 2: Backend Foundation

### 1. Database Base Layer

Implement real SQLAlchemy base wiring.

Update:

- `backend/app/db/base.py`
- `backend/app/db/session.py`
- `backend/app/core/config.py`

Add:

- declarative base
- UUID conventions
- shared timestamp mixin if useful
- validated settings for local, test, dev, prod

### 2. Domain Models

Replace placeholder models with real SQLAlchemy models.

Update:

- `backend/app/models/organization.py`
- `backend/app/models/user.py`
- `backend/app/models/organization_membership.py`
- `backend/app/models/worker_profile.py`
- `backend/app/models/staffing_request.py`
- `backend/app/models/request_notification.py`
- `backend/app/models/request_response.py`
- `backend/app/models/assignment.py`
- `backend/app/models/audit_log.py`

Likely add:

- `backend/app/models/__init__.py`

If normalized immediately, also add:

- `backend/app/models/worker_region.py`
- `backend/app/models/worker_qualification.py`
- `backend/app/models/request_requirement.py`

### 3. Pydantic Schemas

Replace placeholder schemas with real request/response models.

Update:

- `backend/app/schemas/common.py`
- `backend/app/schemas/organization.py`
- `backend/app/schemas/user.py`
- `backend/app/schemas/worker.py`
- `backend/app/schemas/staffing_request.py`
- `backend/app/schemas/request_response.py`
- `backend/app/schemas/assignment.py`

Likely add:

- `backend/app/schemas/auth.py`

### 4. Migration Alignment

Align the initial migration with the final agreed schema.

Update:

- `backend/migrations/versions/20260420_0001_initial_schema.py`
- `backend/migrations/env.py`

If no real environment data exists yet, it is better to correct the initial migration now than to carry drift forward.

### 5. Repository Layer

Implement real persistence logic.

Update:

- `backend/app/repositories/organization_repository.py`
- `backend/app/repositories/worker_repository.py`
- `backend/app/repositories/staffing_request_repository.py`
- `backend/app/repositories/response_repository.py`
- `backend/app/repositories/assignment_repository.py`
- `backend/app/repositories/audit_repository.py`

### 6. Service Layer

Implement the service layer needed for the first vertical slice.

Update:

- `backend/app/services/organization_service.py`
- `backend/app/services/worker_service.py`
- `backend/app/services/staffing_request_service.py`
- `backend/app/services/audit_service.py`

Keep as planned placeholders until later if not needed immediately:

- `backend/app/services/matching_service.py`
- `backend/app/services/assignment_service.py`
- `backend/app/services/reporting_service.py`

## Phase 3: Auth And Authorization

Build the minimum real auth and RBAC foundation.

Update:

- `backend/app/api/v1/auth.py`
- `backend/app/auth/clerk.py`
- `backend/app/auth/permissions.py`

Keep Clerk naming consistent across backend settings, frontend environment variables, Terraform secrets, and documentation.

Minimum Sprint 1 behavior:

- parse current user context
- support `/me`
- provide role-aware permission helpers
- enforce organization scoping rules

Core roles:

- `apf_admin`
- `org_admin`
- `worker`

## Phase 4: Real API Skeleton

Replace empty API handlers with DB-backed endpoints.

Update:

- `backend/app/api/v1/router.py`
- `backend/app/api/v1/organizations.py`
- `backend/app/api/v1/workers.py`
- `backend/app/api/v1/staffing_requests.py`

First useful API set:

- `GET /health`
- `GET /me`
- `GET /organizations`
- `GET /organizations/{id}`
- `GET /workers`
- `GET /workers/{userId}`
- `PATCH /workers/{userId}/availability`
- `GET /requests`
- `GET /requests/{requestId}`

Optional in Sprint 1 if you want a stronger vertical slice:

- `POST /requests`

## Phase 5: Seed Data And Tests

### 1. Seed Data

Add a local seed script so the UI and API have meaningful records.

Likely add:

- `backend/app/scripts/seed_dev_data.py`

Seed at least:

- 1 APF admin
- 1 organization
- 1 organization admin
- 3 to 5 workers
- 2 or more staffing requests

### 2. Make Targets

Update:

- `Makefile`
- `docker-compose.yml` if needed

Useful targets:

- `make up`
- `make down`
- `make migrate`
- `make seed`
- `make test`

### 3. Backend Tests

Update:

- `backend/app/tests/test_health.py`

Add:

- `backend/app/tests/test_auth_me.py`
- `backend/app/tests/test_organizations.py`
- `backend/app/tests/test_workers.py`
- `backend/app/tests/test_requests.py`

Minimum test coverage:

- app boots
- DB dependency works
- migration schema loads
- API returns real seeded data

## Phase 6: Frontend Foundation

### 1. App Shell

Replace the placeholder homepage with a real app shell.

Update:

- `frontend/src/app/layout.tsx`
- `frontend/src/app/page.tsx`

### 2. Frontend Structure

Add the initial feature layout:

- `frontend/src/features/auth/`
- `frontend/src/features/dashboard/`
- `frontend/src/features/organizations/`
- `frontend/src/features/workers/`
- `frontend/src/features/requests/`
- `frontend/src/features/notifications/`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/i18n/`
- `frontend/src/styles/`

### 3. Initial Pages

Add:

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/app/organizations/page.tsx`
- `frontend/src/app/workers/page.tsx`
- `frontend/src/app/requests/page.tsx`

### 4. API Client

Implement a small API client for the frontend.

Update or add:

- `frontend/src/lib/api.ts`
- `frontend/.env.local.example`

### 5. Translation Foundation

Add translation dictionaries and a minimal selection mechanism.

Likely add:

- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/fr.ts`
- `frontend/src/i18n/index.ts`

Rule:

- keep bilingual strings in translation files, not inside feature logic

### 6. Minimum UI Deliverable

Sprint 1 frontend should render:

- current user summary
- organization list
- worker list
- request list

## Phase 7: Core Domain Buildout After Foundation

Once the repo foundation is stable, build the product in vertical slices.

### Vertical Slice 1: Worker Profile And Availability

Implement:

- worker profile read/update
- availability toggle
- preferred language
- urgent alert opt-in
- regions and qualifications

### Vertical Slice 2: Request Creation And Lifecycle

Implement:

- create staffing request
- edit request within allowed states
- publish request
- cancel request
- complete request
- request status transitions

### Vertical Slice 3: Matching

Implement deterministic eligibility filtering by:

- active status
- availability
- region/city
- language requirement
- qualifications
- urgent opt-in when required

### Vertical Slice 4: Notifications

Implement:

- in-app notifications
- email dispatch abstraction
- delivery logging

Design the abstraction so SMS can be added later without changing domain APIs.

### Vertical Slice 5: Responses

Implement:

- worker accept
- worker decline
- response timestamps
- response board for org admins
- prevention of duplicate/conflicting final response states

### Vertical Slice 6: Assignment

Implement:

- org admin assignment confirmation
- close request to further acceptance
- notify selected worker
- notify other respondents where needed
- reopen/cancel flows with audit logging

### Vertical Slice 7: Reporting And Audit

Implement:

- organization dashboard summary
- APF network summary
- fill rate metrics
- average time to assign
- audit log APIs

## Phase 8: Infrastructure Alignment

The starter Terraform is more complete than the application code. Keep it aligned with application reality.

Review and update:

- `infra/environments/dev/main.tf`
- `infra/environments/dev/variables.tf`
- `infra/environments/dev/terraform.tfvars`
- `infra/environments/prod/main.tf`
- `infra/environments/prod/variables.tf`
- `infra/environments/prod/terraform.tfvars`
- `infra/modules/secrets-manager/main.tf`
- `infra/modules/app-runtime/main.tf`

Main checks:

- auth-related secrets match the chosen provider
- environment variable names match backend settings
- backend deployment target matches documented architecture

## Phase 9: CI/CD

Replace placeholder GitHub workflows.

Update:

- `.github/workflows/frontend-dev.yml`
- `.github/workflows/backend-dev.yml`
- `.github/workflows/infra-dev.yml`
- `.github/workflows/frontend-prod.yml`
- `.github/workflows/backend-prod.yml`
- `.github/workflows/infra-prod.yml`

Minimum useful CI:

- frontend install and build
- backend install and tests
- Terraform fmt and validate

Later:

- deploy jobs
- smoke tests
- manual approval gate for prod

## Phase 10: Documentation

Add implementation-facing docs.

Create:

- `docs/api-v1.md`
- `docs/local-development.md`
- `docs/sprints/sprint-1.md`

Update:

- `README.md`

Document:

- setup flow
- environment variables
- architecture decisions
- current sprint scope
- API surface

## Recommended Build Order

1. Extract starter into repo
2. Clean generated files
3. Lock auth decision
4. Align schema and migration
5. Implement backend models and schemas
6. Make API return real data
7. Add seed data and tests
8. Build frontend shell and lists
9. Align Terraform with app decisions
10. Replace placeholder CI
11. Document the real build state

## Definition Of Done For Initial Foundation

The foundation phase is complete when:

- the starter files are present in the repository
- the repo is free of generated Python cache artifacts
- local Docker startup works
- migration applies successfully
- seeded data exists
- core read endpoints return real data
- frontend renders real API data
- auth decision is documented
- schema decision is documented
- CI validates frontend, backend, and Terraform basics

## Important Risk Areas

1. Auth drift:
   any residual Cognito references in code/docs/infra after the Clerk
   decision will create rework — sweep them on sight

2. Schema drift:
   if the migration and the product spec keep diverging, services and frontend contracts will become unstable

3. Feature-first development without foundation:
   adding screens before RBAC, schema, and API contracts are stable will slow the project down

4. Infrastructure mismatch:
   if the documented architecture and Terraform implementation differ, deployment work will be delayed later

## Next Step

When approved, the first repository changes should be:

1. extract the starter into the repo root
2. clean generated artifacts
3. replace the placeholder root documentation
4. begin backend foundation work
