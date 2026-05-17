# StaffiG — Network Admin (APF) Handoff

A self-contained brief for the **network oversight surface** of StaffiG. Pair with `HANDOFF.md` for the underlying product context (auth, DB, stack). Visual system is shared.

---

## 0 · What APF is, and what it isn't

**APF** = "Agence Provinciale / Affiliation Provinciale" — the layer above individual organizations. It exists because in Quebec, a single body (a CPE network, a foundation, a healthcare authority) often oversees many care organizations and needs visibility across all of them without taking dispatch responsibility away from each org's coordinator.

**APF is:**
- A read-only window into every affiliated organization.
- A way to spot patterns: shortage cities, high-cancellation orgs, declining fill rates.
- An audit trail for compliance and quarterly board reports.
- A surface for network-level recruitment: see where substitutes are thin, push invites.

**APF is NOT:**
- A dispatch console. APF users cannot create requests, assign workers, or cancel shifts. That's the coordinator's job in their own org.
- A place where workers ever land. Workers see their own org affiliations only — they don't know "the network" exists in their UI.
- A separate product. It's a role inside StaffiG with elevated read scope.

This boundary is enforced at three layers: **role**, **route**, and **query**. All three must check.

---

## 1 · Domain model additions

`HANDOFF.md` §5 covers `users`, `organizations`, `memberships`, `requests`, `notifications`, `events`. APF adds three things:

```ts
// db/schema.ts — append to existing

export const networks = pgTable('networks', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),                            // "Réseau Québec", "Fondation CPE Montréal"
  region: text('region'),                                  // 'QC', 'mtl-metro', etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Which orgs belong to which network. An org CAN belong to multiple networks
// (e.g. a CPE in both a regional foundation and a provincial association).
export const networkOrganizations = pgTable('network_organizations', {
  networkId: uuid('network_id').notNull().references(() => networks.id),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  addedAt: timestamp('added_at').defaultNow().notNull(),
}, t => ({ pk: primaryKey({ columns: [t.networkId, t.organizationId] }) }));

// APF users are members of a network, not of an org. They get read scope across
// every org that's in `network_organizations` for their network.
export const networkMemberships = pgTable('network_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  networkId: uuid('network_id').notNull().references(() => networks.id),
  role: text('role').notNull(),                            // 'apf_admin' | 'apf_observer'
  status: text('status').notNull().default('active'),      // 'active' | 'removed'
  invitedAt: timestamp('invited_at').defaultNow(),
});
```

**Roles in `network_memberships`:**
- `apf_admin` — can invite substitutes to any org in the network, can mark orgs as added/removed from the network, can export data.
- `apf_observer` — read-only, no actions.

Both have full read access to dashboards and activity logs across affiliated orgs.

---

## 2 · The read-only contract

Every APF query goes through `scopeToNetwork(userId)`. Three guarantees:

1. **Scope.** Only data from orgs in `network_organizations` for this user's `networkId` is returned.
2. **No writes.** APF endpoints never write to `requests`, `notifications`, or `events` except for explicitly-allowed actions (invite a substitute, remove an org from the network — both logged to `events` with `actor_user_id` = the APF user).
3. **Audit.** Every APF read of identifiable substitute data is logged. Privacy compliance for Quebec Law 25 — APF users see who, where, when of any data access.

```ts
// lib/apf-scope.ts
export async function scopeToNetwork(userId: string) {
  const membership = await db.query.networkMemberships.findFirst({
    where: and(eq(networkMemberships.userId, userId), eq(networkMemberships.status, 'active')),
  });
  if (!membership) throw new ForbiddenError('Not an APF user');

  const orgIds = await db.select({ id: networkOrganizations.organizationId })
    .from(networkOrganizations)
    .where(eq(networkOrganizations.networkId, membership.networkId));

  return { networkId: membership.networkId, role: membership.role, orgIds: orgIds.map(o => o.id) };
}
```

Used by every APF endpoint. Drop it and the whole boundary collapses.

---

## 3 · The four queries that drive every screen

### 3.1 · Network snapshot KPIs

```sql
WITH window AS (SELECT now() - interval '30 days' AS since)
SELECT
  COUNT(*)                                    AS total_requests,
  COUNT(*) FILTER (WHERE status IN ('assigned','completed'))  AS filled,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('assigned','completed')) / NULLIF(COUNT(*), 0), 1) AS fill_rate,
  AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) FILTER (WHERE assigned_at IS NOT NULL) AS avg_minutes_to_fill,
  COUNT(*) FILTER (WHERE urgency = 'urgent')  AS same_day_urgent,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
  COUNT(*) FILTER (WHERE language_required = 'en' OR language_required = 'bilingual') AS bilingual_required
FROM requests, window
WHERE organization_id = ANY($1::uuid[])
  AND created_at > window.since;
```

That single query feeds the 6 hero cards on the network dashboard. Memoize for 60 seconds per network.

### 3.2 · Status breakdown (for the bars on the dashboard)

```sql
SELECT status, COUNT(*)
FROM requests
WHERE organization_id = ANY($1::uuid[])
GROUP BY status;
```

### 3.3 · Shortage cities

A city is "in shortage" when there are open requests but ≤ 1 substitute matching language + qualifications + availability.

```sql
WITH open_by_city AS (
  SELECT o.city, r.language_required, r.qualifications_required, COUNT(*) AS open_count
  FROM requests r JOIN organizations o ON o.id = r.organization_id
  WHERE r.status IN ('open','notified','responses_received')
    AND r.organization_id = ANY($1::uuid[])
  GROUP BY o.city, r.language_required, r.qualifications_required
),
matched AS (
  SELECT obc.city, obc.language_required, obc.open_count,
    (SELECT COUNT(*) FROM substitute_profiles p
       JOIN users u ON u.id = p.user_id
       WHERE obc.language_required = ANY(p.languages)
         AND obc.qualifications_required <@ p.qualifications
         AND p.home_city = obc.city
         AND has_availability_today(u.id)
    ) AS available_count
  FROM open_by_city obc
)
SELECT city, language_required, open_count, available_count
FROM matched
WHERE available_count <= 1
ORDER BY open_count DESC;
```

### 3.4 · Activity feed

Read straight from the existing `events` table — APF doesn't need its own log.

```sql
SELECT e.*, u.full_name AS actor_name, o.name AS org_name
FROM events e
LEFT JOIN users u ON u.id = e.actor_user_id
LEFT JOIN requests r ON r.id = e.request_id
LEFT JOIN organizations o ON o.id = r.organization_id
WHERE (r.organization_id = ANY($1::uuid[]) OR e.payload->>'network_id' = $2)
ORDER BY e.created_at DESC
LIMIT 100 OFFSET $3;
```

APF-originated actions (invite a sub to a network, remove an org from a network) write an event with `payload.network_id = $networkId` so they show up here without being tied to a specific org.

---

## 4 · API surface

All under `/api/apf/`. Every handler starts with `const scope = await scopeToNetwork(auth().userId);`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/apf/snapshot` | `{ kpis, statusBreakdown, shortageCities, orgActivity }` — feeds the dashboard in one round-trip |
| GET | `/api/apf/organizations` | `Organization[]` with `total / filled / open / fillRate` per org |
| GET | `/api/apf/organizations/:id` | drill-in: org-level metrics + recent requests |
| GET | `/api/apf/substitutes` | `Substitute[]` aggregated across the network — adds `orgCount`, `shiftsLast30d`, `reliability` |
| GET | `/api/apf/substitutes/:id` | per-substitute history across all orgs in scope |
| GET | `/api/apf/activity?cursor=...&kind=...&orgId=...` | paginated event feed |
| GET | `/api/apf/coordinators` | every coordinator across affiliated orgs (with which orgs they serve) |
| POST | `/api/apf/substitutes/invite` | `{ email, phone, roles[], languages[], cities[] }` — APF can invite a sub into multiple orgs at once. Writes one membership per org. |
| POST | `/api/apf/organizations/:id/remove` | removes the org from the network (not from StaffiG entirely). Writes an event. |
| GET | `/api/apf/export?range=...&format=csv\|pdf` | a quarterly board-ready report. Heavy — runs through Inngest, emails the link. |

### Explicit "not in scope" — DO NOT IMPLEMENT
- `POST /api/apf/requests/...` — no. APF can't create requests.
- `POST /api/apf/requests/:id/assign` — no. Coordinators assign.
- `PATCH /api/apf/users/...` — no. Users edit their own profile.

If a PM later asks for these, push back. The whole design assumes APF is read+invite-only.

---

## 5 · Routes

Lives at `apf.staffig.ca` (separate subdomain — different mental model, separate cache, easier access logging). Implementation-wise it's still the same Next.js app, distinguished by subdomain via middleware.

```
app/
├── (apf)/                              # rendered only when host = apf.staffig.ca
│   ├── layout.tsx                      # NetworkShell — dark sidebar + APF badge
│   ├── network/page.tsx                # NetworkDashboard
│   ├── organizations/page.tsx
│   ├── organizations/[id]/page.tsx
│   ├── coordinators/page.tsx
│   ├── substitutes/page.tsx            # NetworkPool
│   ├── substitutes/[id]/page.tsx
│   ├── activity/page.tsx               # NetworkActivity
│   └── export/page.tsx
```

Middleware rule: if `host` starts with `apf.`, require a `network_memberships` row with `status=active`; otherwise redirect to `/not-invited` (same page as product, different copy).

```ts
// middleware.ts (extends the one in HANDOFF.md §11)
if (req.headers.get('host')?.startsWith('apf.')) {
  const member = await getActiveNetworkMembership(userId);
  if (!member) return Response.redirect(new URL('/not-invited?reason=apf', req.url));
}
```

---

## 6 · Visual differentiation

Same design tokens as the rest of the product (`HANDOFF.md` §2). What changes:

| Element | Coordinator (admin) | APF |
|---|---|---|
| Sidebar | Light (`--paper`) | Dark (`--ink`) |
| Badge in sidebar | "Admin" — muted | "APF" — terra-outlined |
| Top-right indicator | Org name + city | Network name + org count |
| Primary action color | `--ink` | `--terra` (used sparingly — APF is mostly reading) |
| Read-only callout | absent | Persistent footer in sidebar: "APF observes — it doesn't dispatch." |

This signals at a glance "you are above, not inside" and reduces the chance an APF user assumes they can act on a row.

Reuse every other primitive: `Chip`, `Card`, `Eyebrow`, KPI cards, sortable table layout. Don't fork a parallel design system.

---

## 7 · Screen-by-screen build spec

### 7.1 · `/network` — NetworkDashboard

**Calls**: `GET /api/apf/snapshot` (one round-trip).

**Sections, top to bottom:**
1. Eyebrow + serif headline `"14 organisations. One pulse."` (number is dynamic).
2. **Hero KPI row** — 4 cards, first one (Fill rate) is dark + larger.
   - Fill rate (`%`, trend vs previous 30d)
   - Avg time to fill (`min`)
   - Active substitutes
   - Unfilled right now (rose tone if > 0)
3. **Secondary KPI row** — 4 smaller cards: Total requests MTD, Same-day urgent, Cancellations, Bilingual placements.
4. **Status breakdown** (1.4fr) + **Shortage cities** (1fr).
   - Status: horizontal bar per status, colored, with count + percentage.
   - Shortage: rose-soft background, one card per city with open/available/lang.
5. **Organizations table** — sortable by total / filled / open / fill rate. Color-coded fill-rate bar (moss ≥ 85, sand 75-84, rose < 75). Row click → `/organizations/:id`.

**Auto-refresh**: SSE channel `network:{networkId}` pushes deltas. Refresh KPIs every 60s in fallback.

### 7.2 · `/activity` — NetworkActivity

**Calls**: `GET /api/apf/activity?cursor=`.

- Filter chips: All / Assigned / Cancelled / Escalated / Invitations / Removals. Counts per type.
- Grouped by day (Today / Yesterday / "23 May" / etc.).
- Each row: time (mono) · square colored icon · "**Actor** *action* **target**" — second line: actor role + meta (time-to-fill, decline reason, etc.).
- Pagination: "Load older →" button at the bottom; cursor-based.
- "Export" button → triggers `/api/apf/export` (Inngest job, emails CSV link).

### 7.3 · `/substitutes` — NetworkPool

**Calls**: `GET /api/apf/substitutes`.

- Editorial headline with the count: `"248 substitutes cover the province"`.
- **Distribution by city** card — one bar per city, segment for available vs total. Coverage bars use the same color logic as fill rate (moss / sand / rose).
- **KPI bento** (right): Total in pool, Available now, Multi-org % (subs working for ≥ 2 orgs — network resilience metric), Avg reliability. Plus a sand-tinted "Network risk" callout when shortage cities ≥ 1.
- **Top contributors table**: name, role, city, # orgs, shifts last 30d, languages (as mono pills), reliability bar. Sort by any column.
- Bulk-invite CTA top-right — opens a modal with email/phone/role/languages/cities multi-select, posts to `/api/apf/substitutes/invite`.

### 7.4 · `/organizations` — list with `total/filled/open/fillRate` per row. Each row links to its drill-in.

### 7.5 · `/organizations/:id` — same chrome but scoped to one org: same KPIs but org-level, plus recent requests list. Links into the activity feed pre-filtered to that org.

### 7.6 · `/coordinators` — list of every coordinator across affiliated orgs. Useful for the APF admin to confirm there's a human at every org. Columns: name, org(s), last active, requests posted last 30d.

### 7.7 · `/export` — a single-page form (date range, orgs, format). Submits to `/api/apf/export`, shows pending state, emails the link when ready (5-30 min job).

---

## 8 · Reliability score (used in §7.3)

```
reliability = (accepted_shifts + completed_shifts) / notifications_viewed_within_60min
```

Window: last 90 days. Floor at 0, cap at 100. Compute it nightly per substitute (don't recalc on every page load).

This number lives on `substitute_profiles.reliability` and is the column that drives the "ranked by reliability" sort on the network pool. The eligibility-match score for dispatch (`HANDOFF.md` §6) is separate — that's a per-request computation; reliability is a per-substitute property.

---

## 9 · Multi-network considerations

A real org may belong to >1 network. A real substitute serves multiple orgs and is visible to whichever networks contain those orgs.

When an APF admin views a substitute, show them only the org affiliations within their own network — never reveal other networks the sub belongs to. Same for an org showing up in multiple networks: each network sees only its own request history for that org.

This is enforced by `scopeToNetwork` returning `orgIds` and every query filtering on it.

---

## 10 · Privacy, Quebec Law 25 specifics

APF users see personally-identifiable substitute data (full name, city, work history). That triggers Law 25 requirements:

- **Consent**: workers tick a box at onboarding: *"I consent to my profile being visible to the network coordinators of the organizations that have invited me."* — opt-out hides them from APF entirely (workers can still take shifts; APF just sees an anonymized count).
- **Right to access**: workers can request a copy of "everything APF has seen about me" — exposes the audit log of APF reads on their profile.
- **Retention**: a worker who hasn't accepted a shift in 12 months drops out of the APF substitute pool view (still in DB).
- **Logging APF reads**: every `GET /api/apf/substitutes/:id` and every `GET /api/apf/activity` writes a `data_access_log` row. Cheap append-only table, never deleted.

```ts
export const dataAccessLog = pgTable('data_access_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorUserId: uuid('actor_user_id').notNull(),
  subjectUserId: uuid('subject_user_id'),                  // null for aggregate views
  endpoint: text('endpoint').notNull(),
  reason: text('reason'),                                  // optional, sometimes required
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

---

## 11 · Component port map

From the prototype in `src/network.jsx`:

| Mockup component | Real Next.js location | Notes |
|---|---|---|
| `NetworkShell` | `components/apf/NetworkShell.tsx` | Dark sidebar. Different from `AdminShell` despite the visual similarity — different nav, different badge. |
| `NetworkDashboard` | `app/(apf)/network/page.tsx` | Server Component. Hydrates the KPIs from `/api/apf/snapshot`. |
| `Kpi`, `KpiHero` | `components/apf/Kpi.tsx` | Two variants of the same primitive; refactor before porting. |
| `NetworkActivity` | `app/(apf)/activity/page.tsx` | Client Component for filter state; uses Suspense + streaming for the list. |
| `NetworkPool` | `app/(apf)/substitutes/page.tsx` | Distribution chart can be plain CSS bars (no chart lib needed). |
| `kindStyle` map | `lib/apf-event-styles.ts` | Keep the mapping pure data. |

The icon set (`I.Activity`, `I.Shield`, etc.) → swap for `lucide-react` per the main handoff.

---

## 12 · Build order (2 weeks after core product)

| Day | Deliverable |
|---|---|
| 1 | DB migration: `networks`, `network_organizations`, `network_memberships`, `data_access_log`. Seed one test network with 3 orgs. |
| 2 | `scopeToNetwork` helper + middleware subdomain rule. `/not-invited?reason=apf` variant. |
| 3 | `GET /api/apf/snapshot` + memoization. |
| 4 | NetworkDashboard page wired to real data. SSE channel for live updates. |
| 5 | `GET /api/apf/organizations` + `/organizations` + `/organizations/:id` drill-in. |
| 6 | `GET /api/apf/activity` + page with filters + cursor pagination. |
| 7 | `GET /api/apf/substitutes` + reliability score nightly cron. |
| 8 | NetworkPool page + the bulk-invite modal + `POST /api/apf/substitutes/invite`. |
| 9 | `/coordinators` + `/export` form + Inngest export job. |
| 10 | Data access logging on every PII read; Law-25 consent toggle in worker onboarding; QA pass. |

---

## 13 · What NOT to build for APF v1

- **A map.** A coverage map of substitutes vs requests is tempting but adds Mapbox cost for what a list already shows. Skip until you have ≥ 3 networks asking for it.
- **Predictive analytics** ("you'll be short 4 educators next Tuesday"). Cool, premature.
- **Direct messaging between APF and substitutes.** That would short-circuit the coordinator — exactly the boundary APF is supposed to respect.
- **Cross-network reports.** A worker might be in two networks; each network sees only its own scope, period.

---

## 14 · Acceptance test

1. APF admin Patricia signs in at `apf.staffig.ca`.
2. NetworkDashboard renders in < 800 ms with real KPIs across 14 orgs.
3. She spots Longueuil in the shortage cities card. She clicks → drill-in shows 5 open educator requests but 0 available French substitutes.
4. She opens `/substitutes` → bulk-invite → enters 3 emails, picks educator + French + Longueuil → submit. 3 invitations sent, 3 events logged.
5. She opens `/activity` → filters to "Invitations" → sees her own 3 invites at the top, then earlier events.
6. She clicks Export → fills the modal → confirmation that the report will be emailed.
7. She tries to POST to `/api/apf/requests` from devtools → 403 Forbidden.

If 1–7 pass, the APF surface is shippable.

---

That's the whole network admin spec. Hand this together with `HANDOFF.md` to anyone building the APF surface.
