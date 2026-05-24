# HANDOFF.md gap tracker

Cross-reference of `frontend/New design by Claude Design/HANDOFF.md` vs what was actually built.
Updated: 2026-05-23.

---

## Group 1 — Pure frontend gaps (no backend changes needed)

| # | HANDOFF spec | What was built | Status |
|---|---|---|---|
| 1 | Nav label **"Schedule"**, route `/schedule` | Label "Shifts", route `/assignments` | ✅ Closed (worker redesign) |
| 2 | `ToggleRow` + `Field` as shared `components/ui/` primitives | Built locally inside each page, not extracted | Low — open |
| 3 | Dedicated **`/requests/[id]` detail page** — full screen with time block (Duration/Rate/Distance stats), eligibility list, sticky footer CTA | Dedicated `/worker/requests/[id]` page with hero, time/distance, eligibility, sticky footer | ✅ Closed (worker redesign) |
| 4 | **`/requests/[id]/accepted` page** — vertical timeline, withdraw button | `/worker/requests/[id]/accepted` page with 4-node timeline + withdraw | ✅ Closed (worker redesign) |
| 5 | Schedule page: **Directions** (terra CTA) + **phone call** button in dark hero action row | Directions deeplink + Add-to-Calendar on `/schedule` hero | ✅ Closed (worker redesign) |
| 6 | Admin create request: **live preview pane** (worker-side request card renders as you type) | Right-rail preview card on `/admin/requests/new` | ✅ Closed (M2) |
| 7 | Admin create request: **reach estimate** — "12 eligible substitutes" live count | Moss-soft reach-estimate card driven by `GET /admin/substitutes?rank_against_draft_id=` | ✅ Closed (M2) |
| 8 | Admin workflow: **5-step horizontal workflow tracker** (Created → Notified → Responses → Assign → Confirmed) | 5-step horizontal tracker on `/admin/requests/[id]` | ✅ Closed (admin visual port) |
| 9 | Admin substitute directory: **match score bar** (progress bar, moss/terra/ink-3 by score band) + "Ranking against REQ-XXXX" context bar | Sortable table at `/admin/substitutes` with 50px match bar + dark ranking-against bar | ✅ Closed (M3) |
| 10 | Visual rule 6: **big numerics in Instrument Serif** ("7h", "87%", "12 substitutes" — serif italic for the unit) | Consistently applied on APF + admin redesigns. Worker surface mostly there. | ✅ Closed (mostly) |
| (new) | **Best match dark right-rail card** on `/admin/requests/[id]` with terra Assign CTA | Implemented | ✅ Closed (M4) |
| (new) | **Sand-tinted decline pattern callout** on workflow page | Implemented for in-request declines with reasons | ✅ Closed (M4) |
| (new) | Admin shell: 232px **left sidebar** with logo + Admin pill + org switcher + KPI footer | Implemented | ✅ Closed (M1) |
| (new) | APF shell: 232px **dark left sidebar** with terra APF badge + read-only footer | Implemented | ✅ Closed (APF slice 0 redo) |

---

## Group 2 — Backend-blocked gaps (new DB fields or endpoints required)

| # | HANDOFF spec | Status |
|---|---|---|
| 11 | **Weekly availability grid** — 7 days × 4 time slots | ✅ Closed (worker redesign) |
| 12 | **Far-away shifts** preference toggle on availability screen | ✅ Closed (worker redesign) |
| 13 | **Weekend overnights** preference toggle on availability screen | ✅ Closed (worker redesign) |
| 14 | **Check-in card** on `/schedule` with geolocation | ✅ Closed (worker redesign) |
| 15 | **Hourly rate** on requests — shown in 3-stat block and request cards | Product-rejected. Column exists in DB; UI deliberately omits per `feedback_no_hourly_rate_display` memory. |
| 16 | **Distance from worker** on request cards ("1.2 km") | ✅ Closed (worker redesign — distance computed in matching service when coords present) |
| 17 | **Numeric match score** — "96 % match" chip | ✅ Closed (worker redesign + admin M3/M4 surface it everywhere) |
| 18 | **Withdraw response** — `POST /requests/:id/withdraw` | ✅ Closed (worker redesign) |
| (new) | Admin draft autosave — `POST /api/v1/admin/requests` + `PATCH /api/v1/admin/requests/{id}` | ✅ Closed (M2) |
| (new) | Admin substitutes ranking — `GET /api/v1/admin/substitutes?rank_against_request_id=` | ✅ Closed (M3) |

---

## Group 3 — Stack-level (intentionally skipped — FastAPI stays)

These are in the HANDOFF as part of the proposed greenfield stack. The project uses FastAPI + existing infra instead. Not gaps to fix unless the stack changes.

| Item | HANDOFF pick | What we have |
|---|---|---|
| Background jobs | Inngest (tiered dispatch, escalation timeouts) | Direct dispatch in FastAPI · APF export uses FastAPI `BackgroundTasks` — **skip Inngest** |
| Push notifications | Web Push (VAPID) + service worker | Not yet built — **keep, build next** |
| Realtime | Pusher / SSE | SSE via FastAPI `StreamingResponse` — **keep SSE, skip Pusher** |
| i18n | next-intl with FR/EN UI toggle | next-intl wired (worker surface fully translated) — ✅ done |
| Email | Resend | AWS SES (DKIM verified 2026-05-10, still in sandbox) — **skip Resend** |
| File storage | Cloudflare R2 (certification uploads) | Not implemented — **skip for v1** |
| Geo | PostGIS + Mapbox | Not implemented — **skip for v1** |
| Testing | Vitest + Playwright | pytest (backend only, 109 tests) — **skip frontend test runner for now** |
| DB / ORM | Neon + Drizzle | RDS PostgreSQL + SQLAlchemy — **skip** |

---

## APF (`NETWORK_HANDOFF.md`) status

All 6 slices from `NETWORK_HANDOFF.md §12` shipped on `feature/worker-inbox`:

| # | Slice | Status |
|---|---|---|
| 0 | Visual port — dark left sidebar | ✅ Closed |
| 1 | Snapshot endpoint `GET /api/v1/apf/snapshot` (60s cache) | ✅ Closed |
| 2 | Activity feed with chip filters + cursor pagination + `?org_id=` filter | ✅ Closed |
| 3 | NetworkPool overhaul — distribution chart + KPI bento + top contributors + bulk invite | ✅ Closed |
| 4 | Org drill-in `/apf/organizations/{id}` + filtered activity link | ✅ Closed |
| 5 | CSV export — `POST /api/v1/apf/export` with background generation + SES link email | ✅ Closed |

**Schema delta required by §8 added:** `worker_profiles.reliability INTEGER NOT NULL DEFAULT 0` (migration `20260523_0007`). Compute job is manual via `POST /api/v1/apf/substitutes/recompute-reliability` until a nightly cron lands.

**NETWORK_HANDOFF items deliberately NOT built:**
- Coverage map (Mapbox cost vs. a list).
- Predictive analytics ("you'll be short 4 educators Tuesday").
- Direct messaging between APF and substitutes (would short-circuit the coordinator).
- Cross-network reports (each network sees only its own scope).
- `apf_observer` (read-only) role variant — only `network_admin` exists today.
- `data_access_log` (Law 25 §10) — add when real worker PII lands on APF.
- Many-to-many networks ⇄ orgs — `Tenant`/`TenantMembership` collapses both.

---

## Remaining items (post-pilot or post-real-data)

- Reliability nightly cron — currently manual trigger. Add a scheduler once we have one (Inngest, Celery beat, or a tiny Lambda).
- Export job queue — currently in-process; swap to Redis/Inngest if export volume grows.
- `data_access_log` table for Law 25 §10 — needed before real worker PII lands on APF.
- `apf_observer` (read-only) role — implement when a read-only stakeholder appears.
- Many-to-many `networks` ⇄ `network_organizations` schema — implement when an org needs to belong to >1 network.
- Worker consent toggle at onboarding for APF visibility (Law 25 §10).
- Item #2 (extract `ToggleRow` + `Field` to shared `components/ui/`) — low priority.
- Visual rule 6 final sweep on the worker surface — mostly done.
