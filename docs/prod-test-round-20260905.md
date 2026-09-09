# Prod test round — 2026-09-05 (local = EDT, UTC-4)

Prod: backend sha-dcc220a, migration 20260822_0025, frontend main 6e57764 (PR #71). RDS auto-restarted (7-day rule).
Coordinator in Chrome (MCP-driven): +coord2 (CPE Les Petites Étoiles). Workers on phone: +workera (Mael), +workerb (Eva), +smstest (SMS WORKER, only one with a phone).

## Block 0 — prep
- /health/ready: ready, db ok, migration at_head 20260822_0025 ✔
- Anonymous /fr/admin → 404 (Clerk auth.protect on non-doc request) — expected, not a bug.

## Block 1 — coordinator polling (PR #71) — ALL PASS
- Dashboard /fr/admin: _rsc refresh every 30.0 s (t=837→867), 27 KB each, all 200 ✔
- Hidden-tab pause (dashboard, before any request): 0 _rsc while hidden ✔
- Request 4f170dfc (Sept 8, 08–12, planned absence, urgency 2) published 08:26:49Z: EN DIRECT badge, AVISÉS 3 / ACCEPTÉS 0, "Mis à jour à l'instant" ✔
- Trio (requests/<id> + responses + assignments) every 5.5 s, 0 non-200 over 500+ calls ✔
- Worker accept (workera tapped 08:37 local) → row "accepté · 8:37" rendered 08:37:20, no F5; ACCEPTÉS 0→1; "Assign Mael" appeared ✔
- Detail tab hidden 99.5 s: 0 trio calls while hidden; immediate fetch on return (+0 s), cadence resumed ✔
- List /fr/admin/requests: immediate _rsc on becoming visible, next at exactly +60.0 s ✔
- Assign Mael: POST /assignments 201, refresh at +1.1 s, badge gone, Best-match gone, stepper 5/5, trio → 30.5/33.5/30.7 s idle ✔
- Offline notice (simulated outage on A's live page, fetch rejected 09:07:20–09:07:44): after 15 blocked calls the red "Connexion perdue — dernier état connu affiché." showed, last good data kept, badge kept; on recovery notice gone within 10 s, "Mis à jour à l'instant", calls 200 ✔

## Findings (none are polling bugs)
1. Tooling: claude-in-chrome read_network_requests mislabels RSC fetches as 503 — browser resource timing shows 200. Feedback drafted. Don't trust its statusCode.
2. SMS not sent for the Block 1 request — BY DESIGN: notification_dispatcher._sms_broadcast_eligible (urgency ≥3 or shift within 24 h). workera/workerb have no phone at all; +smstest is SMS-capable (E.164, sms_opt_out false).
3. PRODUCT GAP: coordinator phone can only be set at invite (/apf/coordinators/new); no edit path for coordinator or APF admin. +coord2 has phone=null → no-show alert would be email-only. Workaround used: Josy invites +coord3 with phone into CPE (active_admins needs no sign-up).
4. Cosmetic/UX: admin surface renders UTC in several places — "Assigned at: 2026-09-05 12:45", Activity feed time column ("13:05" for a 09:05 event) — while the live accepted row shows local "8:37". Inconsistent tz.
5. Cosmetic: list headline "1 request need your eyes" (pluralization).
6. Cosmetic: stepper preview card always shows "Urgent" chip regardless of urgency choice.
7. UX (worker): with three same-day requests from one org differing only by start time (09:25/09:30/09:35), the user could not tell A/B/C apart on the phone inbox and tapped extras (Eva accepted A, B, C; Mael accepted B, C). Title is only a small subtitle. Consider surfacing title/time more prominently.
8. PREEXISTING GAP: Best-match card (with a live "Assign <name>" CTA) still renders on an EXPIRED request, even after full reload — HideWhenAssigned hides only on assignment, not on terminal statuses (expired/cancelled). Clicking would 409. Also the stepper shows no terminal state for expired (Assign/Confirmed grey, no "Expired" marker) — only the brief chip says expired.
9. PR #71 minor gap: on a terminal transition observed live (expiry), the client pieces update (badge gone, tally, workflow card) but server-rendered pieces stay stale until F5 — brief chip still "responses received", "Edit request" pill still visible. Low severity.
10. GAP (small): attendance sweep writes no audit_log rows — the no-show alert (13:49) and the B1/B2 reminders leave no trace in the coordinator's Activity feed (only the assignment stamps change). Every other transition in the app is audited; consider `assignment.no_show_alerted` (+ reminder rows) for the "what happened on Thursday?" promise.
11. BUG (audit integrity): assignments are attributed to the WRONG coordinator. Frontend sends `assigned_by_user_id` from a looked-up org admin (request-workflow-card.tsx:479 `orgAdmin.id`, best-match-card.tsx:88 `orgAdminUserId`) instead of the caller; backend only falls back to `scope.user.id` when the field is null (assignments.py:38). Result on prod: Activity feed shows "Cordinator2 MultiOrg assigned · Block 2B/2C" although the click came from +coord2 (Kouam Eden). Fix: backend always uses scope.user.id when Clerk is enabled (ignore client value), frontend stops sending it. Also affects `assignments.assigned_by_user_id` + `assignment.created` audit rows.
12. Observation: after the assignment completes (check-out), the REQUEST stays `assigned` (brief chip + workflow chip) — lifecycle doc says assigned → completed. Decide whether the request should roll to completed.
13. BUG (ghost rows): GET /admin/substitutes returns 14 INACTIVE users (is_active=false, emails rewritten `+removed-<hash>` by the removal flow) out of 18; the coordinator's Substitutes table lists them with a Notify button each (rows like `henryevina+removed-a1be…`, `josycorneille3+testemail+removed-…`). Same ghost-row class as PR #42/#43 — `WorkerRepository.list_for_scope` (worker_repository.py:~50-60) has no `User.is_active` filter; `/admin/substitutes` → `WorkerService.list_for_scope` → repo. Fix: `.where(User.is_active.is_(True))` there (check other callers of list_for_scope first). (Reclassifies the earlier "14 of 17 never-onboarded" note.)
14. UX gap: the ranking table shows only the numeric match; eligibility reasons (e.g. "Organization not selected", "Already booked") are never surfaced on /admin/substitutes — no tooltip, no column. Reasons exist in the API payload. Block 3's coordinator check therefore holds at API level (OrgsTest Kouam eligible=false, reason 'Organization not selected') and shows as a bare 0 in the UI.

## Block 2 — SPEC_NOSHOW live (T0 = 09:05 local)
- A 4910b7b5 09:25–09:55 published 08:52:30 (AVISÉS 3) — expect escalation email ≤08:57:30; expiry sweep 09:25–09:30; replacement.unfilled in Activity
- B d7413e8a 09:30–10:00 published 08:52:41 (AVISÉS 3) — workerb accepts+assigned, never checks in; B1 push 09:30–09:35; no-show SMS+email 09:45–09:50
- C 44a9d7d8 09:35–09:55 published 08:53:30 (AVISÉS 3) — workera accepts+assigned, checks in 09:35; B2 push 10:05–10:10; then check-out → in/out/hours on coordinator card
- SMS to +smstest ×3 (same-day): RECEIVED ✔ (copy = "connect to the app to respond", no reply-1 hint — correct for coordinator requests)

15. RECLASSÉ — PAS un bug du rappel de sortie. Stamps exposés (sha-d3b3984) prouvent que le sweep a envoyé B2 pour D (14:24:36Z) et E (14:44:36Z) et même B1 à Mael (14:09:36Z). Cause: PushSubscription.endpoint est UNIQUE et `PushSubscriptionService.subscribe` upsert par endpoint → le dernier compte qui active les alertes sur un navigateur s'approprie l'abonnement (le téléphone de test était rattaché à Eva). Les pushs ciblés Mael partaient vers 0 appareil; seuls les broadcasts (aussi envoyés à Eva) arrivaient. Artefact du test multi-comptes sur un seul téléphone. Reste à valider avec un run propre (Mael ré-abonné) — optionnel.
17. Faiblesses mineures liées: (a) le toggle Alertes reflète l'état navigateur, pas la base → peut afficher ON alors que l'endpoint appartient à un autre compte; (b) le sweep ignore le retour {sent,failed} de send_to_user (stamp posé même si sent=0 — voulu, mais aucune trace).
16. BUG (worker Horaire + backend): a shift that ENDED without check-in (Eva, B 09:30–10:00) still shows on the worker's Horaire with live Start/End (check-in/check-out) controls. Frontend: `worker/schedule/page.tsx:185` `showCheckIn = request.work_date === todayIso` (no end-time check). Backend: `AssignmentService.check_in` has status + idempotency guards only — NO time guard, so a post-shift check-in is accepted and worked_hours would derive from a check-in after the end. claim()/report_absence/release all refuse ended shifts; check-in/out never got the guard — and neither did AssignmentService.create (a coordinator can assign a shift that already ended). Fix: hero shows an "ended — not checked in" state after end (+ small tolerance); backend 409s check-in once shift_end + tolerance has passed (tolerance = product call), check-out requires a check-in.
18. PRODUCT GAP: a check-out that is never tapped has NO follow-up after the single B2 push. Worker: shift stays in the Horaire hero (Done button live until midnight, late check-out accepted), then slides to History next day as `confirmed` forever, never `completed`, no hours. Coordinator: card says "Check-out: not recorded yet", no alert, no dashboard count (the sweep has no missing-check-out pass), payroll CSV blank for that shift; only remedy = manual hours correction with reason. Contrast: missing check-IN gets reminder → SMS/email alert → dashboard count. Suggest: auto-close at scheduled end + delay with an "unconfirmed hours" flag, plus a coordinator counter.

### Block 2 progress
- 08:54 (12:54Z): replacement.escalated for A, B, C at first sweep after publish ✔ (Activity feed). Escalation emails "Quart non comblé — 2026-09-05 HH:MM–HH:MM (CPE…)" ×3 at 12:54:33Z, each to +coord2 AND +coordorg (CPE had a 2nd active admin = 'Cordinator2 MultiOrg') ✔ (Gmail)
- 09:01–09:04: workerb accepted B, C, A; workera accepted C, B
- 09:05: assigned Eva→B, Mael→C via UI (both "confirmed", badges dropped) ✔
- Coordinator name fixture shows as "Cordinator2 MultiOrg" (typo in fixture, not a bug)
- ~09:15: Josy invited +coord3 (same phone as +smstest — allowed, users.phone not unique; inbound reply-1 for that number is dropped while both exist) ✔ — not visible in the org-scoped coordinator Activity feed (tenant-level event), /coordinators is APF-only (403 for org_admin)
- 09:29 (13:29Z sweep): A EXPIRED ✔ (API `expired`; page badge dropped live); Activity: `replacement.unfilled · Block 2A` at 13:29 ✔; EXPIRED KPI 4→5 ✔. Expiry filter = _SEARCHING_STATUSES + start <= now (accepted-but-unassigned still expires) ✔
- Sweep phase observed: :54/:59/:04/… → B1 push for Eva expected at the 13:34Z tick (~09:34), no-show alert for B (start 13:30 + 15 grace = 13:45) at the 13:49Z tick (~09:49)
- ~09:34 (13:34Z tick): B1 clock-in reminder push received on Eva's (workerb) device ✔ (user report; stamp not exposed by API). Note: GET /assignments ignores ?request_id= (returns all rows) — API nit, not user-facing
- 09:37 (13:37:03Z): Mael checked in on C with geolocation ✔; coordinator card: "Checked in at 2026-09-05 13:37 · location recorded" / "Check-out: not recorded yet" (UTC display again → finding #4). B still unchecked as planned.
- Next: B no-show alert at the 13:49Z tick (~09:49); C ends 13:55 → B2 check-out push at the 14:09Z tick (~10:09)
- 09:49 (13:49Z tick): B no-show SMS received on coordinator phone (+coord3) ✔; B detail: "Not checked in — shift started 20 min ago" ✔; dashboard "1 not checked in today" + Eva NOT CHECKED IN ✔; Today panel shows C ASSIGNMENT·CHECKED_IN and A REPLACEMENT·UNFILLED ✔. No-show EMAIL "Arrivée non confirmée — Eva Kouam (CPE Les Petites Étoiles)" at 13:49:35Z to ALL THREE active CPE admins (+coord2 Kouam, +coordorg Cordinator2, +coord3 Cordinator3) ✔ with deep link (Gmail search, inbox/unread — user couldn't spot them under the alias)
- Activity feed has NO row for the no-show alert (13:49) — newest is the 13:37 check-in; see audit note below
- Deliverability note: all Staffig mails (noreply@staffig.kouamvision.com) landed INBOX/UNREAD but the user could not see them in the Gmail client until searching by sender — likely filed under a non-Primary tab (Updates/Promotions). Clerk mails (notifications@kouamvision.com) were visible. Consider checking Gmail categorization / headers for transactional mail; coordinators may miss escalation + no-show emails the same way.
- 10:01 (14:01:47Z): Mael checked OUT manually (before the B2 tick) with geo → assignment COMPLETED, worked_hours 0.41; coordinator card: "Checked out at 2026-09-05 14:01" / "Worked: 0.41 h (scheduled 0.33 h · variance +0.08 h)" / "Mael Kouam · completed" ✔
- B2 check-out reminder push: NOT OBSERVABLE this round (C checked out before end+10; B never checked in). Same tick/code path as B1 which passed. Optional: quick request D to observe it.
- 10:08:38: D 528380e3 published 10:09–10:11 (AVISÉS 3, live) to observe B2: Mael accepts+assigned, checks in, no check-out → end 14:11Z + 10 = 14:21Z → B2 push expected at the 14:24Z tick (~10:24)
- 10:09: Mael accepted D; assigned via UI 10:09:32 (confirmed). Awaiting check-in (no check-out) → B2 push at the 14:24Z tick
- 10:10 (14:10:26Z): Mael checked in on D with geo, no check-out → B2 push expected ~10:24 (14:24Z tick)

## Block 3 — onboarding step 4 (worker org selection)
- Josy invited +orgstep4 (tenant-level; invite has no org field by design) ~09:42; sign-up + 4-step onboarding done by user with only 'Multi Organisation' ticked (CPE unchecked)
- 10:11: GET /admin/substitutes?rank_against_request_id=<D> as CPE coordinator → OrgsTest Kouam: eligible=false, score 0, single reason 'Organization not selected [missing]' ✔ (backend gate)
- Worker side (user report 10:18): Organismes step appeared with both orgs (CPE + Multi Organisation) ✔; chose Multi Organisation only; Disponibilités tab shows both orgs in the picker ✔. Toggle → Saved flash → persisted after reload ✔ → coordinator re-rank 10:27: "Organization not selected" gone, now score 80 with only "Missing: Montreal" (Toronto profile) ✔ — gate reads live WorkerOrganization rows (matching_service.py:95-101), no cache. Block 3 PASS. (User first toggled as Mael by mistake → Mael now restricted to CPE; undo in cleanup.)
- 10:12–10:15: ranking page as CPE coordinator: OrgsTest Kouam listed at match 0 ✔ (reason only in API — finding #14); 14 tombstoned rows visible (finding #13)
- B2 on D: user saw a Mael push from ~10:09 (assignment confirmed); no clear 'Terminé?' at 10:24 — INCONCLUSIVE → retry with E
- 10:32:42: E 8f2c069e published 10:33–10:34 (AVISÉS 3) → end 14:34Z + 10 = 14:44Z → B2 expected at the 14:44Z tick (~10:44)
- 10:33: Mael accepted E; assigned via UI 10:33:17 (confirmed). Awaiting check-in.
- Reminder analysis: _freshness = 2×300 s + 15 min = 25 min (D's due 14:21Z was inside the window at the 14:24Z tick → timing can't explain a miss). Push tags: B1/B2 share 'attendance-<worker_id>' (a newer attendance nudge replaces an older unread one — intended?), request pushes 'request-<id>' → no cross-collapse. checkout_reminder_sent_at is not exposed by the API.
- 10:33:31Z→ E: Mael checked in during the shift, no check-out → B2 'Terminé?' expected at the 14:44Z tick (~10:44). D also still open (checked in, no out) — if D's reminder was never stamped, ticks retry until 14:46Z.
- 10:44 tick passed: user reports only assignment pushes (D 10:09, E 10:33) on Mael's device, no 'Terminé?' seen yet. Code path verified (candidates query, shift_end_utc tz-aware, freshness 25 min, test coverage) → suspect delivery/tray (tag replacement, D's 10:24 possibly missed) or push send failure; checkout_reminder_sent_at not exposed so server-side proof needs logs. Asked user to check tray + Android notification history.
- 10:52: B2 VERDICT — FAIL/OPEN. No "Terminé?"/"Done?" on Mael's device for D (due 14:21Z; ticks 14:24/29/34/39/44 all inside the 25-min window) nor E (due 14:44Z; ticks 14:44/14:49). Same device received assignment pushes at 14:09 and 14:33; Eva's B1 "Pointage" (sibling path) arrived 13:34. Code path + test look correct → prod runtime cause; needs backend logs (look for 'Check-out reminder pass failed') or exposing checkout_reminder_sent_at. Finding #15.

## VERDICT (11:08)
- Block 1 (coordinator polling, PR #71): PASS — 30 s dashboard, 60 s list, 5 s trio, hidden pause + fetch-on-return, live accept row, assign → 30 s idle, offline notice + recovery.
- Block 2 (SPEC_NOSHOW live): §C escalation (12:54Z) + expiry (13:29Z) PASS · §B1 check-in reminder PASS (Eva 13:34Z) · §A no-show SMS + email to all active admins (13:49Z) PASS · **§B2 check-out reminder FAIL** (never delivered, D and E) → finding #15.
- Block 3 (worker org selection): PASS — Organismes step, picker, Saved flash + persistence, coordinator gate flips live.
- SMS broadcast for same-day requests: PASS (+smstest ×5 incl. D/E). Planned-absence 3 days out: no SMS by design.

## Bugs to fix (priority order)
1. ~~#15~~ reclassé (artefact multi-comptes) — voir #17 pour les deux petites améliorations.
2. #11 assignment attributed to the wrong coordinator (client-supplied assigned_by_user_id = first org_admin) — backend must use scope.user.id; audit integrity.
3. #13 ghost rows: 14 tombstoned users listed in /admin/substitutes with Notify buttons — add is_active filter in WorkerRepository.list_for_scope.
4. #3 coordinator phone has no edit path (invite-only) → no-show SMS unreachable for existing coordinators.
5. #16 ended shift still offers Start/End on worker Horaire + no time guard on check-in (backdated attendance possible).
6. #8 Best-match card + Assign CTA rendered on expired requests.
Then: #4 UTC timestamps on admin surface, #10 attendance events not audited, #14 eligibility reasons not surfaced in ranking table, #9 stale server bits on live terminal transitions, #12 request stays `assigned` after completion, #7 worker inbox can't distinguish same-org same-day requests, #5/#6 copy nits, #1 tooling (extension 503 mislabel), deliverability note (Gmail tab filing).

## Cleanup owed
- Phone (Mael): check out D and E; Disponibilités → toggle CPE back OFF (was open-to-all before the mistaken toggle).
- Josy: remove +coord3 (restores inbound reply-1 for the SMS worker's number); remove +orgstep4 if not wanted.
- Coordinator: cancel Eva's dangling confirmed assignment on B (never checked in) — or keep as a no-show record.
- Close the extra Claude Chrome tab; STOP RDS at session end:
  aws rds stop-db-instance --region ca-central-1 --db-instance-identifier apf-staffing-platform-prod-postgres
- 11:55 (après deploy sha-d3b3984, stamps exposés): D checkout_reminder_sent_at=14:24:36Z, E=14:44:36Z, D checkin_reminder_sent_at=14:09:36Z (avant pointage 14:10:26), B(Eva) checkin 13:34:34Z + no_show 13:49:35Z. → le sweep a ENVOYÉ B2 deux fois à l'heure prévue; échec = livraison/abonnement, pas le code. Note: B(Eva) checked_in 15:34:14Z / out 15:34:18Z = l'utilisateur a cliqué Start/End sur le quart terminé → preuve concrète du #16 (pointage post-fin accepté, worked_hours≈0).

## Run propre F (validation #15/#17)
- 12:02:58: F 5bcc46e6 'Éducatrice · test F' 12:03–12:04 publié (AVISÉS 3). Plan: Mael réactive les alertes (ré-abonnement) → accepte → assigné → 'Vous êtes confirmé' doit apparaître dans le TIROIR → pointage → 'Terminé?' au tick 16:14:30Z (~12:14)
- 12:06:52: Mael (alertes réactivées) assigné sur F → push 'Vous êtes confirmé' envoyé; attendu dans le tiroir (preuve du ré-abonnement)
- 12:08: 'Vous êtes confirmé·e pour Éducatrice · test F' VU DANS LE TIROIR de Mael ✔ → l'endpoint est bien rattaché à Mael après réactivation des alertes (confirme l'explication de #15). Mael a pointé l'entrée.
- 12:08:37: F checked_in_at 16:08:05Z; checkin_reminder_sent_at 16:07:31Z (B1 envoyé à Mael 34 s avant son pointage). Phase des ticks décalée par le reboot du deploy: ~:x2:30/:x7:30 → 'Terminé?' F (dû 16:14:00Z) attendu au tick 16:17:30Z (~12:17)
- 12:10: 'Pointage' (B1, 16:07:31Z) ET 'Vous êtes confirmé·e pour Éducatrice · test F' vus dans le panneau de notifications de Mael ✔ — B1 fonctionne pour Mael dès que l'endpoint lui appartient. Reste 'Terminé?' au tick ~16:17:30Z.
- ~12:17: 'Terminé au CPE Les Petites Étoiles? Touche Terminé pour enregistrer tes heures.' REÇU sur le téléphone de Mael ✔ → B2 VALIDÉ en run propre. #15 définitivement clos: artefact multi-comptes (endpoint push unique par navigateur, upsert par le dernier compte à activer les alertes).
- 12:19: F checkout_reminder_sent_at = 16:17:31Z → envoyé au tick prévu, reçu. SPEC_NOSHOW §B2 PASS (run propre). Round terminé.
