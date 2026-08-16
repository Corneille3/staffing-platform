# Spec — Check-out, Worked Hours & Geofence

Written against the current codebase (verified 2026-08). Closes the loop the ads
sell: claimed → showed up → hours logged.

## What already exists (do NOT rebuild)

- `POST /assignments/{id}/check-in` — stores `checked_in_at`,
  `checked_in_latitude`, `checked_in_longitude`. Worker-scoped (admin override),
  active-assignment only, idempotent (first wins), audit-logged; cancellation
  clears the stamp while keeping the audit event.
- `Assignment.completed_at` column and `AssignmentStatus.COMPLETED` — both exist,
  **nothing sets them today**.
- `Organization.latitude` / `longitude` — populated site coordinates, unused so far.
- `AuditService.log(...)`, `ExportService` job scaffolding.

## Gaps this spec fills

1. Check-out (worker taps "Done") + hours computed
2. Geofence validation on check-in/out (radius around the site)
3. "Not checked in" state — the operational absence signal
4. Coordinator time correction, audited
5. Payroll CSV export

Decisions taken (Josi, 2026-08): a forgotten check-out is **left open** for the
coordinator to correct — never auto-closed at scheduled end. Geolocation is
**validated against a site radius**, not merely recorded. Coordinators **can**
edit times.

---

## 1. Schema

```sql
ALTER TABLE assignments
  ADD COLUMN checked_out_at        timestamptz,
  ADD COLUMN checked_out_latitude  numeric(9,6),
  ADD COLUMN checked_out_longitude numeric(9,6),
  ADD COLUMN hours_adjusted_by_user_id uuid REFERENCES users(id),
  ADD COLUMN hours_adjusted_at     timestamptz,
  ADD COLUMN hours_adjustment_reason text;

ALTER TABLE organizations
  ADD COLUMN geofence_radius_m integer;   -- NULL = geofence disabled for this site
```

Worked hours are **derived, never stored**: `checked_out_at − checked_in_at`.
Storing a duration invites drift the moment a timestamp is corrected. Expose it
as a computed property on the schema, not a column.

Config: `geofence_default_radius_m: int = 250`, `geofence_enforce: bool = False`.

## 2. Check-out endpoint

`POST /assignments/{id}/check-out`, mirroring check-in exactly (same auth scope,
same admin override, same audit pattern).

Rules:
- 409 if `checked_in_at is None` — you cannot leave a place you never arrived at.
- Idempotent: first check-out wins, later calls return the existing stamp.
- On success: set `checked_out_at`, geo columns, `completed_at = checked_out_at`,
  `status = COMPLETED`.
- Cancellation clears `checked_out_at`/`completed_at` alongside the check-in
  stamp, same as today, keeping the audit trail.

**No auto-close.** A shift checked in but never checked out stays open with
`checked_out_at IS NULL` and surfaces to the coordinator as *"Sortie non pointée"*
for correction (§5). Auto-closing at scheduled end would silently invent a
payroll number; leaving it open makes a human decide, which is the point.

## 3. Geofence

New `app/core/geo.py`:

```python
def haversine_m(lat1, lon1, lat2, lon2) -> float: ...

def within_site(org: Organization, lat, lon, *, default_radius_m: int) -> bool | None:
    """True/False inside the radius; None when the check can't be made
    (site has no coordinates, or the device sent no position)."""
```

Applied to **both** check-in and check-out:

| `geofence_enforce` | Result | Behaviour |
|---|---|---|
| False (default) | outside | Allow, stamp `geo_ok = False` in the audit payload, flag in the UI |
| True | outside | **422** `outside_site_radius` with the distance in the detail |
| any | `None` (no coords either side) | Allow, audit note `geo_unavailable` |

Radius = `org.geofence_radius_m or settings.geofence_default_radius_m`.

Start with `geofence_enforce = False`. A hard block on day one turns a GPS
glitch into a worker standing outside unable to start a shift — collect the
`geo_ok=False` rate first, then let networks opt in per tenant.

## 4. Not-checked-in (absence signal)

Derived, not stored — no background job, no new state to keep in sync:

> assignment is CONFIRMED, `checked_in_at IS NULL`, and
> `shift_start_utc(work_date, start_time) + grace < now()`

`checkin_grace_minutes: int = 15`. Surface it:
- Coordinator dashboard: reuse the Coverage-risk tile (spec #2) with a
  **"Non pointé"** count for today.
- Assignment row: red "Non pointé — début il y a 22 min".

This is the highest-operational-value piece here: a director wants to know
*right now* that nobody arrived, not at payroll time.

## 5. Coordinator time correction

`PATCH /admin/assignments/{id}/times` — body `{checked_in_at?, checked_out_at?, reason}`.

- Coordinator/org-admin scope only, tenant-checked like every admin route.
- `reason` is **required** — a payroll edit without a why is the thing an auditor
  asks about.
- Writes `hours_adjusted_by_user_id`, `hours_adjusted_at`, `hours_adjustment_reason`,
  plus an `AuditService.log` entry carrying both old and new values.
- Validation: `checked_out_at > checked_in_at`; reject a window over
  `max_shift_hours: int = 24`.
- Setting `checked_out_at` on an open shift also sets `completed_at` and
  `COMPLETED` — this is the forgotten-checkout repair path.
- The UI must show corrected times as corrected (badge + hover: who, when, why).
  Never present an edited number as if the worker recorded it.

## 6. Payroll CSV export

Extend `ExportService` with a `worked_hours` view over a date range:

```
org, work_date, worker_name, role, scheduled_start, scheduled_end,
scheduled_hours, actual_in, actual_out, worked_hours, variance_hours,
geo_ok, corrected (yes/no), corrected_by, reason
```

Rows for shifts still open (`checked_out_at IS NULL`) are included with empty
actuals and `status = "non pointé"` — an export that silently drops them would
under-report payroll and nobody would notice.

## 7. Frontend

- **Worker, shift in progress:** primary button "J'y suis" → after check-in it
  becomes "Terminé" with a live elapsed counter. Both send position when the
  browser grants it; a refusal is not fatal (§3 `None` path).
- **Worker, after check-out:** "6 h 54 enregistrées" — read-only. Workers never
  type hours in v1; the moment they can, you need an approval workflow, which is
  a different feature.
- **Coordinator, shift detail:** scheduled vs actual with variance, geo badge,
  correction control, "Non pointé" state.

## 8. Tests

- check-out without check-in → 409
- check-out twice → idempotent, one timestamp, one audit entry
- successful check-out → `COMPLETED` + `completed_at` set, hours derived correctly
- cancellation clears both stamps, audit retained
- geofence: inside → ok; outside + enforce off → allowed, `geo_ok=False`;
  outside + enforce on → 422 with distance; missing coords → allowed, noted
- not-checked-in appears only after start + grace, disappears once checked in
- correction: requires reason, rejects inverted/over-long windows, audit holds
  old and new, sets COMPLETED on an open shift
- export: includes open shifts with empty actuals, flags corrected rows
- tenant isolation on the correction endpoint and the export

## 9. Sequencing

1. Migration + `geo.py` + check-out endpoint (audit, no geofence yet)
2. Geofence in permissive mode (`enforce = False`) — gather `geo_ok` data
3. Not-checked-in surfacing (dashboard + row state)
4. Correction endpoint + UI badges
5. CSV export
6. Only then consider per-tenant `geofence_enforce = True`

Out of scope for v1: worker-entered hours, break tracking, overtime rules,
payments, auto-close.
