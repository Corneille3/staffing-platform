# Spec — SMS Reply-to-Claim + Coverage-Risk Tile

Written against the current codebase (verified 2026-08). Two features, ordered by value.
What already exists and must NOT be rebuilt:

- Outbound SMS: `app/notifications/sms_service.py` (Twilio REST via httpx), wired into
  `NotificationDispatcher._send_to_worker`. Bilingual bodies, urgency/lead-time gate
  (`_sms_broadcast_eligible`, `settings.sms_broadcast_lead_hours = 24`). Confirmations
  and cancellations always text.
- Atomic claim: `ReplacementService.claim` (§3) — single UPDATE keyed on `status='open'`,
  first caller wins, 409 `already_filled` for losers, idempotent double-tap, overlap
  guard via user-row lock, tenant scoping in the WHERE.
- Broadcast fan-out: `ReplacementService.broadcast` (§4) creates
  `RequestNotification` + `RequestResponse(NOTIFIED)` rows per recipient, then
  `dispatcher.notify_workers`.
- Dashboard: `AdminDashboardService.build` already computes KPIs, week fill-rate,
  roster-today.

Gaps this spec fills:
1. **Inbound SMS → claim** (reply "1" claims the shift). Nothing handles inbound today.
2. **Per-worker SMS opt-out + STOP compliance.** `User.phone` exists; no preference field.
3. **Coverage-risk tile** — forward 14-day gap view on the admin dashboard.

---

## Feature 1 — SMS reply-to-claim

### 1.1 Behaviour

Broadcast SMS gains a claim code. New body suffix (both languages, matching the
existing bilingual pattern in `notification_dispatcher.py`):

    EN: "Reply 1 to take it."
    FR: "Réponds 1 pour le prendre."

A worker replying **1** (or "oui"/"yes", case/whitespace-insensitive) to the StaffiG
number claims the most recent open request they were notified about. Replies:

| Situation | Reply (worker's language, fall back to bilingual) |
|---|---|
| Won (autopilot mode) | "You're in. {org} {date} {start}–{end}. Details: {short_link}" |
| Accepted (approval mode) | "Request received — pending coordinator approval. We'll text you when it's confirmed. Don't head out yet." |
| Lost race (409 already_filled) | "Sorry — that shift was just taken. We'll text you the next one." |
| Overlap 409 | "You already have a shift that overlaps this one." |
| Nothing claimable | "No open shift found for you right now." |
| STOP/ARRET | Twilio handles unsubscription; we mark `sms_opt_out=true` (see 1.5) |

**Ambiguity rule:** "most recent open request" = the newest `RequestResponse` row for
this worker with `status=NOTIFIED` whose request is still `status='open'`, notified
within the last `sms_claim_window_hours` (default 6). If two arrive close together,
last-notified wins — do NOT try multi-choice menus in v1 ("reply 2 for the other
shift" is a v2 concern; keep the race semantics dead simple).

### 1.2 Endpoint

`POST /api/v1/webhooks/twilio/sms` — **unauthenticated route, Twilio-signature
validated** (see 1.4). Twilio sends `application/x-www-form-urlencoded` with `From`,
`Body`, `MessageSid`, etc.

New file `app/api/v1/webhooks.py`:

```python
@router.post('/twilio/sms')
def inbound_sms(request: Request, db: Session = Depends(get_db)) -> Response:
    form = await request.form()             # From, Body, MessageSid
    _verify_twilio_signature(request, form) # 403 on mismatch
    reply = InboundSmsService(db).handle(from_number=form['From'], body=form['Body'])
    return Response(content=twiml(reply), media_type='application/xml')
```

Return TwiML (`<Response><Message>…</Message></Response>`) so the reply rides the
same webhook round-trip — no extra outbound API call, no extra cost record needed.

### 1.3 Service

New `app/services/inbound_sms_service.py`:

```python
class InboundSmsService:
    CLAIM_TOKENS = {'1', 'oui', 'yes', 'y', 'o'}

    def handle(self, from_number: str, body: str) -> str:
        user = self._user_by_phone(from_number)      # E.164 normalize both sides
        if user is None:
            return t('sms.unknown_number')           # never leak whether a number exists beyond this
        token = body.strip().lower()
        if token in {'stop', 'arret', 'arrêt', 'unsubscribe'}:
            user.sms_opt_out = True; self.db.commit()
            return t('sms.opted_out')
        if token not in self.CLAIM_TOKENS:
            return t('sms.help')                     # "Reply 1 to claim the latest shift…"
        req = self._latest_claimable(user)           # per 1.1 ambiguity rule
        if req is None:
            return t('sms.nothing_open')
        try:
            assignment = ReplacementService(self.db).claim(
                request_id=req.id, claimer_user_id=user.id, tenant_id=req_tenant_id(req))
        except HTTPException as e:
            if e.status_code == 409 and 'overlap' in str(e.detail):
                return t('sms.overlap')
            if e.status_code == 409:
                return t('sms.lost_race')
            raise
        return t('sms.won', org=..., date=..., start=..., end=...)
```

**Approval-mode branch:** before calling `claim`, check the request's assignment
mode (the same flag the app's accept flow branches on). Autopilot → `claim` as
above. Approval mode → record the acceptance through the SAME service path the
in-app "accept" uses (RequestResponse → ACCEPTED), reply `sms.pending_approval`,
and stop — no assignment is created. When the coordinator later decides, the
existing `notify_assignment_confirmed` covers the chosen worker (it already
always texts); add a `notify_not_selected` fan-out (push + one SMS, since these
workers explicitly raised their hand by replying 1: "That shift went to someone
else this time — thanks for offering.") so nobody who volunteered is left in limbo.

**Post-claim fan-out (both modes):** on successful assignment, dispatcher sends a
free web-push "filled" to every worker with a NOTIFIED response row (excluding the
winner) so app state updates immediately. No SMS to non-repliers — a StaffiG text
must keep meaning *opportunity*, not noise.

Key points:
- **Reuses `ReplacementService.claim` verbatim.** The webhook is just another client;
  the §3 atomicity already handles SMS-vs-app races. Do not duplicate any claim logic.
- Phone matching: store/compare E.164. Add a one-time migration normalizing existing
  `User.phone` values (strip spaces/dashes, prefix `+1` when 10 digits). Ambiguous or
  duplicate phone matches → reply `sms.unknown_number` and log a warning; never guess.
- `tenant_id`: resolve from the request's organization (same lookup `claim` does for
  scoping); a worker's SMS claim must not bypass tenant isolation.
- Record the inbound: add a `RequestNotification`-style audit row or a lightweight
  `InboundSms` table (`from_number, body, matched_user_id, action, request_id, created_at`).
  Coordinators will ask "did she really reply 1?" — keep the receipt.

### 1.4 Security

- **Twilio signature validation** on every webhook call: `X-Twilio-Signature` HMAC-SHA1
  over the full URL + sorted form params with `settings.twilio_auth_token`. Reject 403
  otherwise. (Implement by hand — ~15 lines — or add `twilio` SDK just for
  `RequestValidator`; the httpx-only pattern in `sms_service.py` suggests staying
  SDK-free.)
- Rate-limit by `From` (e.g. 10/min) to keep a spoofed-number brute force from
  spraying claims. Signature validation already blocks forged posts; this is belt+braces.
- The route lives OUTSIDE auth middleware; add it to the auth-exempt list explicitly.

### 1.5 Schema & config

Migration:
```sql
ALTER TABLE users ADD COLUMN sms_opt_out boolean NOT NULL DEFAULT false;
```
Dispatcher change (one line in `_send_to_worker`): skip SMS when `worker.sms_opt_out`.
Worker settings UI: a single toggle "Text me about shifts" (default on when phone set)
writing the same flag. Onboarding step 1 already collects nothing about phone — leave
onboarding untouched; the toggle lives in profile/settings.

Config additions (`app/core/config.py`):
```python
sms_claim_window_hours: int = 6
```

### 1.6 Tests (mirror existing test style in app/tests/)

- webhook: valid signature accepted, invalid 403
- reply "1" wins an open request → assignment created, TwiML "You're in"
- two replies racing app claim → exactly one assignment (reuse §3 race test harness)
- reply after filled → lost_race message, no state change
- overlap → overlap message
- unknown number → generic reply, nothing leaked
- STOP → `sms_opt_out=true`, dispatcher skips on next broadcast
- window expiry: NOTIFIED 7h ago → nothing_open
- approval mode: reply "1" → ACCEPTED response, pending_approval text, NO assignment
- approval mode: coordinator picks A → A gets confirmed text; B (who replied 1) gets not_selected
- post-claim: web-push "filled" reaches all NOTIFIED workers except the winner; no SMS sent to non-repliers

---

## Feature 2 — Coverage-risk tile (14-day forward view)

### 2.1 Behaviour

New card on the admin dashboard: **"Coverage — next 14 days"**.

Per-day counts (tenant-scoped, using the same `AccessScope` filters as
`AdminDashboardService._kpis`):

- `open` — StaffingRequest status `open`, work_date in [today, today+14)
- `pending_approval` — status awaiting coordinator pick (approval-mode requests with
  ≥1 acceptance, not yet assigned)
- `released` — worker-released shifts still unclaimed (replacement requests open)
- `covered` — assigned/confirmed in window (context bar, not a risk)

Roll-up header: "X uncovered shifts in the next 14 days" (open + released +
pending_approval), red accent when X>0 for the next 48h, otherwise moss.

### 2.2 API

Extend `AdminDashboardService.build` with:

```python
def _coverage_forward(self, scope: AccessScope, today: date) -> dict:
    # single grouped query: date_trunc day over the 14-day window,
    # counts by status bucket; return {'days': [{'date', 'open',
    # 'released', 'pending_approval', 'covered'}...], 'uncovered_total': n,
    # 'urgent_48h': m}
```

One SQL round-trip (GROUP BY work_date, status), not 14 queries. Buckets derive from
the same status enums the KPIs use — no new state, purely a read view. Add the block
to the existing dashboard payload under `coverage_forward`; frontend renders it as a
14-column mini bar strip + the roll-up line. No polling changes — it refreshes with
the dashboard.

### 2.3 Why this counts as "predictive"

It surfaces every future gap the system already knows about — worker-declared
absences (report-absence flow), self-serve releases, and unfilled posts — days ahead,
at the source. That is the honest version of the demo answer to "do you have
predictive visibility?" Pattern-based forecasting (day-of-week absence averages) is
explicitly out of scope until ≥12 months of production data exist.

### 2.4 Tests

- window boundaries (today inclusive, day 14 exclusive)
- tenant isolation: scope A never counts scope B's requests
- bucket correctness per status, released-then-claimed lands in `covered`
- empty window → zeros, tile renders "all covered"

---

## Sequencing

1. Migration (`sms_opt_out`) + dispatcher skip + settings toggle — smallest, ships alone
2. Webhook + InboundSmsService + tests — the reply-to-claim core
3. Broadcast body suffix ("Reply 1…") — ship LAST, only once 1–2 are live, so no
   worker is ever invited to reply into a void
4. Coverage-risk tile — independent, can parallel 1–3

Explicitly out of scope (v2+): voice IVR, multi-shift reply menus, per-channel
preference matrix, absence-pattern forecasting.
