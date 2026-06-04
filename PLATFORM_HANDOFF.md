# StaffiG — Platform Operator Handoff (Settings & Billing)

The tier-0 operator surface: **Settings** (running StaffiG-the-business) and **Billing** (plans, subscriptions, revenue). Pair with `MULTITENANCY_HANDOFF.md` — that doc owns the tenant model, isolation, and routing; this one details the two operator tabs that doc left as stubs.

Mockups: `src/platform.jsx` → `PlatformSettings`, `PlatformBilling` (plus the existing `PlatformTenants`, `TenantOnboarding`).
Lives at `app.staffig.ca/os/settings` and `app.staffig.ca/os/billing` (path-based routing per `MULTITENANCY_HANDOFF.md §3`).

---

## 0 · The non-negotiable: the operator never sees tenant data

Both screens obey the same boundary as the rest of tier 0:

> The platform operator sees **aggregate counts and revenue only**. Names of workers, request titles, shift details — never. Looking inside a tenant is a **logged, consented, time-boxed exception** (see §2.4), not a default.

Enforce structurally: platform endpoints live in a router (`/api/platform/*`) that **physically cannot import** the row-returning tenant queries. A code review rule, not just discipline.

---

## 1 · Access model — who can do what at tier 0

Three operator roles, stored in `platform_operators.role`:

| Role | Invite/suspend tenants | Add/remove operators | Billing & plans | Request tenant access |
|---|---|---|---|---|
| `owner` | ✅ | ✅ | ✅ | ✅ |
| `operator` | ✅ | ❌ | ❌ (view only) | ✅ |
| `support` | ❌ | ❌ | ❌ | ✅ (read-only, with approval) |

```ts
// extends MULTITENANCY_HANDOFF.md §1
export const platformOperators = pgTable('platform_operators', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  role: text('role').notNull().default('operator'),   // 'owner' | 'operator' | 'support'
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  invitedAt: timestamp('invited_at').defaultNow(),
  lastActiveAt: timestamp('last_active_at'),
});
```

**2FA is mandatory for `owner` and `operator`.** A `support` account without 2FA cannot request tenant access (§2.4). Enforce at the Clerk session level + check `mfaEnabled` before granting any access elevation.

---

## 2 · Settings screen (`PlatformSettings`)

Four sections, top to bottom. The first is the important one.

### 2.1 · Operators & access (headline section)

The list of every tier-0 user. This is the most security-sensitive surface in the whole product — keep it short, auditable, and obvious.

**Layout**: role legend (3 cards explaining owner/operator/support) → operator table (person, role, 2FA status, last active, actions).

**Endpoints:**
```
GET  /api/platform/operators           → PlatformOperator[]  (owner & operator only)
POST /api/platform/operators           { email, role }        (owner only)
       → creates Clerk invite + platform_operators row (pending until accepted)
PATCH /api/platform/operators/:id      { role }               (owner only)
DELETE /api/platform/operators/:id                            (owner only; cannot remove self or last owner)
POST  /api/platform/operators/:id/resend                      (owner only)
```

**Rules:**
- Cannot remove yourself. Cannot remove the **last** owner (lock-out protection).
- Promoting someone to `owner` requires a second owner to confirm (two-person rule) — or, if solo, an email-link re-auth.
- Every change writes a platform audit event (§4).
- Adding an operator with no 2FA: allowed, but they're blocked from sensitive actions until they enable it. UI shows the red "2FA Off" state.

**Acceptance:**
1. Owner adds an operator by email → appears as "pending", gets a Clerk invite.
2. A non-owner operator opens Settings → sees the list but the "Add operator" button and row menus are disabled.
3. Owner tries to remove the only other owner while being the sole remaining owner → blocked with "You can't remove the last owner."

### 2.2 · Tenant access (the privacy exception)

Controls how an operator may look inside a tenant when support requires it.

- **Require approval** toggle (default ON): the tenant admin must approve each access request.
- **Default access window**: how long a granted session lasts before auto-revoke (default 4h).
- **Active grants**: live count of operators currently inside any tenant (should usually be 0).

```ts
export const tenantAccessGrants = pgTable('tenant_access_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  operatorUserId: uuid('operator_user_id').notNull(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('requested'), // 'requested'|'approved'|'active'|'expired'|'denied'
  requestedAt: timestamp('requested_at').defaultNow(),
  approvedByUserId: uuid('approved_by_user_id'),          // a tenant_admin
  expiresAt: timestamp('expires_at'),
});
```

**Flow:** operator requests → tenant admin gets a notification → approves → operator gets read-only scoped access until `expiresAt` → every view writes to **that tenant's** `data_access_log` (per `NETWORK_HANDOFF.md §10`). Auto-expire via an Inngest job.

```
POST /api/platform/tenants/:id/access-request   { reason }   → grant (status:'requested')
POST /api/tenant/access-grants/:id/approve                    (tenant_admin, inside the tenant)
```

### 2.3 · New-tenant defaults

Applied when a tenant is invited. Plain key-value config:

| Setting | Default | Editable | Notes |
|---|---|---|---|
| Default language | `fr-CA` | ✅ | |
| Trial length | 30 days | ✅ | drives `tenants.status='trial'` window |
| Invite expiry | 14 days | ✅ | pending tenant invites lapse |
| Data residency | Canada · `aws-ca-central-1` | 🔒 locked | Law 25 |
| Retention · orphan cleanup | 30 days | ✅ | cascades to tenant default |

```
GET  /api/platform/settings           → { defaults, reservedSlugs }
PATCH /api/platform/settings          { key: value }   (owner only)
```

### 2.4 · Reserved slugs

The blocklist that protects system routes. A tenant invite whose slug is on this list is rejected (`MULTITENANCY_HANDOFF.md §5.3` validation).

Default list: `os, app, www, api, admin, login, pick, staff, support, help, status`. Owner can add more. Store as a simple string array in platform settings.

---

## 3 · Billing screen (`PlatformBilling`)

The operator's revenue view. A tenant **never** sees another tenant's plan; tenants see only their own plan inside their workspace settings.

### 3.1 · Layout
- Hero: MRR + paying-tenant count.
- KPI row: MRR, paying tenants, in trial, avg revenue/tenant.
- **Plans** — 3 cards (Starter / Network / Enterprise), editable.
- **Tenant subscriptions** table — tenant, plan, # orgs, MRR, status (Paid/Trial/Overdue), invoices link.

### 3.2 · Pricing model

Billing is **per organization per month** (an org = a billable seat). This matches the domain: a tenant's cost scales with how many sites they run, not how many workers (workers are free — you want as many in the pool as possible).

| Plan | Price | Includes |
|---|---|---|
| Starter | $40 / org / mo | up to 5 orgs, unlimited substitutes, email support |
| Network | $70 / org / mo | unlimited orgs, activity log + export, priority support, bulk invite |
| Enterprise | Custom / annual | SSO/SAML, custom residency, dedicated support, SLA |

```ts
export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  pricePerOrgCents: integer('price_per_org_cents'),       // null for Enterprise/custom
  features: jsonb('features').$type<string[]>().notNull().default([]),
  stripePriceId: text('stripe_price_id'),
  isActive: boolean('is_active').notNull().default(true),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id).unique(),
  planId: uuid('plan_id').references(() => plans.id),
  status: text('status').notNull().default('trial'),      // 'trial'|'active'|'past_due'|'canceled'
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  trialEndsAt: timestamp('trial_ends_at'),
  currentPeriodEnd: timestamp('current_period_end'),
  orgCountSnapshot: integer('org_count_snapshot'),        // billable seats at last sync
});
```

### 3.3 · Stripe integration
- One **Stripe Customer per tenant** (`subscriptions.stripeCustomerId`).
- Quantity-based subscription: `quantity = active org count`. When a tenant adds/removes an org, push the new quantity to Stripe (debounced, nightly reconcile).
- Webhooks → update `subscriptions.status`: `invoice.paid` → active, `invoice.payment_failed` → past_due, `customer.subscription.deleted` → canceled.
- A `past_due` tenant after grace period → operator may `suspend` (per `MULTITENANCY_HANDOFF.md §4`).

### 3.4 · Endpoints
```
GET  /api/platform/billing/summary     → { mrr, payingCount, trialCount, avgPerTenant }
GET  /api/platform/billing/plans       → Plan[]
PATCH /api/platform/billing/plans/:id  { price, features }        (owner only)
GET  /api/platform/billing/subscriptions → tenant subscription rows
GET  /api/platform/billing/tenants/:id/invoices → Stripe invoice list (operator view)
```

All revenue figures are aggregate — they never expose what's *inside* a tenant, only what the tenant is billed.

---

## 4 · Platform audit log

Every tier-0 action (operator added/removed, plan changed, tenant invited/suspended, access requested/granted) writes here. Separate from tenant `events` — this is the operator's own trail.

```ts
export const platformAuditLog = pgTable('platform_audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id').notNull(),
  action: text('action').notNull(),                       // 'operator.added', 'plan.updated', 'tenant.suspended', 'access.requested', ...
  targetType: text('target_type'),                        // 'operator'|'tenant'|'plan'|'grant'
  targetId: text('target_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Surface it later as an "Activity" view under Settings if you want; for v1 it just needs to be written.

---

## 5 · Build order (3–4 days, after the tenant core)

| Day | Deliverable |
|---|---|
| 1 | `platform_operators` role expansion + `platform_audit_log`. Operators & access screen (§2.1) read + add/remove with the lock-out rules. |
| 2 | 2FA enforcement; `tenant_access_grants` + the request/approve flow (§2.2) + auto-expire job. |
| 3 | New-tenant defaults + reserved slugs (§2.3–2.4). `plans` + `subscriptions` schema; Stripe customer/subscription wiring. |
| 4 | Billing screen (§3) + Stripe webhooks + the summary KPIs. Audit every action. |

---

## 6 · Acceptance test

1. Owner opens `/os/settings` → sees all operators, 2FA status, role legend.
2. Owner invites a new operator → pending row + Clerk invite + audit entry.
3. A `support` user requests access to a tenant → tenant admin approves → support gets read-only access that auto-expires in 4h, with every view logged in the tenant's audit log.
4. Owner opens `/os/billing` → MRR + per-tenant subscriptions; clicking a tenant shows invoices but **no** worker/shift data.
5. A tenant adds a 4th org → Stripe subscription quantity updates → MRR reflects it on next sync.
6. Non-owner operator cannot edit plans or add operators (buttons disabled, endpoints 403).
7. Attempt to read a tenant's requests from a `/api/platform/*` endpoint → impossible (the query isn't importable there).

If 1–7 pass, the operator's Settings + Billing surfaces are shippable.

---

That's the full tier-0 operator spec. The headline is **Operators & access** in §2.1 — short list, mandatory 2FA, two-person rule for owners, and the privacy boundary made explicit through logged, consented, time-boxed tenant access rather than a standing backdoor.
