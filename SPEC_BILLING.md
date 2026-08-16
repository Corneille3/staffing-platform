# Spec — Billing (Platform tier)

Extracted verbatim from `PLATFORM_HANDOFF.md` §3 before that document was
retired (2026-08-16) — the only section not yet built. Deferred until a Stripe
account is wired; schema (`plans`/`subscriptions`) not created. The rest of the
handoff (§1–§2.4, §4) shipped 2026-06-04 and is documented in CLAUDE.md.
Note: the original handoff was written against a Drizzle/TS stack — translate
the table sketches to SQLAlchemy + Alembic when building.

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
