# StaffiG — Multi-Tenancy Handoff

The architecture brief that makes StaffiG a true multi-tenant SaaS. **Read this before the other handoffs** — it changes assumptions in all of them. Pair with `HANDOFF.md` for the foundational stack.

> This doc is the source of truth for the tenant model. Where it conflicts with an earlier handoff, this wins. The amendments in §9 list exactly what changes in each other doc.

---

## 0 · The model in one breath

A **tenant** is an isolated workspace owned by one customer (a CPE network, a foundation, a healthcare authority). The tenant *is* what earlier docs called the "network." Everything a customer owns — organizations, coordinators, substitutes, requests, activity — lives inside one tenant and is invisible to every other tenant.

Above all tenants sits the **Platform operator** (StaffiG itself), which can invite tenants and watch adoption, but **never sees inside** a tenant's data.

```
Tier 0   Platform operator (StaffiG)        os.staffig.ca
          │  invites tenants · aggregate metrics only
Tier 1   Tenant workspace (= "network")     {tenant}.staffig.ca/network
          │  tenant admin: create orgs, coordinators, invite subs, activity
Tier 2   Organization (site / installation) {tenant}.staffig.ca/admin
          │  coordinator: post requests, assign
Tier 3   Coordinator → Substitute
```

The **same `/network` UI shell** serves two scopes:
- **Platform** sees a list of *tenants* + "Invite a network."
- **Tenant admin** sees *their* orgs, coordinators, subs, activity.

Just as a tenant admin relates to orgs, the platform relates to tenants — one tier up, same pattern.

---

## 1 · What "tenant" maps to in the schema

The existing `networks` table **becomes the tenants table**. Rename for clarity:

```ts
// db/schema.ts
export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),                      // "Réseau Québec"
  slug: text('slug').notNull().unique(),             // "reseau-qc" → reseau-qc.staffig.ca
  region: text('region'),
  status: text('status').notNull().default('pending'), // 'pending' | 'onboarding' | 'active' | 'suspended'
  clerkOrgId: text('clerk_org_id').unique(),         // maps to a Clerk Organization
  createdAt: timestamp('created_at').defaultNow().notNull(),
  activatedAt: timestamp('activated_at'),
});

// Tenant admins/observers (was network_memberships)
export const tenantMemberships = pgTable('tenant_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  role: text('role').notNull(),                      // 'tenant_admin' | 'tenant_observer'
  status: text('status').notNull().default('active'),
  invitedAt: timestamp('invited_at').defaultNow(),
});

// Platform operators — the only people above tenants. Tiny table.
export const platformOperators = pgTable('platform_operators', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id).unique(),
  role: text('role').notNull().default('operator'), // 'operator' | 'support'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

`network_organizations` is no longer needed — an org belongs to exactly one tenant via a column (next section). The many-to-many is gone; an organization can't be shared across tenants (that was a single-tenant convenience).

---

## 2 · `tenant_id` everywhere — the isolation rule

Every domain table gets a `tenantId` column. No exceptions among business data.

```ts
organizations.tenantId       // FK → tenants.id  (replaces network_organizations join)
memberships.tenantId         // a substitute's membership is scoped to a tenant
requests.tenantId
notifications.tenantId
events.tenantId
availabilities.tenantId
dataAccessLog.tenantId
```

**`users` and `substitute_profiles` are the exception** — they're *identity*, shared across tenants. A substitute who works for two tenants is **one `users` row** with **two `memberships`** (one per tenant). Each tenant sees only its own membership; neither knows the other exists.

### The single enforcement point

```ts
// lib/tenant.ts
export async function resolveTenant(req: Request): Promise<Tenant> {
  // subdomain → tenant. "reseau-qc.staffig.ca" → slug "reseau-qc"
  const host = req.headers.get('host')!;
  const slug = host.split('.')[0];
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) });
  if (!tenant || tenant.status === 'suspended') throw new NotFoundError();
  return tenant;
}

export async function scopeToTenant(userId: string, tenant: Tenant) {
  const m = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, userId),
               eq(memberships.tenantId, tenant.id),
               eq(memberships.status, 'active')),
  });
  const tm = await db.query.tenantMemberships.findFirst({
    where: and(eq(tenantMemberships.userId, userId),
               eq(tenantMemberships.tenantId, tenant.id),
               eq(tenantMemberships.status, 'active')),
  });
  if (!m && !tm) throw new ForbiddenError('Not a member of this tenant');
  return { tenantId: tenant.id, orgRole: m?.role, tenantRole: tm?.role };
}
```

**Every query** appends `WHERE tenant_id = $tenantId`. Make this hard to forget:

- **Drizzle**: wrap queries in a `tenantDb(tenantId)` helper that pre-binds the filter, OR
- **Postgres RLS** (recommended for defense-in-depth): enable Row-Level Security on every tenant-scoped table with a policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`, and set `app.tenant_id` at the start of each request transaction. Then even a forgotten `WHERE` can't leak across tenants.

```sql
-- migration
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON requests
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- repeat for organizations, memberships, notifications, events, availabilities
```

```ts
// at the start of every tenant-scoped request
await db.execute(sql`SET LOCAL app.tenant_id = ${tenant.id}`);
```

RLS is the seatbelt. Application-level `WHERE` is the brakes. Use both.

---

## 3 · Routing — subdomain per tenant

| Host | Resolves to |
|---|---|
| `os.staffig.ca` | Platform operator (tier 0) — reserved slug `os` |
| `app.staffig.ca` | Generic sign-in → redirect to the user's tenant |
| `reseau-qc.staffig.ca` | Tenant "Réseau Québec" |
| `reseau-qc.staffig.ca/network` | Tenant admin workspace |
| `reseau-qc.staffig.ca/admin` | Coordinator surface (scoped to this tenant) |
| `reseau-qc.staffig.ca/inbox` | Worker app (scoped to this tenant) |

```ts
// middleware.ts — runs before everything
export default clerkMiddleware(async (auth, req) => {
  const host = req.headers.get('host')!;
  const slug = host.split('.')[0];

  // Tier 0 — platform
  if (slug === 'os') {
    const { userId } = await auth.protect();
    if (!(await isPlatformOperator(userId))) return Response.redirect(new URL('https://app.staffig.ca', req.url));
    return; // allow platform routes
  }

  // app.* — no tenant yet; route to the user's home tenant
  if (slug === 'app') {
    const { userId } = await auth.protect();
    const home = await firstActiveTenant(userId);
    if (!home) return Response.redirect(new URL('/not-invited', req.url));
    return Response.redirect(new URL(`https://${home.slug}.staffig.ca`, req.url));
  }

  // Tenant subdomain
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return new Response('Workspace not found', { status: 404 });

  const { userId } = await auth.protect();
  const scope = await safeScopeToTenant(userId, tenant);   // null if not a member
  if (!scope) return Response.redirect(new URL('/not-invited?reason=wrong-tenant', req.url));

  // set the RLS GUC for the rest of the request via a header the route handlers read
  const res = NextResponse.next();
  res.headers.set('x-tenant-id', tenant.id);
  return res;
});
```

**Local dev / preview**: subdomains are annoying on localhost. Support a path fallback `staffig.ca/t/{slug}/...` resolved by the same middleware, used only when `NODE_ENV !== 'production'` or for preview deploys. Production is subdomain-only.

**DNS**: wildcard `*.staffig.ca` → the Vercel project. Vercel handles wildcard domains natively.

---

## 4 · Tenant lifecycle (state machine)

```
pending ──(admin accepts invite)──> onboarding ──(wizard complete)──> active
   │                                                                      │
   └──(invite expires 14d)──> expired                    suspended <──(operator)
```

| Status | Meaning | Who can act |
|---|---|---|
| `pending` | Operator sent an invite; no one's signed up | nobody inside; operator can resend/revoke |
| `onboarding` | First admin signed up, running the wizard | the admin (wizard only) |
| `active` | Workspace live | everyone in scope |
| `suspended` | Operator paused (non-payment, ToS) | nobody; data preserved |

---

## 5 · Screen — Platform · Tenants (`PlatformTenants`)

Lives at `os.staffig.ca/tenants`. Mockup: `src/platform.jsx`.

### 5.1 · Layout
- Near-black `PlatformShell` sidebar with "OS" badge (visually distinct from the tenant's dark-but-warmer sidebar).
- Header: serif headline + "Invite a network" primary CTA.
- **Aggregate KPI row** — active networks, total orgs, total substitutes, weighted fill rate. These are the *only* numbers the operator sees.
- **Tenant table** — name + slug + admin, region, org count, sub count, fill rate, status chip (Active / Invite sent / Onboarding), row action.
- Footer note reinforcing the privacy boundary.

### 5.2 · Data

```
GET /api/platform/tenants
→ {
    kpis: { activeTenants, totalOrgs, totalSubstitutes, weightedFillRate },
    tenants: Array<{
      id, name, slug, region, status,
      orgCount, substituteCount, fillRate30d,   // aggregate counts ONLY
      adminName, since
    }>
  }
```

The query crosses tenant boundaries (it's the operator), but selects **only counts and rates** — never names of workers, request titles, or shift details. Enforce this at the API layer: the platform endpoints live in a separate router that physically cannot import the row-returning queries.

```sql
SELECT t.id, t.name, t.slug, t.region, t.status,
  (SELECT COUNT(*) FROM organizations o WHERE o.tenant_id = t.id) AS org_count,
  (SELECT COUNT(DISTINCT m.user_id) FROM memberships m WHERE m.tenant_id = t.id AND m.role = 'substitute' AND m.status='active') AS substitute_count,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE r.status IN ('assigned','completed')) / NULLIF(COUNT(*),0))
     FROM requests r WHERE r.tenant_id = t.id AND r.created_at > now() - interval '30 days') AS fill_rate_30d
FROM tenants t
ORDER BY t.created_at DESC;
```

### 5.3 · Invite a tenant

```
POST /api/platform/tenants
Body: { name, slug, adminEmail, region? }
→ { id, slug, status: 'pending' }
```

Flow:
1. Validate `slug` is unique and not reserved (`os`, `app`, `www`, `api`, `admin`).
2. Insert `tenants` row, status `pending`. Create a Clerk Organization, store `clerkOrgId`.
3. `clerk.invitations.create({ emailAddress: adminEmail, publicMetadata: { tenantId, role: 'tenant_admin' } })`.
4. Email the admin a sign-up link to `{slug}.staffig.ca`.
5. Write a platform-level audit event.

`POST /api/platform/tenants/:id/resend` re-sends; `/revoke` cancels a pending invite; `/suspend` & `/reactivate` flip an active tenant.

### 5.4 · Acceptance test
1. Operator clicks "Invite a network", fills name + slug + admin email → tenant appears as "Invite sent".
2. Operator can see org/sub counts for active tenants but **cannot** click into any worker, request, or shift.
3. Attempting to hit a tenant-scoped data endpoint as the operator → 403.

---

## 6 · Screen — Tenant onboarding wizard (`TenantOnboarding`)

Lives at `{slug}.staffig.ca/welcome`, shown while `tenant.status === 'onboarding'`. Mockup: `src/platform.jsx`.

### 6.1 · The 4 steps

| Step | Captures | Endpoint |
|---|---|---|
| 1 · Name your network | confirm/edit `tenants.name`, slug, region, language (pre-filled from the operator's invite) | `PATCH /api/tenant/profile` |
| 2 · Add your first organization | first `organizations` row (name, type, city, lang, address) | `POST /api/tenant/organizations` |
| 3 · Invite a coordinator | coordinator email + which org | `POST /api/tenant/coordinators/invite` |
| 4 · Invite substitutes | bulk emails/phones + role | `POST /api/tenant/substitutes/invite` |
| Finish | flips status to active, lands on `/network` | `POST /api/tenant/onboarding/complete` |

### 6.2 · Layout
- Dark left rail with the 4-step tracker (done = moss check, active = terra, future = muted) + the tenant's name and subdomain. Completed steps are clickable to go back.
- Right pane renders the current step's form; one step visible at a time, advancing on "Continue / Save & continue."
- Steps 3 & 4 are skippable ("Skip for now"); step 2 is encouraged but skippable too.
- After step 4, a **"You're all set" finish screen** summarizes what was created (1 org, 1 coordinator, 3 subs invited) and routes to `/network` via "Go to my network."

> In the prototype (`src/platform.jsx`), the wizard is fully interactive — click through all 4 steps and the finish screen. In production it's one step per screen with Continue/Back.

### 6.3 · Completion

```
POST /api/tenant/onboarding/complete
→ { status: 'active' }   // flips tenants.status, routes to /network
```

After completion the admin lands on `/network` (the dashboard from `NETWORK_HANDOFF.md`, now tenant-scoped). The wizard never shows again; re-running setup happens through normal settings.

### 6.4 · Acceptance test
1. Invited admin clicks the email link → signs up via Clerk → lands on `/welcome` step 1 (name pre-filled from the invite).
2. Adds an org in step 2 → `organizations` row created with the correct `tenant_id`.
3. Invites a coordinator in step 3 → that person gets a Clerk invite scoped to this tenant.
4. Completes → `tenant.status='active'`, routed to `/network`, wizard gone on next login.

---

## 7 · What the tenant `/network` becomes

The screens in `NETWORK_HANDOFF.md` (Dashboard, Activity, Pool) are **unchanged in layout** but their meaning shifts:

- They're now **tenant-scoped, not read-only**. The tenant admin *can* act: create orgs, invite coordinators and substitutes, suspend a site. (The old "APF observes, doesn't dispatch" note is replaced with "Your workspace.")
- Every query gains `WHERE tenant_id = $tenantId` (via RLS + helper).
- The sidebar badge reads **"Network"**, the tenant name + subdomain show in the switcher.
- Dispatch still belongs to coordinators at `/admin` — the tenant admin doesn't assign individual shifts, they run the org/people layer.

Add two actions the read-only APF lacked:
- **"+ Add organization"** on the Organizations view → same form as onboarding step 2.
- **"Invite"** on the substitute pool and a coordinators view → tenant-scoped invite.

---

## 8 · Auth & Clerk mapping

- One **Clerk Organization per tenant**, stored as `tenants.clerkOrgId`.
- A user's Clerk session can belong to multiple Clerk Orgs (= multiple tenants). The active subdomain picks which one is in scope.
- Roles live in **your** DB (`memberships.role`, `tenantMemberships.role`, `platformOperators`), not in Clerk — Clerk only proves identity.
- Webhook `organizationMembership.created` → upsert the matching `memberships`/`tenantMemberships` row.
- A substitute invited by two tenants = two Clerk Org memberships = two rows. Logging into `reseau-qc.staffig.ca` scopes them to that tenant only.

---

## 9 · Amendments to the other handoffs

| Doc | What changes |
|---|---|
| `HANDOFF.md` | Add `tenantId` to `organizations`, `memberships`, `requests`, `notifications`, `events`, `availabilities`. Middleware §11 gains the subdomain → tenant resolution in §3 above. Every API handler calls `scopeToTenant` first. |
| `ADMIN_HANDOFF.md` | `scopeToAdmin` now also filters by `tenant_id` (derived from the subdomain), not just the user's org memberships. All 7 admin screens are implicitly tenant-scoped — no UI change, but every query gets the tenant filter. |
| `WORKER_HANDOFF.md` | `workerSession` resolves within the current tenant subdomain. A worker on two tenants uses two subdomains. Push notifications include `tenantId` so deep links open the right workspace. |
| `NETWORK_HANDOFF.md` | **Superseded in framing**: the "APF / network admin" is now the **tenant admin**. Screens stay; "read-only" becomes "your workspace"; add the org/invite actions in §7. The cross-network concerns in its §9 are now handled by tenant isolation here. |
| `MARKETING_HANDOFF.md` | Add a "Start a network" path later if you want self-serve; for v1 the demo CTA leads to an operator-sent invite. Unchanged otherwise. |

---

## 10 · Migration from the current single-tenant build

If anything is already built single-tenant:

1. Create one `tenants` row (`slug='reseau-qc'`) and backfill `tenant_id` on every existing row to point at it.
2. Move existing network-admin users into `tenant_memberships` as `tenant_admin`.
3. Add the `platform_operators` table; insert the StaffiG founder.
4. Turn on RLS table-by-table, testing each with a two-tenant fixture.
5. Flip routing to subdomain; keep a path fallback for preview envs.

A two-tenant seed (`reseau-qc` + `fcpe-mtl`, each with its own orgs/subs/requests) is the single most valuable test fixture — every isolation bug shows up the moment data from one bleeds into the other.

---

## 11 · The isolation acceptance test (the one that matters)

1. Seed two tenants: `reseau-qc` and `fcpe-mtl`, each with orgs, coordinators, substitutes, requests.
2. Sign in as a `reseau-qc` coordinator at `reseau-qc.staffig.ca` → see only Réseau Québec data.
3. Manually change the URL to `fcpe-mtl.staffig.ca` → redirected to `/not-invited?reason=wrong-tenant`.
4. A substitute who belongs to **both** tenants logs into each subdomain → sees only that tenant's requests in each.
5. Operator at `os.staffig.ca` sees both tenants' counts but cannot open a single worker or shift.
6. Direct DB query with RLS on and `app.tenant_id` set to `reseau-qc` → returns zero `fcpe-mtl` rows even with a `WHERE`-less SELECT.

If all 6 pass, the multi-tenant boundary holds and StaffiG is safe to onboard a second customer.

---

That's the multi-tenancy spec. One tenant table, `tenant_id` everywhere, RLS as the seatbelt, subdomain routing, a platform tier that invites tenants and a wizard that onboards them — and a hard isolation guarantee tested with two tenants.
