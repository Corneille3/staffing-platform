# Spec — No-Show Alerts & Clock-In/Out Reminders

Written against the current codebase (verified 2026-09). Turns the passive
"not checked in" signal (§4 of the check-out spec — already shipped) into
active outreach, riding the scheduler that already exists.

## What already exists (do NOT rebuild)

- `app/scheduler.py` — in-process daemon thread, one per container, tick loop
  with its own session per pass, exceptions swallowed+logged. Currently runs
  the replacement sweep and the nightly reliability recompute.
- `ReplacementAdminService.tick(org_ids, actor_user_id)` — the sweep body the
  scheduler calls across ALL orgs; `_email_coordinators` shows the existing
  pattern for reaching active org_admins of an organization.
- The derived no-show condition (dashboard `_not_checked_in_count`):
  CONFIRMED assignment, `checked_in_at IS NULL`,
  `shift_start_utc(work_date, start_time) + checkin_grace_minutes < now`.
- `NotificationDispatcher` with push / in-app / email / SMS services, worker
  `sms_opt_out`, bilingual `localized(...)` helper.
- `checkin_grace_minutes: int = 15` in config.

Ship order (deliberate): **Feature C first** (pure sweep extension, no new
tables, closes a data-hygiene hole), then **Feature B (worker reminders)**,
then Feature A (coordinator no-show alerts). B-before-A because fewer
forgotten taps → fewer alerts → the coordinator only ever hears about real
absences. Reversed, the launch week would bury true no-shows under
reminders-worth-of-noise.

---

## Shared plumbing

### Idempotence columns

One alert/reminder per assignment per kind — the sweep repasses every tick
and must never re-send. Timestamps double as audit:

```sql
ALTER TABLE assignments
  ADD COLUMN checkin_reminder_sent_at   timestamptz,
  ADD COLUMN checkout_reminder_sent_at  timestamptz,
  ADD COLUMN no_show_alerted_at         timestamptz;
```

(Chosen over a generic sent-log table: three nullable timestamps keep the
sweep query a single table scan with `IS NULL` filters — no join, no
dedupe logic, and "has this fired?" is answerable by looking at the row.)

### Scheduler hook

Add one job to the existing loop, same cadence as the replacement sweep
(piggyback the tick — do not add a second timer):

```python
# scheduler.py, inside the tick, after the replacement sweep:
AttendanceSweepService(session).tick()
```

New `app/services/attendance_sweep_service.py` with a single public
`tick()` that runs the three checks below in one pass. Same safety rules as
the neighbours: own try/except per check, log-and-continue, never raise out
of the tick. Config:

```python
checkout_reminder_delay_minutes: int = 10
```

### Catch-up guard

After downtime the first tick sees stale candidates. Cap every check with a
freshness window: only act when the trigger moment is less than
`2 * replacement_sweep_interval_seconds + 15 min` in the past. A reminder
for a shift that started three hours ago is noise; a no-show alert for
yesterday is an incident report, not an alert — the dashboard and CSV
already carry those.

---

## Feature B — worker clock reminders (ship first)

Push-only, deliberately: SMS costs money for what is a nudge, and email at
shift-start is dead on arrival. A worker with no push subscription simply
gets no reminder — the coordinator alert (Feature A) remains the backstop.

### B1. Check-in reminder

Trigger: CONFIRMED assignment, `checked_in_at IS NULL`,
`checkin_reminder_sent_at IS NULL`, and `now >= shift_start_utc` (AT start,
not before — an H-30 ping trains people to ignore the channel).
Freshness-capped per the catch-up guard.

Send push, then stamp `checkin_reminder_sent_at` in the same transaction:

    EN: "Your shift at {org} has started — don't forget to check in."
    FR: "Ton quart au {org} est commencé — n'oublie pas de confirmer ton arrivée."

Tap opens the shift's check-in screen (same deep-link payload shape as the
existing shift pushes).

Interplay with Feature A: the grace window (15 min) IS the worker's window
to act on this reminder before the coordinator hears about it. Keep
`checkin_grace_minutes > 0` always; validating config at boot
(`grace >= 5`) is worth the three lines.

### B2. Check-out reminder

Trigger: `checked_in_at IS NOT NULL`, `checked_out_at IS NULL`,
`checkout_reminder_sent_at IS NULL`, and
`now >= shift_end_utc + checkout_reminder_delay_minutes`.

    EN: "Done at {org}? Tap Done to record your hours."
    FR: "Terminé au {org}? Touche Terminé pour enregistrer tes heures."

This is the higher-ROI reminder: forgotten check-outs are the bulk of
coordinator corrections today. No repeat, no second nudge — one push, then
the open-checkout state stays visible to the coordinator as before.

---

## Feature C — coordinator-origin requests: escalate & expire (closes a known gap)

Today the sweep (`ReplacementAdminService.tick`) filters
`origin.in_(SELF_SERVE_ORIGINS)`. Consequence, confirmed in code: a request a
coordinator posted and nobody claimed gets **no** approach-of-start warning
and **never expires** — it stays OPEN forever, polluting the coverage tile
and every open-shift list. Only the dashboard shows it.

Fix inside the same sweep pass — do not add another loop:

1. **Escalation:** extend the escalation query to also select
   `origin == COORDINATOR` requests. Same lead
   (`replacement_escalation_lead_minutes`), same one-shot stamp — the
   `escalated_at` column already exists on StaffingRequest and is
   origin-agnostic. Same recipients (active org_admins). Different wording,
   because the reader posted it themselves:

       EN: "Your posted shift starts in {n} min and is still unfilled —
            {role} at {org}, {date} {start}. Re-notify the pool or adjust it
            while there's time."
       FR: "Votre quart publié commence dans {n} min et n'est toujours pas
            comblé — {role} au {org}, {date} {start}. Relancez le bassin ou
            ajustez-le pendant qu'il est temps."

   Channel: **email only**, matching the existing self-serve escalation next
   door — the ~60 min lead gives email time to work, and no admin push/in-app
   infrastructure exists today (see Feature A's channel note). Reuse the
   recipient query via the shared helper rather than copying it.

2. **Expiry:** include COORDINATOR-origin in the past-start expiry the sweep
   already applies to self-serve requests: OPEN + started → EXPIRED, same
   audit event. This is data hygiene more than UX — expired shifts drop out
   of claimable lists, the coverage tile, and any future SMS candidate query
   without each of those needing its own started-shift guard.

3. **Approval-mode nuance:** a request sitting in RESPONSES_RECEIVED (hands
   raised, coordinator hasn't picked) past its start is a *decision* overdue,
   not a coverage gap. Expire it the same way, but the escalation message for
   that state should say so:

       EN: "{k} substitutes accepted your shift at {org} — pick one before
            {start} or it expires."
       FR: "{k} remplaçant(e)s ont accepté votre quart au {org} — choisissez
            avant {start}, sinon il expire."

Tests to add: coordinator-origin escalates once at lead and expires at start
(mirror the existing self-serve sweep tests); approval-mode variant message
when responses exist; self-serve behaviour unchanged; tenant isolation
unchanged.

---

## Feature A — coordinator no-show alert

Trigger: the exact dashboard condition (§4), plus `no_show_alerted_at IS
NULL`, plus freshness cap. Because B1 fired at start and the grace is
15 min, every alert that fires here survived a reminder — it is signal.

Recipients: active org_admins of the assignment's organization — reuse the
`_email_coordinators` recipient query, extracted into a small shared helper
rather than copied.

Channels — corrected after a code check (2026-09): the spec originally said
push + in-app for admins, but **neither exists for that role today** — no
admin push-subscription UI (so every send would fall through), and
`RequestNotification`/`/notifications/feed` are worker-keyed (an admin feed
returns nothing). A no-show alert read two hours later by email is worthless,
so until admin push exists: **SMS to each active org_admin with a phone,
plus email always.** This deliberately overrides the "no SMS for desk roles"
rule — SMS is the only real-time channel available for admins right now, the
volume is tiny once Feature B trims false positives, and a no-show is
exactly the urgency that justifies a text. When the admin push/feed
infrastructure ships (backlog item below), flip to push-primary with SMS as
fallback — the dispatcher call is the only line that changes.

Content — actionable or it's just anxiety:

    EN: "{worker} hasn't checked in — {role_or_room} at {org}, shift started {n} min ago."
    FR: "{worker} n'a pas confirmé son arrivée — {role_or_room} au {org}, quart commencé il y a {n} min."

Deep-link to the assignment detail, where the coordinator's two real moves
live: contact the worker, or re-broadcast the shift. Do NOT auto-rebroadcast
— a worker stuck in a parking lot with a dead phone battery is not an open
shift, and only a human can tell.

Stamp `no_show_alerted_at` in the same transaction as the send. A later
check-in does not retract the alert (the coordinator should still know it
was late); the dashboard count self-heals as it already does.

Cancellation interplay: the existing cancellation path clears check-in
stamps — it must also clear the three new timestamps so a re-confirmed
assignment gets fresh reminders. Extend the same block that clears
`checked_in_at`.

---

## Tests (style of app/tests/, DB-backed)

Feature B:
- reminder fires exactly once: two consecutive ticks → one push, one stamp
- no reminder before start / after check-in / when already stamped
- checkout reminder only when checked-in, unfired, past end + delay
- stale candidate (start 4 h ago, fresh boot) → no send, no stamp
- worker without push subscription → no error, no stamp? **No — stamp anyway.**
  The attempt is the event; retrying a channel that doesn't exist every tick
  is a loop. Assert stamped-with-zero-sends.
- cancellation clears all three stamps

Feature A:
- alert fires once, after grace, to all active org_admins of the right org only
- tenant isolation: admin of org B never alerted for org A
- channels: SMS sent to admins with a phone (respecting nothing worker-side —
  admin alerts ignore `sms_opt_out`? **No — respect it**; STOP is STOP for
  any role), email sent to all; admin without phone → email only, no error
- late check-in after alert → no retraction, dashboard count drops
- B1-then-A ordering on one assignment: reminder at start, alert at start+grace

Scheduler:
- a raising check does not kill the tick (mirror the existing sweep test)

## Config summary

```python
checkout_reminder_delay_minutes: int = 10   # new
# existing, reused: checkin_grace_minutes = 15, replacement_sweep_interval_seconds
```

## Out of scope (backlog, on customer pull)

- **Admin notification infrastructure**: push-subscription UI for org_admins
  + an admin-capable in-app feed (today `RequestNotification` and
  `/notifications/feed` are worker-keyed). This is frontend work plus a data
  model decision (generalize the table vs. a separate admin feed) that must
  not be smuggled into an alerts spec. When it lands, Feature A flips to
  push-primary.
- Repeat/escalating reminders; SMS nudges to workers
- Auto-rebroadcast on no-show
- Tinted .xlsx export (CSV `status` column filters fine in Excel)
- Per-tenant tuning of grace/delay
