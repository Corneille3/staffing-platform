# HANDOFF.md gap tracker

Cross-reference of `frontend/New design by Claude Design/HANDOFF.md` vs what was actually built.
Updated: 2026-05-11.

---

## Group 1 — Pure frontend gaps (no backend changes needed)

| # | HANDOFF spec | What was built | Priority |
|---|---|---|---|
| 1 | Nav label **"Schedule"**, route `/schedule` | Label "Shifts", route `/assignments` | Quick fix |
| 2 | `ToggleRow` + `Field` as shared `components/ui/` primitives | Built locally inside each page, not extracted | Low |
| 3 | Dedicated **`/requests/[id]` detail page** — full screen with time block (Duration/Rate/Distance stats), eligibility list, sticky footer CTA | No dedicated page — accept/decline are inline modals on the card list | Medium |
| 4 | **`/requests/[id]/accepted` page** — vertical timeline (Response sent → Reviewing → Confirmed → Shift starts), withdraw button | No dedicated route — post-accept state is a status chip on the card | Medium |
| 5 | Schedule page: **Directions** (terra CTA) + **phone call** button in dark hero action row | Phone link is inside contact block; no distinct action buttons in hero | Small |
| 6 | Admin create request: **live preview pane** (worker-side request card renders as you type) | Not built | Medium |
| 7 | Admin create request: **reach estimate** — "12 eligible substitutes" live count | Not built | Small |
| 8 | Admin workflow: **5-step horizontal workflow tracker** (Created → Notified → Responses → Assign → Confirmed) | Status chips only, no visual tracker | Medium |
| 9 | Admin substitute directory: **match score bar** (progress bar, moss/terra/ink-3 by score band) + "Ranking against REQ-XXXX" context bar | Not built | Needs #19 below |
| 10 | Visual rule 6: **big numerics in Instrument Serif** ("7h", "87%", "12 substitutes" — serif italic for the unit) | Not consistently applied across all surfaces | Small sweep |

---

## Group 2 — Backend-blocked gaps (new DB fields or endpoints required)

| # | HANDOFF spec | Gap | What's needed |
|---|---|---|---|
| 11 | **Weekly availability grid** — 7 days × 4 time slots (Morning 06–12 / Afternoon 12–18 / Evening 18–24 / Overnight 00–06), toggleable cells, copy-last-week, week navigation | Single `available / unavailable` toggle only | New `availabilities` table (`user_id`, `day_of_week 0–6`, `slot`, `available bool`), `GET + PUT /api/me/availability` |
| 12 | **Far-away shifts** preference toggle on availability screen | Not built | `notify_far` boolean on worker profile |
| 13 | **Weekend overnights** preference toggle on availability screen | Not built | `notify_weekend_overnight` boolean on worker profile |
| 14 | **Check-in card** on `/schedule` — "Check in when you arrive" moss CTA calls `POST /shifts/:id/check-in` with geolocation | Not built — **keep, build** | `checked_in_at` column on assignments + new endpoint |
| 15 | **Hourly rate** on requests — shown in 3-stat block and request cards ("$26/h") | Not in data model | `hourly_rate` field on `staffing_requests` |
| 16 | **Distance from worker** on request cards ("1.2 km") | Not shown | Coordinates on orgs + distance calculation in matching service |
| 17 | **Numeric match score** — "96 % match" chip on admin directory and worker eligibility panel | Pass/fail reasons shown, no score | Scoring function in `matching_service.py` returning 0–100 int |
| 18 | **Withdraw response** — `POST /requests/:id/withdraw` retracts an accepted response before assignment | Not built | New status transition + endpoint |

---

## Group 3 — Stack-level (intentionally skipped — FastAPI stays)

These are in the HANDOFF as part of the proposed greenfield stack. The project uses FastAPI + existing infra instead. Not gaps to fix unless the stack changes.

| Item | HANDOFF pick | What we have |
|---|---|---|
| Background jobs | Inngest (tiered dispatch, escalation timeouts) | Direct dispatch in FastAPI — **skip** |
| Push notifications | Web Push (VAPID) + service worker | Not yet built — **keep, build next** |
| Realtime | Pusher / SSE | SSE via FastAPI `StreamingResponse` — **keep SSE, skip Pusher** |
| i18n | next-intl with FR/EN UI toggle | Manual inline strings — **keep next-intl, build next** |
| Email | Resend | AWS SES — **skip Resend** |
| File storage | Cloudflare R2 (certification uploads) | Not implemented — **skip for v1** |
| Geo | PostGIS + Mapbox | Not implemented — **skip for v1** |
| Testing | Vitest + Playwright | pytest (backend only) — **skip** |
| DB / ORM | Neon + Drizzle | RDS PostgreSQL + SQLAlchemy — **skip** |

---

## Build order for remaining gaps

**Quick wins (do anytime):**
- Fix #1: rename nav label + route (`/assignments` → `/schedule`, "Shifts" → "Schedule")
- Fix #10: serif numerics sweep

**Next frontend sprint:**
- #3 + #4: dedicated request detail page + accepted page (these are the biggest UX gaps — workers currently have no deep-link into a request)
- #5: Directions + call buttons in the shift hero card

**Backend sprint before availability redesign:**
- #11–13: availability grid + preference toggles (schema change + migration + endpoints)

**Later:**
- #14: check-in (geolocation, low priority for v1 per HANDOFF §16)
- #15–17: rate, distance, match score (nice to have, not blocking)
- #18: withdraw response
