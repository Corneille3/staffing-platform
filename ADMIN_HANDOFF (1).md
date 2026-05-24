# StaffiG — Admin Coordinator Handoff

Self-contained implementation brief for the **coordinator-level admin surface**. Covers exactly the 7 screens implemented in `Staffig.html` under the `Admin · desktop` section, and nothing else.

Pair with `HANDOFF.md` for the foundational stack, design tokens, auth model. This doc focuses on what's *unique* to admin.

> **Scope clarifier**: "Admin" here means **org-level coordinator** (one or many sites within a parent organization). Visual sidebar is light (`--paper`). Not to be confused with APF (the network-oversight surface — see `NETWORK_HANDOFF.md`).

---

## 0 · The 7 admin screens

| # | Path | Component (in `src/admin.jsx` or `src/admin-extra.jsx`) | Purpose |
|---|---|---|---|
| 1 | `/admin` (default) | `AdminDashboard` | Morning landing — surface the most urgent item + KPIs |
| 2 | `/admin/requests` | `AdminRequestsList` | Index of every live/recent request across sites |
| 3 | `/admin/requests/new` | `AdminCreateRequest` | 3-step form to post a new shift |
| 4 | `/admin/requests/[id]` | `AdminWorkflow` | Live workflow for one request: responses, assign |
| 5 | `/admin/substitutes` | `AdminDirectory` | Substitute pool, ranked against an open request |
| 6 | `/admin/organizations` | `AdminOrganizations` | Manage one or many sites under the coordinator's scope |
| 7 | `/admin/activity` | `AdminActivityHistory` | Full audit history across all sites |

All seven share the same `AdminShell` (left sidebar, top bar). All are rendered in a browser-window chrome at 1320×N inside the design canvas.

---

## 1 · Domain model — multi-site coordinators

In Quebec, a single CPE or care organization commonly operates several physical sites ("installations"). A coordinator may manage 1, 3, or 8 of them. Two refinements on top of `HANDOFF.md` §5:

```ts
// db/schema.ts — additions

export const organizations = pgTable('organizations', {
  // ... existing fields
  parentOrganizationId: uuid('parent_organization_id').references(() => organizations.id),
  // self-referential — a "site" rows up to a "parent CPE" row.
  // null parentId means this row IS the parent (or a stand-alone org).
  capacity: integer('capacity'),
  enrolledCount: integer('enrolled_count'),
  hoursLabel: text('hours_label'),                   // "Lun–Ven · 07:00 → 18:00"
});

// memberships already lets one user belong to N orgs.
// For a coordinator running 3 sites: 3 membership rows with role='coordinator'.
```

**The scope helper used by every admin endpoint:**

```ts
// lib/admin-scope.ts
export async function scopeToAdmin(userId: string) {
  const rows = await db.select({
      orgId: memberships.organizationId,
      role: memberships.role
    })
    .from(memberships)
    .where(and(
      eq(memberships.userId, userId),
      eq(memberships.status, 'active'),
      inArray(memberships.role, ['admin', 'coordinator'])
    ));
  if (!rows.length) throw new ForbiddenError('Not a coordinator');
  return { orgIds: rows.map(r => r.orgId), roles: rows };
}
```

Every admin SQL query filters with `WHERE organization_id = ANY(scope.orgIds)`.

---

## 2 · `AdminShell` — the chrome

One shell component used by all 7 screens. Defined once in `components/admin/AdminShell.tsx`.

**Structure:**
- Left sidebar (232px wide, `--paper` bg, `0.5px` right border):
  - Logo + "Staffig" + small "Admin" badge.
  - Org switcher (shows current site, dropdown to switch among sites in scope).
  - Nav items: Dashboard, Requests (with open-count badge), Substitutes, Organizations, Activity. Active item gets white card bg + terra-colored icon.
  - Bottom stat card: this week's fill rate.
- Top bar (right pane):
  - Breadcrumb + optional status chip.
  - Search, Bell, Avatar on the right.
- Main content fills the rest, scrollable.

The active sidebar item is passed as a prop (`active="requests"` etc.). The page also passes `page={{ crumb: "...", action?: <ReactNode> }}` for the top bar.

---

## 3 · Screen 1 · `/admin` — Dashboard (`AdminDashboard`)

### 3.1 · Purpose

The coordinator's morning surface. One screen that answers "do I need to worry right now?"

### 3.2 · Layout (top to bottom)

1. **Hero** — eyebrow ("Bonjour, Sylvie · 06:42"), serif headline that adapts to context (`"You have one urgent to settle."`), subtitle, primary `+ New request` CTA.
2. **Urgent-now card** — dark (`--ink` bg) heroized callout for the single most urgent unassigned request. Shows status chips, request title with serif italic time range, group/duration line, two CTAs (`Assign top match · 96%` terra primary; `See all 5 responses` ghost-on-dark), plus a 2×2 grid of compact stats (Responded, Accepted, Time elapsed, Shift starts).
3. **KPI strip** — 4 cards: Fill rate this week (with trend), Avg time-to-fill, Open right now, Substitutes ready.
4. **Two-up panel** — Left (1.5fr): "Live requests" — short list of all open requests, urgent row gets terra left border + tinted bg. Right (1fr): "Today" live activity feed with colored dot per event + LIVE indicator.
5. **Bottom row** — Left (1.3fr): "This week" — Mon→Sun bar chart of fill rate by day, today highlighted, color thresholds (moss / sand / rose). Right (1fr): "Working today" — roster of substitutes on site with check-in status.

### 3.3 · Data

```
GET /api/admin/dashboard
→ {
    coordinator: { firstName },
    urgentNow?: AdminRequestSummary & { topMatch, elapsed, startsIn },
    kpis: { fillRateWeek, fillRateDelta, avgTimeToFill, openCount, substitutesReady },
    liveRequests: AdminRequestSummary[],         // 4 most actionable, sorted
    activityToday: ActivityEvent[],              // last 5
    weekFillRate: number[],                      // Mon..Sun, 0 = no data
    rosterToday: Array<{ name, role, startsAt, endsAt, status: 'on_site'|'arriving'|'en_route' }>,
  }
```

One round-trip. Memoize the KPIs for 60s; everything else is fresh.

### 3.4 · Realtime

Subscribe to `admin:{orgId}` channels (one per site in scope). Events handled:
- `response.accepted` / `response.declined` → bump counts on `urgentNow` and the matching `liveRequests` row.
- `request.posted` → prepend to `liveRequests`, update `kpis.openCount`.
- `request.assigned` → flip the row, possibly clear `urgentNow`.
- `shift.checked_in` → flip a `rosterToday` entry from "Arriving" → "On site".

### 3.5 · Acceptance test

1. Coordinator loads `/admin` at 06:42 — sees the urgent-now card on screen within 600 ms.
2. Clicks `Assign top match · 96%` → optimistic update, urgent card transitions to a moss "assigned" state, then disappears as it's replaced by the next-most-urgent (or an empty congratulations state if there's none).
3. Background: a response arrives — the matching `liveRequests` row's count bumps without a refetch.

---

## 4 · Screen 2 · `/admin/requests` — Requests index (`AdminRequestsList`)

### 4.1 · Purpose

The coordinator's working list of every open and recent shift across their sites. The screen exists to **trigger the next action**: assign a top-match, view a request in progress, or kick off a new one.

### 4.2 · Layout

1. **Header** — eyebrow, dynamic serif headline (`"3 requests need your eyes"`), subtitle, search icon, primary `+ New request`.
2. **Toolbar row** — tabs (Live / Assigned / All with counts) on the left; site pills (All / per-site) + `More` filter button on the right.
3. **Request rows** — 5-column grid:
   - ID + urgent badge + posted timestamp
   - Role + mono time range + chips for site/lang/quals
   - Status chip + progress sub-line
   - Top match avatar (when `responses_received` and unassigned) OR assigned worker (when `assigned`) OR "Notifying…" placeholder
   - Context-aware action button (`Assign` terra primary / `View` ghost / `Details` ghost) + overflow `…`
   - Urgent rows: terracotta 3px left border.
4. **Empty state** — serif headline (`"Nothing to see here."`) when filters return zero.
5. **Footer** — count + `Load older →` cursor pagination.

### 4.3 · Data

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

```ts
type AdminRequestSummary = {
  id: uuid;
  publicId: string;                              // 'REQ-2041'
  urgent: boolean;
  status: 'open' | 'notified' | 'responses_received' | 'assigned';
  role: string;
  site: { id, name };
  startsAt: ISODate;
  endsAt: ISODate;
  durationLabel: string;
  languageRequired: 'fr' | 'en' | 'bilingual';
  qualificationsRequired: string[];
  metrics: { notified, viewed, accepted, declined, responses };
  postedAt: ISODate;
  postedLabel: string;
  topMatch?: { userId, name, matchScore };       // only when status='responses_received'
  assignedWorker?: { userId, name };             // only when status='assigned'
};
```

**SQL** (25 rows + cursor):

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
  (SELECT json_build_object('userId', u.id, 'name', u.full_name, 'matchScore', n2.match_score)
     FROM notifications n2 JOIN users u ON u.id = n2.user_id
     WHERE n2.request_id = r.id AND n2.response = 'accepted'
     ORDER BY n2.match_score DESC LIMIT 1
  ) AS top_match,
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

`STATUS_FOR_TAB`: `'active'` → `['open','notified','responses_received']`, `'assigned'` → `['assigned']`, `'all'` → all statuses.

**Row actions:**

| Button | Calls |
|---|---|
| `+ New request` (header) | navigates to `/admin/requests/new` |
| `Assign` (row) | `POST /api/admin/requests/:id/assign` with `{ userId: topMatch.userId }` |
| `View` / `Details` (row) | navigates to `/admin/requests/:id` |
| Overflow · `Cancel` | `POST /api/admin/requests/:id/cancel` |
| Overflow · `Duplicate` | `POST /api/admin/requests` with source as draft template |
| Overflow · `Notify more` | `POST /api/admin/requests/:id/notify-more` |

### 4.4 · Sort & priority

The `ORDER BY` above is the triage logic:
1. Urgent + unassigned first.
2. Then by `starts_at` ascending.

Don't make columns sortable in v1 — the order *is* the prioritization.

### 4.5 · Realtime

Subscribe to `request:<publicId>` channels for visible rows. On `response.accepted`:
1. Bump `accepted` count.
2. If status was `notified`, flip to `responses_received` and re-sort.
3. If a new `topMatch` is computed, swap the avatar block.
4. Soft flash (`box-shadow` pulse 600 ms) on the row.

---

## 5 · Screen 3 · `/admin/requests/new` — Create request (`AdminCreateRequest`)

### 5.1 · Purpose

A 3-step form to post a new shift, with a **live preview** of what the worker will see.

### 5.2 · Steps

| # | Title | Captures |
|---|---|---|
| 1 | Where & when | `organizationId` (site), `startsAt`, `endsAt`, `role` family |
| 2 | Who you need | `qualificationsRequired[]`, `languageRequired`, `urgency`, `arrivalInstructions` |
| 3 | Notify | Confirm + reach estimate + publish |

The mockup shows step 2 in detail. Each step renders on the left (`1.4fr`), preview pane on the right (`1fr`).

### 5.3 · Layout details (from the mockup)

- **Stepper** at top: 3 cards in a row showing past/current/upcoming. Past = paper-2 bg with green check. Current = white bg with ink border. Future = paper-2 bg.
- **Form fields** use the `<Field>` primitive: tiny eyebrow label, then the input.
- **Role picker** = pill row, one selected = `--ink` bg.
- **Qualifications** = chip row with terra-tinted active state + green check.
- **Urgency** = 2×2 grid of cards, selected gets `--terra` border + soft shadow + radio dot.
- **Arrival instructions** = textarea-styled div, with a blinking terra cursor.

### 5.4 · Right pane — Preview + reach estimate

- **Preview** — the worker-facing request card, scaled to 82%, identical to `WorkerRequestCard` in `src/worker-flow.jsx` (port that component and share it).
- **Reach estimate** — moss-soft card with serif number ("12 *eligible substitutes*") + filter recap + "See list" link.

### 5.5 · Data

```
POST /api/admin/requests
Body: RequestDraft (partial; everything optional initially)
→ { id, publicId, status: 'draft' }

PATCH /api/admin/requests/:id
Body: Partial<RequestDraft>
→ { ...request }   // autosave on every change

GET /api/admin/requests/:id/reach
→ { eligibleCount: number, filters: { language, qualifications, distanceKm } }

POST /api/admin/requests/:id/publish
→ { status: 'open' }    // emits 'request.published' event → triggers Inngest dispatch
```

**Autosave**: debounced 500 ms after every change. Save indicator in the page header chip.

### 5.6 · Validation rules

- `startsAt` must be > now + 15 min (else 400 with French error message).
- `endsAt` must be > `startsAt`, max 16h apart.
- `urgency='urgent'` allowed only when `startsAt < now + 6h`.
- `qualificationsRequired` must not be empty.
- `arrivalInstructions` max 500 chars.

### 5.7 · Acceptance test

1. Coordinator fills step 1 — autosave fires, draft REQ-XXXX appears in `/admin/requests` with `status='draft'` (don't show drafts on the list unless explicitly toggled).
2. Step 2 — reach estimate fetches in the background; updates as filters change.
3. Step 3 → Publish — request flips to `open`, the Inngest dispatch function starts notifying.
4. Coordinator is routed to `/admin/requests/:id` (the Workflow screen).

---

## 6 · Screen 4 · `/admin/requests/[id]` — Workflow (`AdminWorkflow`)

### 6.1 · Purpose

Live view of one request as it moves through the dispatch funnel. The coordinator watches responses come in and clicks "Assign" on the best fit.

### 6.2 · Layout (1.5fr left + 1fr right)

**Top header strip:**
- Chips: urgency + status. ID + created/elapsed in mono on the right.
- Serif headline: `"Educator · today, *07:30 — 14:30*"`.
- Subtitle: org + address.

**Left column:**
- **Workflow tracker** — 5-step horizontal indicator: Created → 12 notified → 5 responses → Assign → Confirmed. Past steps moss + check, current step terra + dot, future steps dashed border.
- **Responses list** — eyebrow + headline ("2 *accepted ·* 1 *viewed ·* 1 *declined*"), then one row per candidate (`ResponseRow`):
  - Avatar (top match = moss bg)
  - Name + "Top" pill if best-scored acceptance
  - City · language · decline reason (rose) if declined
  - Match %
  - Status chip (moss / sand / rose / muted)
  - Response time (mono)
  - `Assign` button per row

**Right rail:**
- **Best match card** (dark `--ink` bg): avatar + name + serif headline, 2×2 grid of tags (lang, distance, availability, qual), prominent terra `Assign Amélie` CTA, fine print about escalation timer.
- **Shift details card** — Row primitive: When, Duration, Language, Rate, Contact.
- **Pattern warning card** — sand-tinted callout when a decliner has ≥ 3 declines this month.

### 6.3 · Data

```
GET /api/admin/requests/:id
→ {
    request: FullRequest,           // includes site, org, all fields
    workflow: WorkflowStep[],        // computed from events
    responses: ResponseRow[],         // notifications joined with users, sorted
    bestMatch: ResponseRow | null,   // highest-scored acceptance
    shiftDetails: { ... },
    warnings: Warning[]               // e.g. pattern detections
  }

POST /api/admin/requests/:id/assign
Body: { userId }
→ { status: 'assigned', assignedAt, assignedWorker }
  // emits 'request.assigned' event → workers get push, dashboards update

POST /api/admin/requests/:id/notify-more
→ { newlyNotified: number }
```

### 6.4 · Realtime

Subscribe to `request:{publicId}`. Events handled:
- `notification.viewed` → mark the response row as "Viewed".
- `response.accepted` → flip the row, re-rank, possibly update `bestMatch`.
- `response.declined` → flip + show reason.
- `request.assigned` (race: another coordinator assigned) → freeze the screen, show "Already assigned by [name]" banner.

### 6.5 · Acceptance test

1. Coordinator opens REQ-2041 — sees 5 responses; Amélie at top.
2. Clicks `Assign Amélie` in the right rail → optimistic update, workflow tracker advances to step 4, all `Assign` row buttons gray out.
3. Server confirms within 200 ms → step 4 turns moss with check.
4. Background: Amélie's worker app receives the confirmation push.

---

## 7 · Screen 5 · `/admin/substitutes` — Directory (`AdminDirectory`)

### 7.1 · Purpose

The full pool of substitutes the coordinator can see, **ranked against a chosen open request** for context-aware decisions.

### 7.2 · Layout

- **Header**: serif headline `"The *pool*"`, subtitle with count, Filter + Invite CTAs.
- **Match-against bar** (dark `--ink`): "Ranking by match against [REQ-XXXX]" + current filter tags (lang, qual, distance, availability) + Clear button. When no request is selected, becomes "Showing all · not ranked."
- **Table** — 7 columns: Substitute (avatar + name + role), City, Years, Availability (with colored dot status), Languages (mono pills), Match (progress bar + score), Notify button.
- Top row gets moss-soft bg if a request is in context.

### 7.3 · Data

```
GET /api/admin/substitutes?
  rankAgainstRequestId=<uuid>      # optional
  &filter[language]=...
  &filter[qualifications]=...
  &filter[city]=...
→ {
    substitutes: Substitute[],
    request?: Request,
    activeFilters: { ... }
  }
```

When `rankAgainstRequestId` is set, the `match` field is the eligibility score from `HANDOFF.md` §6. When not set, sort by reliability (HANDOFF §10 in NETWORK_HANDOFF) instead.

### 7.4 · Actions

| Button | Calls |
|---|---|
| Header `Invite` | opens invite modal (email/phone/role/lang/city), POSTs to `/api/admin/substitutes/invite` |
| Row `Notify` | only enabled when a request is in context. `POST /api/admin/requests/:id/notify` with `{ userIds: [id] }`. Adds this sub to the existing notification batch. |

---

## 8 · Screen 6 · `/admin/organizations` — Sites (`AdminOrganizations`)

### 8.1 · Purpose

Manage the physical reality of one or more sites: enrollment, hours, coordinators, fill rate.

### 8.2 · Layout (split-pane, 1.2fr / 1.5fr)

**Left rail — site list:**
- Eyebrow + serif headline (`"Three locations"`, count dynamic).
- `+ Add site` ghost button.
- One card per site. Selected card flips to `--ink` bg with terra left border.
- Each card: 42×42 tile with 3-letter site code, name, city + type, mini-stats (Enrolled `62/64`, Fill 30d `88%` color-coded, Requests `24`).

**Right pane — site detail (3 stacked blocks):**
1. **Header card** — name, address, eyebrow with language. Edit + New Request buttons. 4 KPI tiles in a row.
2. **Two-column row** — Site details (Type, Hours, Phone, Language, Capacity, Enrolled) + Coordinators (avatar list, + Invite, Roster today line).
3. **Recent activity preview** — last 3 events at this site, "Open activity log →" deep-links to `/admin/activity?siteId=...`.

### 8.3 · Data

```
GET /api/admin/organizations
→ Array<{
    id, name, type, city, address, capacity, enrolledCount,
    lang, hours, contactPhone, isActive,
    metrics: { fillRate30d, requests30d, filled30d, openRequests },
    coordinators: Array<{ id, name, role }>,
    rosterToday: { onSite: number, substitutesArriving: number }
  }>

PATCH /api/admin/organizations/:id
Body: Partial<{ name, address, hoursLabel, contactPhone, lang, capacity }>
→ Updated org. Writes 'org.updated' event.
```

**Metrics SQL:**

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

Memoize 60 s per orgIds set.

### 8.4 · Edge cases

- **Single-site coordinator**: hide left rail, render detail full-width.
- **Inactive site**: reduced opacity + "Inactive" chip, no New Request button.

---

## 9 · Screen 7 · `/admin/activity` — Activity history (`AdminActivityHistory`)

### 9.1 · Purpose

Full audit timeline across every site the coordinator manages. Read-only. For quarterly reports, compliance, and "what happened on Thursday?" investigations.

### 9.2 · Layout

1. **Header** — eyebrow + serif headline (`"Every move, *logged*."`), subtitle, date-range + site filter + Export CSV.
2. **KPI strip** — 5 cards: Posted, Filled (with rate), Cancelled, Expired, Avg time-to-fill (with delta).
3. **Filter chips** — All / Posted / Assigned / Completed / Cancelled / Expired / Declined / Invitations, with counts.
4. **Event stream** — grouped by day. Each row: time (mono), 28×28 colored icon tile, "**Actor** *verb* **target**" + meta sub-line, site chip, kind chip.
5. **Pagination** — Load older cursor.

### 9.3 · Data

Same `events` table as APF activity (`NETWORK_HANDOFF.md` §3.4), scoped to `scope.orgIds`:

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
  AND e.created_at > $2
  AND ($3::text IS NULL OR e.kind = $3)
  AND ($4::uuid IS NULL OR o.id = $4)
ORDER BY e.created_at DESC
LIMIT 50 OFFSET $5;
```

```
GET /api/admin/activity?
  kind=accepted|declined|assigned|completed|cancelled|expired|invited|posted|all
  &siteId=<uuid>
  &from=2026-04-23&to=2026-05-23
  &cursor=<base64>
→ {
    events: Event[],
    nextCursor: string | null,
    kpis: { posted, filled, cancelled, expired, avgTimeToFillMinutes, fillRate },
    facetCounts: { posted, assigned, completed, ... }
  }

GET /api/admin/activity/export?format=csv&from=...&to=...&siteId=...
→ Inngest job, emails download link in ~30 s.
```

### 9.4 · Event kinds taxonomy

Defined in `lib/event-styles.ts`, shared with APF activity (`NETWORK_HANDOFF.md` §3.4):

| kind | icon | tone | label |
|---|---|---|---|
| `request.posted` | + | terra | Posted |
| `response.accepted` | ✓ | moss | Accepted |
| `response.declined` | × | rose | Declined |
| `request.assigned` | ✓ | moss | Assigned |
| `request.completed` | ✓ | moss | Completed |
| `request.cancelled` | × | rose | Cancelled |
| `request.expired` | clock | grey | Expired |
| `user.invited` | user | sand | Invited |

### 9.5 · Privacy (Law 25)

- Admin reading another user's activity → write a `data_access_log` row (see `NETWORK_HANDOFF.md` §10).
- Admin exporting CSV → write `data_access_log` with `endpoint='admin.activity.export'` and the date range as `reason`.

---

## 10 · Shared pieces across the 7 screens

| Primitive | Used by | Source |
|---|---|---|
| `AdminShell` | All 7 | `components/admin/AdminShell.tsx` |
| KPI tile (`Kpi`, `KpiOrg`) | Dashboard, Organizations, Activity | `components/admin/Kpi.tsx` |
| `RequestListRow` | Requests + Dashboard "Live requests" (use a `compact` prop on the dashboard) | `components/admin/RequestListRow.tsx` |
| `ResponseRow` | Workflow + (future) responses widgets | `components/admin/ResponseRow.tsx` |
| Event icon mapping | Activity + Dashboard activity feed + APF activity | `lib/event-styles.ts` |
| Site chip | Activity + Requests + Organizations | `components/admin/SiteChip.tsx` |
| Date-range picker | Activity + Export | `components/ui/DateRangePicker.tsx` |
| Filter chip row | Requests + Activity + Dashboard | `components/ui/FilterChips.tsx` |
| Tab strip | Requests + worker inbox | `components/ui/Tabs.tsx` |

If you find yourself writing a similar component twice, lift it.

---

## 11 · Routes summary

```
app/(admin)/admin/
├── layout.tsx                       # AdminShell wrapper
├── page.tsx                         # → AdminDashboard
├── requests/page.tsx                # → AdminRequestsList
├── requests/new/page.tsx            # → AdminCreateRequest
├── requests/[id]/page.tsx           # → AdminWorkflow
├── substitutes/page.tsx             # → AdminDirectory
├── organizations/page.tsx           # → AdminOrganizations
└── activity/page.tsx                # → AdminActivityHistory
```

`layout.tsx` runs the middleware check (active membership with `role IN ('admin','coordinator')`) and provides the `scopeToAdmin` result via React context so child pages don't need to re-fetch it.

---

## 12 · Build order (5 days)

| Day | Deliverable |
|---|---|
| 1 | DB migration (`parentOrganizationId`, `capacity`, `enrolledCount`, `hoursLabel`). `scopeToAdmin` helper. `AdminShell` + middleware. `GET /api/admin/dashboard` and the Dashboard screen wired. |
| 2 | `GET /api/admin/requests` with `STATUS_FOR_TAB` + top-match subquery. Requests index UI + tabs + site pills + realtime. Inline `Assign` action. |
| 3 | Create request flow: POST/PATCH/publish endpoints, autosave, reach estimate, 3-step UI, live preview pane sharing `WorkerRequestCard`. Workflow screen with realtime response stream. |
| 4 | Substitute directory with eligibility scoring (links to `HANDOFF.md` §6). Organizations split-pane + metrics SQL + edit modal. |
| 5 | Activity history with facet counts + KPIs in one query. CSV export via Inngest. `data_access_log` writes on PII reads. Permission tests. Playwright E2E across all 7 screens. |

---

## 13 · Acceptance test (end-to-end)

1. Coordinator Sylvie signs in at 06:40, lands on `/admin`.
2. Dashboard shows the urgent-now card for REQ-2041 created moments ago.
3. She clicks `+ New request` → fills the 3-step form → publishes REQ-2042.
4. Goes to `/admin/requests` → REQ-2042 is the first row, status `open`, "Notifying…".
5. Pusher event arrives → REQ-2042 row updates to `notified`, then to `responses_received` as accepts come in.
6. She clicks `Assign` on REQ-2042's top match → optimistic update, the worker's phone confirmation push fires.
7. She opens `/admin/substitutes` → ranks against REQ-2041 → notices Amélie at 96% match.
8. Switches to `/admin/organizations` → updates the Plateau site's contact phone → PATCH succeeds, event logged.
9. Opens `/admin/activity` → filters to "Cancelled" → exports CSV → toast confirms "We'll email the export."
10. Tries `/admin/requests` for a CPE outside her scope → 403.

If all 10 pass, the admin coordinator surface is shippable.

---

That's the whole admin spec — 7 screens, 1 shell, shared primitives, scoped to coordinator role, paired with `HANDOFF.md` for foundations.
