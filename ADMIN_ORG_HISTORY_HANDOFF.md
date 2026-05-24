# StaffiG — Admin Coordinator Handoff

Self-contained implementation brief for the coordinator-level admin screens:
- **`/admin/requests`** — the requests index (every shift across the coordinator's sites)
- **`/admin/organizations`** — manage one or more sites the coordinator runs
- **`/admin/activity`** — full audit history across all sites in that admin's scope

Pair with `HANDOFF.md` for the foundational stack, design tokens, auth model. This doc focuses on what's *unique* to these three screens.

> Scope clarifier: "Admin" here means **org-level coordinator** (one or many sites within a parent organization). It is **not** the network admin (APF) — that's `NETWORK_HANDOFF.md`. The visual sidebar is light (`--paper`), not dark.

---

## 1 · Domain model — multi-site coordinators

In Quebec, a single CPE or care organization commonly operates several physical sites ("installations"). A coordinator may manage 1, 3, or 8 of them. The data model already supports this via `organizations` + `memberships`, but two refinements help:

```ts
// db/schema.ts — additions on top of HANDOFF.md §5

export const organizations = pgTable('organizations', {
  // ... existing fields from HANDOFF.md
  parentOrganizationId: uuid('parent_organization_id').references(() => organizations.id),
  // self-referential — a "site" rows up to a "parent CPE" row.
  // null parentId means this row IS the parent (or a stand-alone org).
  capacity: integer('capacity'),
  enrolledCount: integer('enrolled_count'),
  hoursLabel: text('hours_label'),                         // "Lun–Ven · 07:00 → 18:00"
});

// memberships already lets one user belong to N orgs.
// For a coordinator running 3 sites, that's 3 membership rows with role='coordinator'.
```

**The "scope" rule for admin queries:**

```ts
// lib/admin-scope.ts
export async function scopeToAdmin(userId: string) {
  const rows = await db.select({ orgId: memberships.organizationId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId),
               eq(memberships.status, 'active'),
               inArray(memberships.role, ['admin', 'coordinator'])));
  if (!rows.length) throw new ForbiddenError('Not a coordinator');
  return { orgIds: rows.map(r => r.orgId), roles: rows };
}
```

Every admin endpoint pipes through this. The screen-specific queries below all filter by `WHERE organization_id = ANY(scope.orgIds)`.

---

## 2 · Screen 1 · `/admin/organizations`

### 2.1 · Purpose

The coordinator's home for the **physical reality** of the sites they run: how many kids enrolled, who the other coordinators are, what hours, what fill rate per site. NOT a settings page disguised as a list — actionable, with KPIs per site.

### 2.2 · Layout

Split-pane, 1.2fr (left list) / 1.5fr (right detail). The left rail persists; the right pane swaps on selection.

**Left rail — site list:**
- Heading: `"Three locations"` (count is dynamic, serif italic on "locations").
- "+ Add site" ghost button.
- One card per site, click to select. Selected card flips to dark (`--ink` bg) with terracotta left border accent — same visual idiom as the worker inbox's urgent card.
- Each card shows: 42×42 colored tile with 3-letter site code (e.g. "PLA"), site name, city + type, and three mini-stats: **Enrolled** (`62/64`), **Fill 30d** (`88%`, color-coded), **Requests** (`24`).

**Right pane — site detail (4 stacked blocks):**

1. **Header card** — name, address, eyebrow with site language, Edit + New Request buttons. 4 KPI tiles in a row: Fill rate (color-coded), Requests/30d, Filled/30d, Enrollment.
2. **Two-column** — Site details (Type, Hours, Phone, Language, Capacity, Enrolled) | Coordinators (avatar list + invite link) + tiny "Roster today" line.
3. **Recent activity preview** — last 3 events at this site with a "Open activity log →" deep link that pre-filters `/admin/activity` to this site.

### 2.3 · Data

**Endpoint:**

```
GET /api/admin/organizations
→ Array<{
    id, name, type, city, address, capacity, enrolledCount,
    lang, hours, contactPhone, isActive,
    metrics: { fillRate30d, requests30d, filled30d, openRequests },
    coordinators: Array<{ id, name, role }>,
    rosterToday: { onSite: number, substitutesArriving: number },
  }>
```

**SQL for `metrics`:**

```sql
SELECT
  o.id,
  COUNT(r.*) FILTER (WHERE r.created_at > now() - interval '30 days') AS requests_30d,
  COUNT(r.*) FILTER (
    WHERE r.created_at > now() - interval '30 days'
      AND r.status IN ('assigned','completed')
  ) AS filled_30d,
  ROUND(100.0 *
    COUNT(r.*) FILTER (WHERE r.created_at > now() - interval '30 days' AND r.status IN ('assigned','completed'))
    / NULLIF(COUNT(r.*) FILTER (WHERE r.created_at > now() - interval '30 days'), 0), 0
  ) AS fill_rate_30d,
  COUNT(r.*) FILTER (WHERE r.status IN ('open','notified','responses_received')) AS open_requests
FROM organizations o
LEFT JOIN requests r ON r.organization_id = o.id
WHERE o.id = ANY($1::uuid[])
GROUP BY o.id;
```

Memoize for 60 s per `orgIds` set — these numbers move slowly.

**Endpoint for editing:**

```
PATCH /api/admin/organizations/:id
Body: Partial<{ name, address, hoursLabel, contactPhone, lang, capacity }>
→ Updated org. Writes an event with kind='org.updated'.
```

Permission check: the caller must have a `coordinator` or `admin` membership for this specific org.

### 2.4 · Component port map

From `src/admin-extra.jsx`:

| Mockup | Real |
|---|---|
| `AdminOrganizations` | `app/(admin)/admin/organizations/page.tsx` (Server Component fetches, Client Component handles selection state) |
| `OrganizationDetail` | `components/admin/OrganizationDetail.tsx` |
| `MiniStat`, `KpiOrg`, `Row` | extract into `components/admin/SiteStats.tsx` — used by both this screen and the dashboard |

### 2.5 · Edge cases

- **Single-site coordinator**: hide the left rail entirely; render detail full-width with a back-link to dashboard. Don't render an empty list.
- **No sites**: shouldn't happen (middleware blocks via `/not-invited`). If it does, render a single editorial card: *"You haven't been added to a site yet. Ask your network admin."*
- **Inactive site**: a site can be soft-deactivated (`isActive=false`). Render with reduced opacity + "Inactive" chip; no New Request button.

### 2.6 · Acceptance test

1. Coordinator with 3 sites loads the page in < 600 ms.
2. Default selection is their highest-volume site (by `requests30d`).
3. Click a different site → right pane swaps instantly (state is client-side; no fetch).
4. Click "+ New request" on the selected site → routes to `/admin/requests/new?orgId=...` with that site preselected.
5. Click "Edit" → opens a modal with fields from §2.3; save → optimistic update + PATCH succeeds.
6. Click "Open activity log →" → routes to `/admin/activity?siteId=...`.

---

## 3 · Screen 2 · `/admin/activity`

### 3.1 · Purpose

The full audit timeline across every site the coordinator manages. For quarterly reports, compliance, and "what happened on Thursday?" investigations.

### 3.2 · Layout

1. **Header** — serif headline (`"Every move, logged."`), subtitle (read-only for accountability), date-range + site filter buttons, Export CSV.
2. **KPI strip** — 5 derived cards: Requests posted, Filled (with rate), Cancelled, Expired, Avg time-to-fill (with delta).
3. **Filter chips** — All / Posted / Assigned / Completed / Cancelled / Expired / Declined / Invitations. Counts shown next to each label.
4. **Event stream** — grouped by day, each row: time (mono), 28×28 colored icon tile, "**Actor** *verb* **target**" line + meta sub-line, **site chip**, **kind chip**.
5. **Pagination** — "Load older →" cursor-based.

### 3.3 · Data

This is the **same `events` table** as APF activity (`NETWORK_HANDOFF.md` §3.4), just scoped differently — to `scope.orgIds` from §1, not to a whole network. So the query is essentially:

```sql
SELECT
  e.id, e.kind, e.created_at, e.payload,
  u.full_name AS actor_name,
  r.public_id AS request_public_id, r.role AS request_role, r.starts_at,
  o.id AS site_id, o.name AS site_name
FROM events e
LEFT JOIN users u ON u.id = e.actor_user_id
LEFT JOIN requests r ON r.id = e.request_id
LEFT JOIN organizations o ON o.id = COALESCE(r.organization_id, (e.payload->>'organization_id')::uuid)
WHERE o.id = ANY($1::uuid[])
  AND e.created_at > $2                              -- date range start
  AND ($3::text IS NULL OR e.kind = $3)              -- optional kind filter
  AND ($4::uuid IS NULL OR o.id = $4)                -- optional site filter
ORDER BY e.created_at DESC
LIMIT 50 OFFSET $5;
```

**Endpoints:**

```
GET /api/admin/activity?
  kind=accepted|declined|assigned|completed|cancelled|expired|invited|posted|all
  &siteId=<uuid>           # optional, defaults to all sites in scope
  &from=2026-04-23&to=2026-05-23
  &cursor=<base64>         # cursor pagination
→ {
    events: Event[],
    nextCursor: string | null,
    kpis: { posted, filled, cancelled, expired, avgTimeToFillMinutes, fillRate },
    facetCounts: { posted: 53, assigned: 46, ... }  // for the filter chips
  }

GET /api/admin/activity/export?format=csv&from=...&to=...&siteId=...
→ Inngest job. Emails a download link when ready (~30 s for typical ranges).
```

KPIs and facet counts are computed in the same query batch — don't make the client fire 9 requests.

### 3.4 · Event "kinds" — taxonomy

Already defined by the existing `events` table. The admin activity screen uses this fixed set, each with its color/icon mapping:

| kind | icon | tone | label |
|---|---|---|---|
| `request.posted` | `+` | terra | Posted |
| `response.accepted` | check | moss | Accepted |
| `response.declined` | × | rose | Declined |
| `request.assigned` | check | moss | Assigned |
| `request.completed` | check | moss | Completed |
| `request.cancelled` | × | rose | Cancelled |
| `request.expired` | clock | grey | Expired |
| `user.invited` | user | sand | Invited |

The mapping lives in `lib/event-styles.ts` and is **shared** with `NETWORK_HANDOFF.md` §11. Single source of truth.

### 3.5 · Edge cases & rules

- **System actor**: if `actor_user_id` is null (escalations, expirations), render `actor_name = "system"` in a muted style.
- **Cross-site multi-event request**: a single `REQ-2041` can have many events. They appear chronologically, each its own row — no nesting.
- **Cancelled with reason**: if `payload.reason` exists, render in the meta line: `"Reason: client recovered"`. Use rose color for reason text.
- **Pagination**: cursor is `base64(createdAt + '|' + id)` — descending by createdAt, then by id as tiebreaker.
- **Filter state in URL**: `kind`, `siteId`, `from`, `to` belong in the URL as searchParams so links to filtered views work.

### 3.6 · Permissions

- `coordinator` role: sees events for sites they are a member of.
- `admin` role (parent-org admin): sees events across all child sites of their parent org.
- Neither role can **mutate** events. The screen is read-only by design.

### 3.7 · Privacy (Law 25)

Same considerations as `NETWORK_HANDOFF.md` §10 but scoped:
- Admin reading another user's activity → write a `data_access_log` row.
- Admin exporting CSV → write `data_access_log` with `endpoint='activity.export'` and the date range as `reason`.

### 3.8 · Performance budget

- Initial render with 50 events: < 700 ms.
- Filter change: optimistic — keep the existing list visible, dim it, fetch in background, swap. No spinner.
- Date-range change: same.
- Export CSV: shows immediate "Queued — we'll email you" toast; backend processes async.

### 3.9 · Acceptance test

1. Coordinator loads `/admin/activity` — sees 50 most recent events grouped by date, KPI strip populated.
2. Clicks "Cancelled" chip → URL becomes `?kind=cancelled`, list filters, KPI strip stays but the chip counts dim others.
3. Clicks a request's link in an event row → navigates to `/admin/requests/REQ-2041`.
4. Changes date range to "last 7 days" → list + KPIs + facet counts all update in one fetch.
5. Clicks "Export CSV" → toast: *"We'll email the export to sylvie@cpe.ca within a minute."* No download, no blocking modal.
6. Reload the page with `?kind=accepted&siteId=plateau` → state restores exactly.

---

## 4 · Screen 3 · `/admin/requests`

### 4.1 · Purpose

The **requests index** — the coordinator's working list of every open and recent shift across their sites. This is where they land when they click "Requests" in the sidebar. Unlike `/admin/activity` (which is read-only history), this screen exists to **trigger the next action**: assign a top-match candidate, view a request in progress, or kick off a new one.

Where the Dashboard surfaces *one* urgent item, the Requests index shows *all* of them, in a triage-friendly list.

### 4.2 · Layout

1. **Header** — serif headline that's dynamic (`"3 requests need your eyes"`), with subtitle calling out the urgency mix, plus a `Search` icon button and the primary `+ New request` CTA.
2. **Toolbar row** — two parts:
   - Left: tabs (`Live` / `Assigned` / `All`) with counts.
   - Right: site filter pills (`All sites` / per-site), then a `More` filter button (urgency, language, qualification, date range).
3. **Request rows** — each row is a 5-column grid:
   - `ID + urgent badge + posted time` (compact left meta)
   - `Role + time range (mono) + chips for site/lang/quals`
   - `Status chip + progress sub-line`
   - `Top match avatar OR assigned worker OR "Notifying…" placeholder`
   - Context-aware action button (`Assign` / `View` / `Details`) + overflow menu
   Urgent rows get the terracotta left border.
4. **Empty state** — serif headline (`"Nothing to see here."`) when filters return zero rows.
5. **Footer** — result count + `Load older →` cursor pagination.

### 4.3 · Data

**Endpoint:**

```
GET /api/admin/requests?
  status=active|assigned|all      # tab
  &siteId=<uuid>                  # optional, defaults to all sites in scope
  &urgency=urgent|planned|all     # optional
  &language=fr|en|bilingual|all   # optional
  &cursor=<base64>                # cursor pagination, 25 per page
→ {
    requests: AdminRequestSummary[],
    counts: { active, assigned, all },
    facetCounts: { byUrgency, bySite, byLanguage, byStatus },
    nextCursor: string | null,
  }
```

Where `AdminRequestSummary`:

```ts
type AdminRequestSummary = {
  id: uuid;
  publicId: string;                              // 'REQ-2041'
  urgent: boolean;
  status: 'open' | 'notified' | 'responses_received' | 'assigned';
  role: string;                                  // 'Educator'
  site: { id: uuid; name: string };              // 'Plateau'
  startsAt: ISODate;
  endsAt: ISODate;
  durationLabel: string;                         // '7h'
  languageRequired: 'fr' | 'en' | 'bilingual';
  qualificationsRequired: string[];
  metrics: {
    notified: number;
    viewed: number;
    accepted: number;
    declined: number;
    responses: number;                           // accepted + declined
  };
  postedAt: ISODate;
  postedLabel: string;                           // '3 min ago'
  topMatch?: { userId, name, matchScore };       // only when status='responses_received'
  assignedWorker?: { userId, name };             // only when status='assigned'
};
```

**SQL** (returns up to 25 rows + nextCursor):

```sql
SELECT
  r.id, r.public_id, r.role, r.starts_at, r.ends_at, r.status,
  r.urgency = 'urgent' AS urgent,
  r.language_required, r.qualifications_required, r.created_at,
  o.id AS site_id, o.name AS site_name,
  COUNT(n.*) AS notified,
  COUNT(n.*) FILTER (WHERE n.viewed_at IS NOT NULL) AS viewed,
  COUNT(n.*) FILTER (WHERE n.response = 'accepted') AS accepted,
  COUNT(n.*) FILTER (WHERE n.response = 'declined') AS declined,
  -- top match: best-scoring unassigned acceptor
  (SELECT json_build_object('userId', u.id, 'name', u.full_name, 'matchScore', n2.match_score)
     FROM notifications n2 JOIN users u ON u.id = n2.user_id
     WHERE n2.request_id = r.id AND n2.response = 'accepted'
     ORDER BY n2.match_score DESC LIMIT 1
  ) AS top_match,
  -- assigned worker (when status = 'assigned')
  (SELECT json_build_object('userId', au.id, 'name', au.full_name)
     FROM users au WHERE au.id = r.assigned_user_id
  ) AS assigned_worker
FROM requests r
JOIN organizations o ON o.id = r.organization_id
LEFT JOIN notifications n ON n.request_id = r.id
WHERE r.organization_id = ANY($1::uuid[])
  AND ($2::text IS NULL OR r.status = ANY(STATUS_FOR_TAB($2)))
  AND ($3::uuid IS NULL OR r.organization_id = $3)
  AND r.created_at > now() - interval '7 days'
GROUP BY r.id, o.id
ORDER BY
  CASE WHEN r.urgency = 'urgent' AND r.status != 'assigned' THEN 0 ELSE 1 END,
  r.starts_at ASC
LIMIT 25;
```

Where `STATUS_FOR_TAB`:
- `'active'` → `['open','notified','responses_received']`
- `'assigned'` → `['assigned']`
- `'all'` → every status

**Action endpoints** (already in `HANDOFF.md` §8, listed here for cross-reference):

| Action button | Calls |
|---|---|
| `+ New request` | navigates to `/admin/requests/new` |
| `Assign` (row action when `topMatch` present) | `POST /api/admin/requests/:id/assign` with `{ userId: topMatch.userId }` |
| `View` / `Details` (row action) | navigates to `/admin/requests/:id` (the Workflow screen) |
| Overflow · `Cancel` | `POST /api/admin/requests/:id/cancel` |
| Overflow · `Duplicate` | `POST /api/admin/requests` with the source request as draft |
| Overflow · `Notify more` | `POST /api/admin/requests/:id/notify-more` (widens the candidate pool) |

### 4.4 · Sort & priority rules

The `ORDER BY` clause above encodes the triage logic:

1. **Urgent + unassigned first** (an urgent request needing action sits at the top, always).
2. **Then by `starts_at` ascending** (the next shift to happen sits above later ones).

Do not let the user reorder columns in v1 — the order *is* the prioritization. A future v2 can add manual sort if coordinators ask.

### 4.5 · Realtime updates

The Requests index subscribes to the same `request:<publicId>` Pusher channels as the Dashboard activity feed. When a `response.accepted` event arrives for a request currently visible in the list:

1. Bump the `accepted` count.
2. If the row's status was `notified`, flip it to `responses_received` and re-sort.
3. If a new `topMatch` is computed, swap the avatar block.

All without a refetch. A row mid-update gets a soft flash (`box-shadow` pulse over 600 ms) so the coordinator notices.

### 4.6 · Component port map

From `src/admin-extra.jsx`:

| Mockup | Real |
|---|---|
| `AdminRequestsList` | `app/(admin)/admin/requests/page.tsx` (Server Component for initial render, Client Component for filters + realtime) |
| `RequestListRow` | `components/admin/RequestListRow.tsx` |
| Tab strip | reuse `components/ui/Tabs.tsx` from the worker inbox |
| Filter pills | reuse `components/ui/FilterChips.tsx` (the same one used by Activity §3.4) |

### 4.7 · Edge cases

- **Zero matches against filters** → render the empty state described in §4.2 step 4. Don't render a spinner if the result is just empty.
- **No sites in scope** → same handling as the Organizations screen (`/not-invited` redirect via middleware).
- **Assigning the top match fails** (race condition: someone already assigned, or the worker withdrew) → toast in the rose tone, the row re-fetches itself, the button returns.
- **Status changes between fetch and render** (e.g. a coordinator at another site assigned it first while you're loading) → the row arrives in `assigned` status with the assigned worker block already populated. No special-casing needed.

### 4.8 · Permissions

- `coordinator` role: sees requests for sites in their `memberships`.
- `admin` role (parent-org admin): sees requests across all child sites.
- Both can **assign** workers to any request in scope.
- Both can **cancel** their own org's requests.
- Neither can see, assign, or cancel requests from sites outside their scope.

### 4.9 · Performance budget

- Initial render with 25 rows: < 600 ms cold, < 200 ms cached.
- Filter change: optimistic (dim, swap on arrival).
- Realtime update: < 50 ms from Pusher event to visual change.

### 4.10 · Acceptance test

1. Coordinator loads `/admin/requests` — sees 25 rows, urgent ones at the top, sorted by `starts_at`.
2. Clicks `Assigned` tab — list filters to status='assigned' only; URL becomes `?status=assigned`.
3. Clicks the `Plateau` site pill — list filters further; tab counts persist.
4. A `response.accepted` event arrives for `REQ-2041` — the row's counts bump and the row briefly flashes; no refetch.
5. Clicks `Assign` on `REQ-2041` (top match present) — row converts to status='assigned' optimistically; on server confirm, the new assigned-worker block locks in.
6. Tries to view a request from a CPE outside their scope (manually editing the URL) — 403 Forbidden.

---

## 5 · Shared pieces across the three screens

Avoid duplication. All three screens reuse these:

| Primitive | Used by | Source |
|---|---|---|
| `AdminShell` | All three, + dashboard, + create, + workflow, + directory | `components/admin/AdminShell.tsx` |
| KPI tile (`Kpi`, `KpiOrg`) | Organizations + Activity | `components/admin/Kpi.tsx` — two density variants |
| Event icon mapping | Activity + APF activity + Dashboard activity feed | `lib/event-styles.ts` |
| Site chip | Activity + Requests + Organizations | `components/admin/SiteChip.tsx` |
| Date-range picker | Activity + Export form | `components/ui/DateRangePicker.tsx` |
| Filter chip row | Activity + Requests + APF activity + Dashboard | `components/ui/FilterChips.tsx` |
| Tab strip | Requests + worker inbox | `components/ui/Tabs.tsx` |
| `RequestListRow` | Requests + Dashboard "Live requests" panel | `components/admin/RequestListRow.tsx` (use a `compact` prop on the dashboard) |

If you find yourself writing a similar component twice, stop and lift it. The product/admin/APF surfaces should look like siblings, not strangers.

---

## 6 · Build order (4 days)

| Day | Deliverable |
|---|---|
| 1 | DB migration adding `parentOrganizationId`, `capacity`, `enrolledCount`, `hoursLabel`. `scopeToAdmin` helper. `GET /api/admin/organizations` with the metrics SQL. Site list + detail UI wired (no edit modal yet). |
| 2 | `PATCH /api/admin/organizations/:id` + edit modal. `GET /api/admin/activity` with facet counts + KPIs in one query. Activity screen UI rendered, filters working as URL state. |
| 3 | `GET /api/admin/requests` with `STATUS_FOR_TAB` logic and the top-match subquery. Requests index UI + tabs + site pills wired. Inline `Assign` action calling the existing assign endpoint. |
| 4 | Cursor pagination on Activity + Requests. Pusher realtime on Requests rows. `data_access_log` writes on PII reads. CSV export via Inngest. Permission tests (coordinator can't see other CPEs' events). Playwright E2E covering all three screens. |

---

## 7 · What NOT to build

- **A map** of site locations. The list does the job for ≤ 10 sites; we'll revisit at scale.
- **A per-event detail page**. The event row already shows enough; clicking links to the underlying request, not an event detail.
- **Threaded view** ("expand REQ-2041 to see all its events"). Too clever; the chronological stream is what people scan for.
- **Push notifications** for activity. The dashboard's live feed is for "right now"; the history page is for going back. Don't blur the two.
- **Comments on events**. If a coordinator wants to annotate a cancellation, that's a future feature; for v1, the audit log is immutable narration.

---

## 8 · Sample fixtures (for seeding & demo)

```ts
// seeds/admin-multi-site.ts
const cpeLesPetitsLutins = {
  name: 'CPE Les Petits Lutins',
  sites: [
    { code: 'PLA', name: 'Plateau', city: 'Plateau-Mont-Royal', address: '4231 rue Drolet', capacity: 64, enrolledCount: 62, hoursLabel: 'Lun–Ven · 07:00 → 18:00', lang: 'fr' },
    { code: 'VRD', name: 'Verdun', city: 'Verdun', address: '3105 rue Wellington', capacity: 48, enrolledCount: 44, hoursLabel: 'Lun–Ven · 07:00 → 18:00', lang: 'fr' },
    { code: 'HOC', name: 'Hochelaga', city: 'Hochelaga', address: '2100 rue Adam', capacity: 32, enrolledCount: 30, hoursLabel: 'Lun–Ven · 07:30 → 17:30', lang: 'fr' },
  ],
  coordinators: [
    { name: 'Sylvie Boivin', role: 'admin', sites: ['PLA','VRD','HOC'] },
    { name: 'Mireille Ho', role: 'coordinator', sites: ['PLA'] },
    { name: 'Annick Tremblay', role: 'coordinator', sites: ['VRD'] },
  ],
};
```

Seed 53 requests across the 3 sites in the last 30 days, with realistic distributions: ~87% filled, ~7% cancelled, ~6% expired. Drives the dashboard, the organizations metrics, and the activity history with one data set.

---

That's the spec. Two screens, shared primitives, one audit table, three days of work.
