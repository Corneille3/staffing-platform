# Spec — Live-ish Coordinator Views (Polling)

Written against the current codebase (verified 2026-09). Kills the F5: a
coordinator watching a broadcast sees responses arrive without refreshing.

## Pattern already in the codebase (extend, don't invent)

`worker/requests/[id]/accepted/page.tsx` already polls the release status
every 5 s with a `setInterval` in a `useEffect`, swallowing transient fetch
errors ("no realtime — §1 polling"). This spec applies the same idea to the
admin side, upgraded into ONE shared hook so the behaviour is uniform.

## The hook

New `frontend/src/hooks/use-polling.ts`:

```ts
usePolling(fetcher, { activeMs, idleMs, isActive })
```

Behaviour:
- Calls `fetcher` immediately on mount, then on an interval.
- Interval = `activeMs` when `isActive()` is true, else `idleMs`.
- **Pauses entirely when the tab is hidden** (`document.visibilityState`),
  and fires one immediate fetch on becoming visible again — the coordinator
  flipping back to the tab sees fresh data at once, and a wall of parked
  admin tabs stops hammering the API.
- Transient fetch errors: keep the last good data, keep polling (same
  stance as the worker page). After 3 consecutive failures, show the
  existing offline/toast affordance if one exists; never blank the page.
- Cleans up on unmount. No overlapping requests: skip a tick if the
  previous fetch is still in flight.

No new dependencies. Reuse the app's existing fetch wrapper (auth headers,
locale) — whatever the pages call today.

## Where it applies, and at what cadence

| View | activeMs | idleMs | "active" means |
|---|---|---|---|
| Admin request detail (`admin/requests/[id]`) | 5 000 | 30 000 | request status is OPEN or RESPONSES_RECEIVED |
| Admin dashboard (`admin`) | — | 30 000 | always idle cadence — it's an overview, not a race |
| Requests list (`admin/requests`) | — | 60 000 | idle only |

The request detail is the page that matters: during a live broadcast
(OPEN / RESPONSES_RECEIVED), responses land within 5 s. Once ASSIGNED /
EXPIRED / CANCELLED the page drops to the 30 s idle tick (state can still
change server-side — sweep expiry, another admin acting — so it never stops
entirely while mounted).

The dashboard tick refreshes, for free, everything already on it: the
coverage tile, `not_checked_in_today`, KPIs, roster.

## UI details that make it feel right

- **No spinners on background refreshes.** Initial load may show the
  existing skeleton; subsequent polls swap data in place. A page that
  flashes every 5 s reads as broken.
- Preserve scroll position and any open UI state (expanded rows, menus) —
  i.e. update via state, never remount the tree.
- Optional but cheap: a subtle "Mis à jour il y a Xs / Updated Xs ago"
  timestamp near the responses list, so the coordinator trusts the page is
  alive without a refresh button. If added, wire it to the last successful
  fetch, not the last attempt.
- The manual refresh button (if any) stays — it also resets the timer.

## UI alignment — request detail page (make the ad true)

Ad 14 ("Watch the hands go up") shows a stylized target for
`admin/requests/[id]` during a live broadcast. While wiring the polling,
align the real page to it — the ad then becomes a literal screenshot of the
product, which is worth more than any disclaimer:

- **"Live" badge** next to the request title while status is OPEN or
  RESPONSES_RECEIVED (pulsing dot, terra accent). Disappears on terminal
  states.
- **Two tally cards** above the responses list: `{n} notified` (count of
  RequestNotification / NOTIFIED rows) and `{k} accepted` (ACCEPTED rows).
  Both update on every poll tick.
- **Response rows** show name, qualifications line, and an **accepted-at
  time** (`responded_at`, already stored) — "accepted · 6:04". New rows
  animate in subtly (fade/translate ≤300 ms); existing rows never jump.
- **Waiting state** while zero responses: small spinner + "Waiting for
  responses… / En attente de réponses…" replacing the empty list — not a
  blank area.
- Reuse existing i18n patterns; add the four new strings (live, notified,
  accepted · {time}, waiting) to en.json/fr.json.

Scope guard: this is a restyle of data the page already fetches — no new
endpoints. If `responded_at` isn't currently serialized in the responses
payload, add the field to the existing schema rather than a new call.



- SSE / WebSockets. Revisit only if a customer measurably needs sub-5 s
  latency; the single-process deployment (which also hosts the scheduler)
  makes long-lived connections an operational cost this need does not justify.
- Any backend change. The endpoints already exist; this is frontend-only.
- Push-triggered refetch (tie-in with future admin push infra) — natural
  later upgrade: on push received → immediate fetch. Note it, don't build it.

## Tests (frontend, style of existing component tests)

- fetches on mount, then at activeMs while active, idleMs after terminal state
- hidden tab: no fetches; on visible: immediate fetch then resume
- in-flight guard: slow response + due tick → no overlapping calls
- 3 transient failures: last good data still rendered, polling continues
- unmount clears the interval (no state-update-after-unmount warnings)
