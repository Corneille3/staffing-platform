# CLAUDE.md

Working reference for Claude on the APF Staffing Platform. Supersedes older planning docs.

## ⚡ Session pickup

Run on every new session:
```
git -C /home/corneille3/STAFFIG-PLATFORM status
git -C /home/corneille3/STAFFIG-PLATFORM log --oneline -10
```
Disk state is authoritative — stale VS Code buffers have caused phantom "missing code" reports.

**Last shipped (newest first):**
- **Findings sweep + first-come-first-served (2026-09-10 → 2026-09-12, PRs #76–#88, prod backend `sha-0535436`, migrations unchanged at `0025`, 454 backend tests, 32 vitest):** all verified live in the user's Chrome. **#76/#77** removed (tombstoned) accounts hidden everywhere: `WorkerRepository.list_for_scope(include_inactive=False)`, `CoordinatorService.list_for_tenant` active-only, `GET /workers?include_inactive=true` opt-in used only by the coordinator request detail (id → name lookup) — prod went 18 → 4 substitutes, 8 → 3 coordinators. **#78** `shiftTime()` in `lib/shift-time.ts`: activity rows, "accepté · HH:MM", Horaire check-in→out in America/Toronto (was UTC). **#79–#81** expired/closed request = no Best-match, Rank, Cancel, Accept/Decline or review cards (`lib/request-status.ts` CLOSED_STATUSES, `HideWhenClosed`), sand notice instead; **#80 hotfix** — the page had *called* a helper imported from a `"use client"` module and crashed every `/admin/requests/[id]` for ~10 min (rule: pure helpers live in `lib/`). **#82** coordinator phone self-service: `GET/PATCH /auth/profile` + "Mon profil" sidebar card (number, SMS switch, Saved flash) — end-to-end no-show SMS received on the coordinator's own number. **#83** Horaire hero = next shift that still matters (`lib/schedule-hero.ts`; a missed shift no longer hides a second same-day shift). **#84** derived attendance state (`app/core/attendance.py`: upcoming / due / on_shift / unclosed / completed / missed on `AssignmentRead.attendance`) — worker history "Arrivée non enregistrée", tracking-page ended notices, coordinator "no-show · alert sent HH:MM", Cancel assignment hidden once over. **#85** activity rows name the removed person (`ActivityRow.subject`, payload name/email fallback), removed workers keep their name on request detail + History, `shiftDateTime()` for Assigned/Checked in/out/Viewed stamps. **#86–#88** "First come, first served" checkbox on the stepper (step 3 → Dispatch): publish keeps the request OPEN, `claim()` + inbound SMS "1" accept coordinator requests with `auto_assign`, SMS says "Réponds 1 pour le prendre"; coordinator detail hides pick controls; **#87** the stepper's debounced PATCH effect lists deps by field — `auto_assign` was missing (checkbox never saved); **#88** `_user_by_phone` prefers the substitute when a number is shared with a coordinator. **Process changes:** verification happens on prod in the user's Chrome (local = pytest/vitest/tsc only); live rounds keep ≤5-min gaps; the user runs push / `gh pr create` / merge / deploy, Claude commits locally and hands over one plain command per step; `GH_TOKEN` shadowing is gone (no more `unset`).
- **Prod test round + findings batch (2026-09-05 → 2026-09-09, PRs #72–#75, prod backend `e9d59ec`):** round scripted in `docs/prod-test-round-20260905.md` (polling, SPEC_NOSHOW, org selection — all pass). **#72** `AssignmentRead` exposes the sweep stamps (`checkin_reminder_sent_at`, `checkout_reminder_sent_at`, `no_show_alerted_at`) + CI test clamp fix. **#73 (#16)** attendance time guards: check-in 409 at scheduled end, check-out 409 at end + 60 min (`checkout_cutoff_minutes`), assign 409 on ended shift; Horaire shows "Arrivée/Sortie non enregistrée" instead of Start/Done. **#74 (#18)** "today" derived in `settings.shift_timezone` everywhere (`timeutil.shift_today/shift_local_date`, frontend `shiftDateKey/shiftClock`) — dashboard roster, coverage, week strip, activity day groups no longer flip to UTC's tomorrow after 20:00. **#75 (#11)** `POST /assignments` always sets `assigned_by = caller`; client stops sending it.
- **Coordinator polling SHIPPED (2026-08-29, PR #71 merged to `main` = `2159b40`, frontend-only → Vercel; no backend change, migrations unchanged at `0025`):** Built `SPEC_COORDINATOR_POLLING (2).md`. New shared hook `frontend/src/hooks/use-polling.ts` (fetch on mount, `activeMs`/`idleMs` by `isActive()`, pauses while the tab is hidden + immediate fetch on return, in-flight guard, keeps last good data through failures, `refresh()`). `/admin/requests/[id]` stays a server component wrapped in `RequestLiveProvider` (`components/request-live.tsx`, polls request + responses + assignments at 5 s while OPEN/NOTIFIED/RESPONSES_RECEIVED, 30 s once terminal); client pieces: `LiveBadge` (pulsing terra, via new `PageFrame.titleAddon`), `WorkflowTracker` (stepper moved out of the page), `ResponseSummaryPanel` (Notified = alerted total, "Updated Xs ago" on last *success*, red offline notice after 3 failures), `AssignmentPanel`, `HideWhenAssigned` (Best-match). `RequestWorkflowCard` reads the live context when present: "accepted · HH:MM" / "declined · HH:MM" from `responded_at`, fade-in for rows that arrive after mount, waiting state (spinner + "En attente de réponses…") on an empty live list, `live.refresh()` after each action. Dashboard (30 s) and requests list (60 s) use `PollingRefresh` = `router.refresh()` in a transition (RSC soft refresh, no skeleton), `AdminRequestsList` re-adopts the refreshed head and keeps cursor-loaded pages. i18n namespace `admin.live` (EN/FR) — rest of the admin still hardcoded English. **Frontend test runner introduced**: vitest + testing-library (`cd frontend && npm test`, 6 hook tests). Full 7-block manual round walked locally by the user (live updates without F5, hidden-tab pause, backend outage + recovery, idle cadence, dashboard/list auto-refresh, FR strings) — all pass. Noted en route (preexisting, out of scope): a server page hard-fails ("fetch failed" in `lib/api.ts`) if the backend is unreachable at initial load; polling itself survives. Prod hand-check of the live page still owed.
- **Fix batch DEPLOYED + fully verified on prod, release-flow reload fixes (2026-08-08/09, PRs #50–#53, prod backend `sha-9227904`, migrations through `0020`, 295 backend tests):** Deployed the #46–#48 batch and walked every fix live on prod — all confirmed: capital-email invite → lowercase sign-in works; hand-off shows worker "Cédé" chip + coordinator Assignment panel "Released — the substitute handed this shift off. It's being covered through a replacement request." Then fixed issues surfaced during verification. **PR #50**: admin request list ordering was soonest-shift-date (a just-created far-out request sank to the bottom) → now **newest-created first**, urgent-unassigned pinned on top; giver tracking-page timeline **hidden once released** (was falling back to "Coordinateur examine", contradicting the released message); new **`app/scripts/reset_staffing_data.py`** (wipes requests/assignments/responses/notifications/requirements, keeps tenants/orgs/users — for clean local test rounds: `docker compose exec backend python -m app.scripts.reset_staffing_data [--tenant <slug>]`). **PR #51**: between release and claim, revisiting a released shift (new tab/back/History) lost the client-only "released" state and re-offered the release CTA (→409) → new `GET /requests/{id}/active-replacement` + accepted-page hydrates the "waiting for a claim" state (alerted count + Cancel) on load. **PR #52**: after a claim the CTA still leaked because `_retire_giver_response` (both hand-off paths) only retired an ACCEPTED response — a giver who got the shift by **claiming** holds a NOTIFIED response → now retires ANY non-terminal status (NOTIFIED/VIEWED/ACCEPTED→WITHDRAWN), leaving DECLINED/WITHDRAWN alone (proven by a two-hop test). **PR #53**: release-specific terminal copy — a handed-off shift now reads "Vous avez cédé ce quart — il est maintenant couvert." (vs the generic withdrawn copy), distinguished by the caller's **assignment status = RELEASED** (the authoritative "do I still hold this" signal). RDS is private + no SSM, so prod can't be wiped easily → iterate locally with the reset script; prod for final real-infra checks. Detail: memory `e2e-findings-20260806`. **Still owed (housekeeping, no bugs):** rotate `db_password`/`clerk_secret_key`, buy Twilio number, remove stale `+workerC` substitute row. Open UX notes: push opt-in buried on Alertes tab, no iOS install-first hint, reporter's home shows no absence-report trace.
- **Prod test round on the blank slate + fix batch (2026-08-06/07, PRs #46–#48, migrations through `0020`, 291 backend tests — DEPLOYED + verified 2026-08-09 above):** Walked the full owed test round on the clean slate (invite chain → dispatch → 3 self-serve replacement paths → PWA push on real Android + iPad). **PWA lockscreen push verified on both devices** (opt-in lives on the worker *Alertes* tab). Four findings; #4 fixed live 2026-08-06 as **PR #46** (suspended tenants vanished from the console — PR #42's `is_active` filter also caught suspend's `is_active=False`, making Reactivate unreachable; fix = new `TenantStatus.REMOVED` terminal state + migration `0019`, console filters `status != REMOVED`). The rest fixed 2026-08-07: **PR #47 (`fix/email-case-insensitive`, migration `0020`)** — Finding #2: invites typed with a capital sent the invitee to `/not-invited` (Clerk lowercases sign-in; `/auth/sync` compared exactly). `NormalizedEmail`/`NormalizedEmailLoose` schema types lowercase all 5 invite paths at the boundary; `/auth/sync` matches on `func.lower(User.email)`; migration `0020` lowercases existing rows, tombstoning the inactive side of a case-collision first (the live `+workerC`/`+workerc` pair). **PR #48 (`fix/replacement-correctness`)** — Finding #1 (stale truth after hand-off, **user chose "Released & handed off" model**): on fill (auto claim + managed assign) the giver's ACCEPTED response on the original → WITHDRAWN, `get_by_request` treats RELEASED as dead; worker tracking page stops re-offering release, worker history gains a `released` chip (*Released*/*Cédé*), coordinator detail shows "Released — covered through a replacement request." Plus Finding #3 belt-and-suspenders — the report_absence/release past-shift guards already existed (finding was ~false alarm), but `claim()` had none → now 409s an ENDED shift (keyed on end, mid-shift stays legal) + `replacement_status` derives `expired` on read; fixed a stale hardcoded `date(2026,7,1)` in the concurrency test. **Findings memory: `e2e-findings-20260806`.** UX notes still open (not bugs): push opt-in buried on Alertes tab, no iOS install-first hint, reporter's home shows no trace of their absence reports. **Still owed:** rotate `db_password`/`clerk_secret_key`, buy Twilio number, remove the stale `+workerC` substitute row.
- **Lifecycle-gaps session + full prod cleanup (2026-08-05, PRs #40–#44 all merged + DEPLOYED, backend `sha-cabc31b`, migrations unchanged at `0018`, 277 backend tests):** PR #40 (double-booking guard, below) merged + shipped as `sha-8c1175b`. Then a prod cleanup to a single profile exposed a family of "created but never destroyable" gaps, fixed live: **PR #41** tenant Remove restored — `RemoveNetworkButton` had been orphaned when the `/platform` console replaced the old networks page (backend cascade alive, no UI called it); rebuilt in the console's idiom on active+suspended rows (own-workspace guard kept) and `DELETE /networks/{id}` upgraded `require_platform_admin` → `require_platform_operator_mfa` (was the least-guarded, most-destructive lifecycle route; `support` now 403s — test added). **PR #42** removed tenants ghosted in the console (soft-delete leaves `status` untouched; `tenants_overview` didn't filter `is_active`) → filter added, removal test pins disappearance. **PR #43** organization removal — orgs had NO removal at all (no route, no UI): `OrganizationService.remove()` soft-delete one level below tenant removal (org + its `OrganizationMemberships` deactivated, **people stay active**, history preserved, 409 while live requests exist — drafts/terminal don't block), `DELETE /organizations/{id}` (network-admin), `is_active` filters in `list_for_scope` + APF snapshot org rows (ghost-row lesson applied preemptively), `RemoveOrganizationButton` on `/apf/organizations` (rows un-nested from their `<Link>` wrapper). **PR #44** `/admin` "← Network view" back-link — the `/apf` → Coordinator-view bridge was one-way; role-gated on `isMultiOrgRole` so org_admins never see it. **Cleanup executed** (detail: memory `prod-user-cleanup-plan`): removed test tenants (Tenant2/`tenant-ewsl`, EGK Solution Inc.), CPE-era coordinators/workers, `+support` operator, orphan Clerk accounts — final prod state = 1 human (Josy) + APF tenant + empty CPE org as test fixture; Housekeeping scan clean both sides. **Gap noted en route:** coordinator requests never auto-expire past `work_date` (only the replacement sweep expires things) — Garderie removal was blocked by two May-era "live" requests until hand-cancelled; candidate small fix. **Still owed:** thorough prod test round (now on the blank slate), rotate `db_password`/`clerk_secret_key`, buy Twilio number, real-device PWA test.
- **Double-booking guard (2026-07-30, PR #40 — merged + deployed 2026-08-05 as `sha-8c1175b`):** One human, one place. Neither `assign()` nor the atomic `claim()` checked whether the worker already held an overlapping confirmed shift, and booked workers stayed "eligible" (kept getting broadcast pings, inflated reach counts). Three layers, backend-only, no migration: **(1)** `AssignmentRepository.overlapping_active_for_worker()` — active (`PENDING_CONFIRMATION`/`CONFIRMED`) assignments overlapping a shift window; deliberately **cross-tenant** (the only unscoped query in that repo — intentional); `CANCELLED`/`RELEASED`/`COMPLETED` free the slot; midnight-crossing shifts (`end_time <= start_time` per `timeutil` convention) compared as real datetimes via `shift_start_utc`/`shift_end_utc`; touching endpoints (8–12 / 12–16) don't conflict. **(2)** `assign()` (managed mode) 409s on overlap; `claim()` (auto mode) row-locks the claimer's user row (`FOR UPDATE`) before the overlap check so same-worker simultaneous taps on two overlapping releases serialize — different claimers lock different rows, first-claim-wins atomicity untouched (50-thread race test still passes); `exclude_request_id` keeps the winner's double-tap idempotent. **(3)** new `Already booked` eligibility reason in `MatchingService` (only when `db` present) — booked workers drop out of publish/renotify broadcasts, reach estimates, and ranking; claim route's tap-time eligibility re-check rejects booked claimers. Anti-gaming side effect (tested): a giver whose released shift is unclaimed still holds it → blocked from same-time shifts until someone claims. 10 new tests (`test_overlap_guard.py`), 268 pass. Known minor: claim-conflict 409 detail is worker-facing English ("You already have a shift that overlaps this one.") — fold into a future i18n pass.
- **StaffiG marketing LIVE on kouamvision.com (2026-06-11, `kouamvision-website` repo PRs #8–#10 — zero changes to this repo):** User dropped the plan to buy a dedicated domain; StaffiG is now marketed on the company site, Korneva-pattern integration. **PR #8**: `/work/staffig` page (1:1 port of `Marketing.html` from `StaffiG.zip`, exact design tokens, CSS scoped under `.sg`), `/work` index listing Korneva + StaffiG, homepage Featured-work card, footer/sitemap, and a new `staffig` intent on the shared contact form (`/contact?intent=staffig`, org-type/phone/time-window fields, per-product Resend emails). **PR #9**: v2 redesign from `Marketing v2.html` in the updated `StaffiG (1).zip` — gradient hero with sign-in card (links to `staffig.kouamvision.com/sign-in`; invitation → contact form) + dual iPhone mockups + pings, new "Every role has its screen" tour (self-serve replacement quad, network fill-rate view, availability grid), FAQ 6→8. **PR #10**: French version `/work/staffig/fr` (fr-CA copy verbatim from the mockup) + floating EN·FR corner pill + hreflang/canonical, both locales rendered by one shared `StaffigLanding.tsx` (future design ports edit that single file). **Product-truth rules enforced (user-approved, keep enforcing):** no SOC 2 claim (legal line = "Hosted in Canada · Law 25 / PIPEDA"), no hourly rates in worker-facing mockups, sign-in label says email (SMS login isn't configured in Clerk). Proof numbers (14 orgs / 412 shifts / 87% / 54 s) are spec placeholders — swap when real data exists. Open: FR page CTAs land on the English contact form (FR form variant = separate piece); `~/staffig-marketing` repo obsolete. Detail: memory `project_staffig_marketing_on_kouamvision.md`; repo guide: `~/kouamvision-website/CLAUDE.md`.
- **E2E fix round + edge-locale polish DEPLOYED (2026-06-07, PRs #16–#20, backend `sha-11672d4`, migrations unchanged at `0015`):** Closed the 2026-06-06 findings queue except the `/platform` Overview stub. **PR #16** (→ #18 for prod): "Saved" flash — `SaveFlash` primitive + `useSaveFlash` hook on every auto-saving control (operator role select, tenant-access toggle/hours, reserved slugs, worker weekly grid, preference toggles, cities picker); worker surface no longer unmounts mid-interaction on session refresh (only the initial load gates the UI — the flash could never render before); HANDOFF #12/#13 notification preference toggles were stored but never consulted — new `MatchingService.wants_notification` gates publish/renotify broadcasts only (urgent opt-out suppresses urgency ≥3 or same-day; weekend-overnight requires opt-in; `notify_specific` bypasses; audit payloads record `notified_worker_count` + `preference_opt_out_count`), reach card shows "N eligible / M will be notified" with opt-out callout; **Housekeeping orphan scan** — `list_clerk_users()` (paginated, `None` on outage), `HousekeepingService.scan()` diffs Clerk vs DB (Clerk-only = no active DB match by clerk_user_id/email; DB-only = active row, no memberships, no operator row), `GET/POST /platform/housekeeping/orphans[/remove]` (scan = operator visibility, remove = MFA gate, re-verifies orphan-hood at click time), `HousekeepingCard` replaces the bare force-remove button — **scan confirmed working on prod** (cleaned the `+uninvited*` Clerk orphans). **PR #19/#20** edge-locale polish: `edge` i18n namespace (FR québécois), functional `EdgeLanguageToggle` (corner EN·FR, preserves query), Clerk widget French under `/fr` via `@clerk/localizations` `frFR`, locale-prefixed redirect targets everywhere (role-context not-invited, `requireServerSession`, sign-out buttons) + `SignIn/SignUp path` props, env `NEXT_PUBLIC_CLERK_SIGN_IN/UP_URL` → bare `/sign-in|/sign-up`, dev placeholder instead of crash when Clerk unconfigured. Deploy-time config: Vercel env + Clerk dashboard Component Paths → bare paths (old `/fr/` values keep working until flipped). 200 backend tests. **Owed: thorough live-app test round** (memory `project_e2e_findings_20260606`). Gotcha logged: `gh pr edit` broken (Projects-classic GraphQL) — use `gh api ... -X PATCH` (memory `project_gh_cli_gotchas`).
- **Platform workstream DEPLOYED + full prod E2E walked (2026-06-06, PRs #10–#15, backend `sha-b4f626a`, migrations through `0015`):** Merged the platform operator workstream to `main` and fixed 8 findings live during the walkthrough. **PR #10** the workstream itself. **PR #11/#12** unprefixed `/not-invited`, `/sign-in`, `/sign-up` must be public routes (locale-prefix matcher gap bounced sign-out redirects + SignIn↔SignUp cross-links to the sign-in form — "Couldn't find your account" confusion). **PR #13** `PLATFORM_MFA_ENFORCED` flag (Clerk MFA is Pro-only on production instances — prod tfvars sets `false`, terraform applied; flip to true once Clerk Pro + TOTP enrolled) + console↔workspace nav bridge (`/platform` sidebar Workspace card, "Open workspace" on caller's tenant row, `TenantProfileRead.via_grant`). **PR #14** tenant suspension enforced at `get_access_scope` (tenant users 403 + `WorkspaceSuspendedScreen`; platform_admin drops tenant from scope so console stays alive to reactivate); `/auth/sync` returns `platform_operator_role` → support gets read-only tenants table; `/apf` sidebar gains "Coordinator view" + "← Platform console"; read-only grant chrome on `/apf` + `/admin`. **PR #15** single-active-visit invariant (request + approve), suspended tenants don't satisfy grants, `POST /platform/access-grants/release` + "End visit" button. Clerk dashboard reconfigured: Component Paths → application domain (`/fr/sign-in|sign-up`), `NEXT_PUBLIC_CLERK_SIGN_IN_URL`/`SIGN_UP_URL` in Vercel + `.env.local`. All 5 E2E blocks pass (edge pages, platform surface, settings mutations, full §2.2 grant loop incl. natural expiry + End visit, regression smoke as coordinator + worker). 181 backend tests. Findings queue: memory `project_e2e_findings_20260606`.
- **Platform operator workstream complete (2026-06-04, `feature/platform-settings-billing`, local only — not yet merged/deployed):** All of `PLATFORM_HANDOFF.md` §1–§2.4 + §4 shipped. **Platform A** (`6e0fb1c`): `platform_operators` 3-role model (owner/operator/support), `PlatformOperator` ORM + migration, `AccessScope.platform_operator_role`. **Platform B** (`ab64ed2`): `platform_settings` singleton (default language, trial length, invite expiry, data residency, orphan retention, reserved slugs) + `platform_audit_log` + `PlatformAuditService`; both surfaced on `/platform/settings`. **Platform C** (`9ede4a5`): operators CRUD endpoints + `/platform/settings` screen with role legend, operator table, defaults form, reserved slugs editor. **Platform D (this session)**: §2.2 tenant access grants — `tenant_access_grants` table (migration `20260604_0015`), `TenantAccessService` (request/approve/deny/expire), `AccessScope.grant_access` read-only scope enforcement, `_sync_operator_mfa` on `/auth/sync`, `require_platform_operator_mfa` 2FA gate on all tenant lifecycle mutations; platform settings screen gains Tenant access card (approval toggle, window hours, active grants count, recent log); platform tenants view gains "Request access" modal; APF dashboard gains `TenantAccessRequestsCard` for the consent side. 173 backend tests pass, TS clean. **Billing (§3) deferred** — no Stripe account wired; `plans`/`subscriptions` schema not built. Minor open item: §2.1 two-person confirmation flow for owner-promotion (lockout-on-removal already enforced).
- **Edit-after-publish follow-ups + error-display fix shipped to prod (2026-05-31, PR #7 + PR #8):** Two more prod deploys the same day, both UI-verified. **PR #7** (`sha-dc0ffff`, migration `20260531_0010`): worker-side **"Task was modified — please review" banner**. Detection via `staffing_requests.content_last_edited_at` (stamped only on a real post-publish content edit in `update_draft` — not drafts, not status changes) vs `request_responses.last_reviewed_at` (bumped on every `mark_viewed`, while `viewed_at` stays first-view-only); banner shows when edited > reviewed and clears once the worker reopens (worker detail now marks-viewed on every open). Amber strip on the worker inbox card + fuller banner on detail, both i18n; helper `frontend/src/lib/request-modified.ts`. Also tightened the `AdminRequestEditForm` warning copy ("see the update" → "alerted to the change"). **PR #8** (frontend-only): raw FastAPI error bodies (e.g. `{"detail":"Worker must accept the request before assignment"}` when assigning a not-yet-accepted worker from the Best-match card) were dumping into the UI as JSON — added `browser-api.ts::errorMessageFromResponse()` (extracts `detail`) and routed all fetch helpers + best-match-card + request-workflow-card through it. Deploy pattern (both): backend first from the feature branch (`make deploy-backend`), then merge PR for Vercel frontend. Prod now: backend `sha-dc0ffff` (migrations through `0010`), frontend `main`. Detail: memory `project_edit_after_publish_followups.md`.
- **E2E bug-batch fix shipped to prod (2026-05-31, `sha-e2aed9b` / PR #6):** Fixed all 7 bugs logged during the same-day first E2E (memory `project_known_bugs_from_e2e.md`). **#1** `preferred_language` widened `String(5)→String(20)` on `users`+`organizations` (migration `20260531_0009`; org had the same latent landmine) — "bilingual" onboarding no longer 500s. **#2** invite emails now single-locale via `app/notifications/i18n.py::localized()` (was FR greeting + EN body); real French translations added; shift-notification emails were already correctly bilingual. **#3** `email_service._from_parts()` always sets a display-name `From` header + uses the bare address as the SMTP envelope sender (prod's `SMTP_FROM` was a bare address). **#4** invite links `/sign-in`→`/sign-up?email_address=<encoded>`. **#5** "Confirm this substitute" → `Assign {name}`/"Assigning…" (matches BestMatchCard). **#6** edit-after-publish: `StaffingRequestService.update_draft` now edits any pre-assigned request (409 once assigned/closed); new `/admin/requests/[id]/edit` page + `AdminRequestEditForm` + Edit pill on detail header (gated to editable statuses); save-only, warns instead of auto-renotifying; shared option lists extracted to `lib/request-form-options.ts`. **#7** `/admin` Live-requests empty state is now data-driven via new `kpis.assigned_count` ("No active requests" vs "View N assigned shifts"). 132 backend tests pass; full operator-chain E2E walked locally (API+Mailpit+renders, 0 fail) then **re-walked on prod via the real UI** (Clerk + SES) — all 7 confirmed. Deploy order: backend first from the feature branch (`make deploy-backend`, migration ran via entrypoint), then merged PR #6 → main for the Vercel frontend deploy, avoiding a new-FE/old-BE window. **Two follow-ups parked** (memory `project_edit_after_publish_followups.md`): worker-side "Task was modified — please review" banner; tighten edit-warning copy ("see"→"alerted").
- **Prod deploy + first full E2E walkthrough on `main` (2026-05-31):** Fast-forwarded `main` to PR #5 merge (`f77f70e`, 32 commits ahead) — first prod deploy of the redesign. Backend built and pushed as `sha-f77f70e` via `make deploy-backend` (migrations `20260523_0007` reliability + `20260524_0008` multi-site org cols applied via entrypoint; 41s downtime). Frontend auto-deployed by Vercel on `main` push. Then walked the full 12-step prod E2E with real SES emails (`josycorneille3@gmail.com` as APF admin Josy, `josycorneille3+coord@gmail.com` as coordinator Marie at new client "CPE Les Petites Étoiles", `josycorneille3+worker@gmail.com` as substitute Sophie Lavoie). Chain: invite coordinator → invite worker → worker onboarding → coordinator creates request → notify → worker accepts → coordinator assigns (auto-confirms per `fe06af7`) → worker check-in with geolocation → coordinator sees `Checked in at HH:MM · location recorded`. All passed. SES production access granted same day (50k/day, DKIM SUCCESS). **7 bugs logged** (memory `project_known_bugs_from_e2e.md`) — most critical: (#1) `preferred_language="bilingual"` returns 500 because `User.preferred_language` is `String(5)` and "bilingual" is 9 chars; (#6) no Edit-after-publish UI on `/admin/requests/{id}`. **Bigger architectural finding** during Step 4: platform conflates app-vendor (Josy) with first-tenant-admin (APF) — see Known gap #1 + memory `project_multitenancy_gap.md`. **GH_TOKEN gotcha**: stale env var in shell shadowed gh keyring token, blocked `git push`; workaround `unset GH_TOKEN && git push origin main`.
- **Workflow-consistency fixes + redesign committed as `fe06af7` on `feature/worker-inbox` (2026-05-24, local — not pushed):** During an end-to-end workflow test pass, fixed: worker home no longer mislabels a `viewed` response as "Reply sent" (it's an action-needed "New request"); coordinator stepper + worker `/accepted` timeline now green the "Confirmed" node on assign (assign === confirm in `AssignmentService.create`, not only on completion); worker tracking page (`/accepted`) stays reachable after confirmation (assigned-to-me card keeps routing there); coordinator assigned-substitute card shows check-in status; `cancel` now also clears `response.viewed_at`; check-in writes an `assignment.checked_in` audit entry and `cancel` clears the now-orphaned check-in columns (so a request never carries check-in on >1 assignment row). 111/111 backend tests. This commit also lands the prior (then-uncommitted) APF + admin redesign described next.
- **APF redesign (slices 1-5) + admin redesign (M1-M4) on `feature/worker-inbox`, committed in `fe06af7` (2026-05-24):** APF now has dark left sidebar + 5 new endpoints (snapshot, activity feed with chips + cursor pagination, NetworkPool with distribution + bulk-invite, org drill-in, CSV export). Admin now has light left sidebar (M1), /admin/requests/new 3-step stepper with autosave + live preview + reach estimate (M2), /admin/substitutes table with match-bar + ranking-against-request (M3), and right-rail Best-match dark card on /admin/requests/[id] (M4). New schema column: `worker_profiles.reliability` (migration `20260523_0007`).
- HANDOFF gap closures on `feature/worker-inbox` (2026-05-17, local only): **#5** Directions button (Google Maps deeplink) alongside Add-to-Calendar on `/schedule` hero · **#11** weekly availability 7×4 grid (week-by-week using `specific_date`) — new backend endpoints `GET/POST /workers/{id}/availability/grid` and `POST .../grid/copy-previous`, debounced auto-save; **UI-only**, matching engine does not yet consult the grid (see carry-over) · **#14** check-in card on `/schedule` hero (visible only on shift day) — backend `POST /assignments/{id}/check-in` with optional `latitude`/`longitude`, status guard for active assignments, idempotent · **#17** numeric match score (0-100) on `EligibilityResult` + pill on worker detail "Why you'll match" panel (moss ≥80 / sand ≥50 / rose <50) · **Cosmetic #4** moss "You're *in*" hero hidden on `/accepted` when response is withdrawn · **Regressions fixed**: worker home was showing DRAFT requests in active inbox (now filters to requests with a response row); `useAuth()` was called unconditionally in `request-workflow-card.tsx` + `request-create-form.tsx` crashing the admin surface in dev (now uses the `window.Clerk` pattern from `browser-api.ts`). Seed updated: Olivia (org_admin) now gets a `TenantMembership` so she appears in `users` queries → coordinator's "Review accepted workers" section actually renders.
- HANDOFF gap closures on `feature/worker-inbox` (2026-05-12, local only): **#16** distance + embedded org payload + friendly dates on worker cards · **#12 + #13** `notify_far` / `notify_weekend_overnight` preference toggles · **#3** dedicated `/worker/requests/[id]` detail page (back, urgent banner, title block, time block with Duration/Distance, location card, "Why you'll match" eligibility, sticky footer CTAs) plus fix for `/worker` home misclassifying declined responses as "new" · **#4 + #18** `/worker/requests/[id]/accepted` page (moss hero, 4-node vertical timeline, withdraw button) and `POST /requests/{id}/responses/withdraw` endpoint with 409 guards.
- Worker surface redesign (`feature/worker-inbox`): design system (Tailwind v4, Inter Tight / Instrument Serif / JetBrains Mono), new UI primitives (Chip, Button, Card, Avatar, BottomNav, Eyebrow, Mono), all 5 worker pages redesigned per `frontend/New design by Claude Design/HANDOFF.md`.
- Lifecycle management, multi-tenant onboarding, outbound email via AWS SES. Tenant + user removal UI, orphan cleanup. SES domain `staffig.kouamvision.com` verified + DKIM verified (2026-05-10, ca-central-1); **production access granted 2026-05-31** (50k/day quota). One-command deploy via `make deploy-backend`.
- DB-owns-roles architecture live. `/auth/sync` links Clerk identity to DB row; uninvited sign-up → 403 → `/not-invited`. Server-side role guards on `/apf` + `/admin` layouts.
- Production deployment live: EC2 `i-04a60b0aaf80c1528`, RDS, ECR, Vercel at `staffig.kouamvision.com`, backend at `api.kouamvision.com`, Clerk at `clerk.kouamvision.com`.
- Full A–D roadmap shipped: worker UX core, schema extensions, coordinator surface, APF oversight surface.

## What this project is

Bilingual (FR/EN) substitute-staffing dispatch platform for care organizations. Three surfaces in one repo:

- **Workers** — accept/decline shifts, manage availability (mobile-first)
- **Org admins** — create requests, run dispatch, confirm assignments
- **APF admins** — network-wide oversight and reporting

The product is **three apps in one shell**, not a single console with role toggles.

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic, PostgreSQL 16
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, inline styles + Tailwind v4
- **Local dev**: Docker Compose (`db`, `backend`, `frontend`)
- **Auth**: Clerk — `@clerk/nextjs` on frontend, backend verifies JWTs via JWKS
- **Infra**: Terraform on AWS (VPC, RDS db.t4g.micro, EC2 t3.small, ECR, SES, Secrets Manager). Frontend on Vercel. Domain `staffig.kouamvision.com` on Cloudflare.

## Repository layout

```
backend/app/
  api/v1/         Route handlers
  auth/           Clerk JWT decode + permissions + AccessScope
  models/         ORM models (normalized)
  repositories/   Persistence (all tenant-scoped)
  services/       Domain logic (matching, request lifecycle, etc.)
  core/           settings, timeutil (shift timezone), attendance (derived presence state)
  tests/          pytest (454 passing)
  migrations/     Alembic
frontend/src/
  middleware.ts             clerkMiddleware (active when key set)
  app/
    admin/*                 Org admin surface
    worker/*                Worker surface (mobile-first)
    apf/*                   APF oversight surface
  components/ui/            Chip, Button, Card, Avatar, BottomNav, Eyebrow, Mono, Meta
  lib/
    api.ts                  Server-side fetch (Docker-internal URL)
    browser-api.ts          Client-side fetch (NEXT_PUBLIC_API_BASE_URL)
    role-context.tsx        RoleProvider (Clerk + Dev variants)
    worker-session.tsx      WorkerSessionProvider (Clerk + Dev variants)
    types.ts                Shared TS types
    shift-time.ts           Shift-timezone helpers: shiftDateKey/shiftClock/shiftTime/shiftDateTime, attendancePhase
    request-status.ts       LIVE_STATUSES / CLOSED_STATUSES (pure; server + client)
    schedule-hero.ts        Worker Horaire hero selection (pure)
  hooks/use-polling.ts      Shared polling hook (admin live views)
  components/request-live.tsx  RequestLiveProvider + Live badge/tally/tracker for /admin/requests/[id]
  **/*.test.ts              vitest (`npm test`) — 32 tests
infra/                      Terraform modules + dev/prod environments
```

## Frontend architecture

Three role-scoped surfaces:

| Path | Audience | Shell |
|---|---|---|
| `/admin/*` | Org admins | Light cream, top nav, tables |
| `/worker/*` | Workers | Mobile-first, bottom nav, cards |
| `/apf/*` | APF admins | Dark, sticky header, metrics |

**Auth (conditional on `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`):**
- Key present → `ClerkProvider` + `clerkMiddleware`, `RoleProvider` calls `/auth/sync` after login, JWT attached to every request, backend verifies via JWKS.
- Key absent → dev role-switcher + worker picker (localStorage), no auth header sent. Local dev uses `DEV_AUTH_BYPASS=true` in `backend/.env`.

**Two API helpers — never mix them:**
- `lib/api.ts` — server components, uses `http://backend:8000` (Docker internal)
- `lib/browser-api.ts` — client components, uses `NEXT_PUBLIC_API_BASE_URL`

**Design system** (from `frontend/New design by Claude Design/HANDOFF.md`):
- Tokens: `--paper #F6F4EE`, `--card #FFF`, `--ink #15140F`, `--terra #DC5A2A`, `--moss #25684A`, `--sand #E8C97A`, `--rose #C53A2A`, `--line #E5E1D3`
- Fonts: Inter Tight (UI), Instrument Serif (display/headings), JetBrains Mono (numerics)
- Rules: no gradients in product UI · no emoji (Lucide icons) · 0.5px hairline borders only · 44px min touch targets · page bg is `--paper` never `#fff` · display headings italicize one word
- Components in `frontend/src/components/ui/`
- **Visual port only** — keep FastAPI backend as-is, no stack changes

## Backend architecture

Routes → services → repositories → SQLAlchemy models. Pydantic schemas in `schemas/*`.

**Matching** (`services/matching_service.py`): active + has profile → available → city match → qualifications → certifications → language.

**Request lifecycle**: `draft → open → notified → responses_received → assigned → completed` (+ `cancelled`/`expired`). All transitions write `audit_logs`.

**AccessScope** (`auth/scope.py`): resolves caller to `is_platform_admin / is_network_admin / is_org_admin / is_worker` + `tenant_id` + `org_ids`. All repos filter by scope.

## Onboarding model (DB-owns-roles, invite-only)

Clerk is identity only. DB owns roles and memberships.

1. Bootstrap: migration `20260507_0003` seeds APF tenant + first `network_admin` (via `APF_BOOTSTRAP_EMAIL` env var).
2. APF admin signs in → `/auth/sync` links Clerk identity → lands on `/apf`.
3. APF admin creates org at `/apf/organizations/new`.
4. APF admin invites coordinator at `/apf/coordinators/new` → DB User (org_admin) + memberships.
5. Coordinator signs up with invited email → `/auth/sync` links, preserves DB role → lands on `/admin`.
6. Coordinator creates/publishes coverage requests scoped to their org.
7. APF admin invites worker at `/apf/workers/new` → DB User (worker) + TenantMembership.
8. Worker signs up → `/auth/sync` links → redirected to `/worker/onboarding` (profile=null) → fills cities/quals/certs.

**Critical invariants:**
- `/auth/sync` never reads role from JWT or Clerk metadata. Links by `clerk_user_id` or email; preserves DB role.
- Uninvited sign-up → 403 → frontend redirects to `/not-invited`.
- Role guards use DB role via `AccessScope`, not JWT.
- All client-side action calls must attach the Clerk JWT — use `lib/browser-api.ts` helpers (raw `fetch()` without `Authorization` → 401).

## Schema policy

Normalized tables for anything driving matching, compliance, reporting, or permissions. JSONB only for audit payloads and incidental metadata. No production data — fix migrations in-place, don't stack compatibility migrations.

## Manual deploy procedure

**Frontend:** `git push origin main` → Vercel auto-deploys.

**Backend:** `make deploy-backend`
- Builds + pushes to ECR, reboots EC2, polls direct IP `99.79.127.227` (not Cloudflare — it caches stale 5xx), verifies new image via `/openapi.json`.

```bash
# Rollback to a prior image
docker pull 515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend:sha-<old>
docker tag <repo>:sha-<old> <repo>:latest
docker push <repo>:latest
aws ec2 reboot-instances --region ca-central-1 --instance-ids i-04a60b0aaf80c1528
```

Infrastructure IDs:
- EC2: `i-04a60b0aaf80c1528`
- RDS: `apf-staffing-platform-prod-postgres.cbeimeeggn80.ca-central-1.rds.amazonaws.com`
- ECR: `515275664907.dkr.ecr.ca-central-1.amazonaws.com/apf-staffing-platform-prod-backend`

## Known gaps

1. ~~**Multi-tenancy not operational**~~ — **RESOLVED (2026-06-04, `feature/platform-settings-billing`)**: `platform_admin` role + `/platform/*` surface + full operator CRUD + tenant lifecycle (invite/suspend/reactivate) + tenant access grants (§2.2) all shipped. Billing (§3) deferred until Stripe is wired.
2. ~~**E2E bugs queued from 2026-05-31**~~ — **RESOLVED 2026-05-31** (`sha-e2aed9b` / PR #6, deployed + UI-verified on prod). All 7 fixed; see "Last shipped". Two minor follow-ups parked in memory `project_edit_after_publish_followups.md` (worker "task modified" banner + edit-warning copy tweak).
3. **CI secrets unset** — `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REPOSITORY_URL`, `EC2_INSTANCE_ID`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. All backend deploys manual (`make deploy-backend`) until set. CD also weak: migrations run in app entrypoint (any bad migration takes the app down with no gate/rollback), deploy = EC2 reboot (~1-2 min downtime, no rolling deploy). Detail: memory `project_cicd_improvements.md`.
4. ~~**SMS (Twilio) not wired in prod**~~ — **RESOLVED 2026-08-11**: outbound + inbound ("Reply 1") live; Messaging Service unused (no Advanced Opt-Out); auth token rotation still owed.
5. **SSM agent unregistered** for `i-04a60b0aaf80c1528` — deploys use `aws ec2 reboot-instances` as workaround. Cannot `aws ssm send-command` to inspect or restart the container in place.
6. **HTTPS hardening** — currently Cloudflare Flexible SSL (plain HTTP Cloudflare→EC2). Long-term: nginx + Let's Encrypt or Cloudflare Origin Certificate.
7. ~~**`GH_TOKEN` env var shadows gh keyring**~~ — **RESOLVED 2026-09-12**: the variable no longer exists in any profile or terminal; `gh` uses the keyring token. No `unset GH_TOKEN` needed.

**Resolved (was #1 + #2):** SES production access granted 2026-05-31 (50k/day, DKIM SUCCESS). First full operator-chain E2E walked 2026-05-31 — see "Last shipped". The 7-bug batch from that E2E was fixed + deployed the same day (`sha-e2aed9b` / PR #6) and re-verified on prod via the UI.

## Implementation roadmap

**Current focus:** Worker surface redesign (`feature/worker-inbox`), then admin surface redesign.

**HANDOFF gap tracker:** `docs/handoff-gaps.md` — full list of what was omitted from the design spec, grouped by frontend-only vs backend-blocked vs intentional stack skips.

### Phase A — Worker UX ✅ complete
A1 status labels · A2 eligibility badges · A3 tabs+filters · A4 home top card · A5 home sections · A6 accept modal · A7 decline modal · A8 assignment enrichments · A9 cities picker · A10 notifications feed · A11 re-notify

### Phase B — Schema extensions ✅ complete
B1 CoverageType enum · B2 viewed_at on responses · B3 org type enum · B4 care-sector-neutral copy

### Phase C — Coordinator surface ✅ complete
C1 Coverage Desk rename · C2 responses board · C3 substitute directory · C4 coverage history

### Phase D — APF surface ✅ complete
D1 network overview metrics · D2 substitute pool · D3 activity history

### Phase E — Polish (post-pilot)
- [ ] **E1** Mobile hamburger nav on `/apf` and `/admin` (~2h, pure frontend)
- [ ] **E2** Worker UI polish pass — after pilot data; don't brief designer before real-user feedback
- [ ] **E3** Case-study on `kouamvision.com/work/`
- [ ] **E4** Optional standalone landing at `staffig.kouamvision.com` (app → `app.staffig.*`)

### Carry-over for next session (updated 2026-09-12 — findings sweep + first-come-first-served shipped)

**Prod state:** `main` = `6de78ec` (PR #88), prod backend `sha-0535436`, migrations through `0025`, frontend on Vercel from `main`. 454 backend tests, 32 vitest. **RDS may be stopped** (cost saving) — restart before any prod work: `aws rds start-db-instance --region ca-central-1 --db-instance-identifier apf-staffing-platform-prod-postgres`. Test fleet on prod: Eva `+workerb`, Mael `+workera`, SMS WORKER `+smstest` (= the `+16135018377` device, which is also Eden's coordinator number), coordinators Eden `+coord2` / Cordinator2 `+coordorg`, Josy = platform admin.

**Parked small items (all noted, none started):** worker Horaire check-in→out fallback line never eyeballed; a cancelled request gets no explanatory notice (expired does); the no-show alert writes no activity row; "Assigned to: · confirmed" prints the raw status next to the no-show chip; admin surface still hardcoded English outside `admin.live` / `admin.profile`; dashboard polls at 30 s (5 s only on the request detail); APF-side edit of a coordinator's phone (self-service exists); singular/plural copy ("1 records"); Expired chip counts 0 while the KPI counts `replacement.unfilled`; a worker's own `PATCH /auth/profile` also exists (harmless).

**Queued workstreams, ranked:**

1. ~~**Live-app test round on prod**~~ — DONE 2026-09-05 (`docs/prod-test-round-20260905.md`, 17 findings, all fixed by PRs #72–#88) and re-run on prod after every PR since.

2. **CI/CD overhaul (1 day)** — see memory `project_cicd_improvements.md`. Cheapest-first: decouple migration from `docker-entrypoint.sh`; set GitHub Actions secrets to activate dormant `backend-prod.yml` deploy job.

3. **`/platform` Overview stub** — last item from the findings queue; parked until tier-0 KPIs are decided / Stripe lands.

4. **Billing (§3 PLATFORM_HANDOFF) — deferred** — needs a Stripe account. Schema (`plans`, `subscriptions`), Stripe customer/subscription wiring, webhooks, billing page at `/platform/billing`. ~1.5 days once Stripe is ready. When Clerk Pro lands, also flip `platform_mfa_enforced=true` (tfvars + terraform apply) after enrolling TOTP.

**Done 2026-06-04:** ~~Platform operator workstream (§1–§2.4, §4)~~. **Done 2026-06-06:** ~~E2E test session~~, ~~merge + deploy~~ (PRs #10–#15). **Done 2026-06-07:** ~~E2E findings round~~ (PRs #16–#20: Saved flash, notification gate, orphan scan, edge-locale polish — all deployed).

**Earlier carry-over (still valid):**

- **Feature parity audit closed (2026-05-17):** verified against `main` rather than memory. Only real gap was worker decline-with-reason on `/worker/requests/[id]` (now shipped — modal with 4 preset reasons + free-text note). The "coordinator cancel-with-reason" and "worker withdraw-with-reason" items were **false alarms**: prod's `/requests/{id}/cancel` was always direct (no reason payload), and `withdraw` did not exist on prod (added in redesign as #18). Coordinator cancel-**assignment**-with-reason preserved in `request-workflow-card.tsx` via `CancelAssignmentModal`. Lesson: cross-check `main` before trusting a parity claim.
- **Availability grid wired into matching (2026-05-17):** `MatchingService` now accepts an optional `db: Session`. After the binary availability check passes, it consults `availabilities` table. Rule: if worker has any rows for the request's week, require an `available=True` row for `(work_date, slot)` (slot derived from `start_time` — morning/afternoon/evening/overnight). If no rows for that week, falls through. Eligibility reason "Slot not in weekly grid" surfaces when grid downgrades a match.
- **Worker HANDOFF gaps closed:** #3, #4, #5, #11, #12, #13, #14, #16, #17, #18 all shipped. #15 (hourly rate display) intentionally dropped (memory `feedback-no-hourly-rate-display`). Onboarding redesigned to spec (3-step, terra accents, languages section, full i18n). No worker-side HANDOFF gaps remain.

### Admin/coordinator + APF redesign status (updated 2026-05-24)

Both surfaces are spec-complete and committed (`fe06af7`) on `feature/worker-inbox`. A partial e2e walkthrough ran 2026-05-24 (create → notify → view → accept → assign → confirm → check-in → cancel → re-notify), which produced the workflow-consistency fixes in that commit. Full operator-chain e2e still pending SES production access.

**Admin (4 milestones, all done):**
- **M1** — `/admin/*` shell is a real left sidebar (`--paper` aside, 232px) with logo + muted "Admin" pill + org switcher card + vertical nav (Lucide icons, terra active accent) + pinned "Fill rate" mini-card. Main column has sticky top bar (Operations Console eyebrow + sign-out). `AdminNavigation` is vertical.
- **M2** — `/admin/requests/new` is a dedicated 3-step stepper page ("Where & when" · "Who you need" · "Notify") with chip pickers for role/qualifications/certifications/language/urgency. Autosaves the draft via `POST /api/v1/admin/requests` (create) + `PATCH /api/v1/admin/requests/{id}` (debounced 400ms). Right rail has a scaled worker-card preview + moss-soft reach-estimate card driven by `GET /admin/substitutes?rank_against_draft_id=`. Publish → redirects to `/admin/requests/{id}`. The old inline form on `/admin/requests` is replaced by a "+ New request" CTA.
- **M3** — `/admin/workers` route renamed to `/admin/substitutes`. Sortable table replaces the card layout (Substitute / City / Availability / Languages / Match / Notify, sortable headers). Match bar 50px progress with moss ≥90 / terra ≥80 / ink-3 <80 bands. When `?rank_against_request_id=` is set, a dark `--ink` "Ranking by match against" header bar shows REQ-id + title + derived chips + Clear link, and the top scored row is highlighted moss-soft with a terra "Top" pill. Backend: `GET /api/v1/admin/substitutes` reuses `MatchingService.eligibility_result`.
- **M4** — `/admin/requests/[id]` right rail has the dark `--ink` "Best match" card (terra avatar + serif name + match % + 4 tag chips derived from eligibility reasons + terra Assign CTA). Hidden when assignment exists. Header gets a "Rank substitutes →" pill linking to `/admin/substitutes?rank_against_request_id=...`. Sand-tinted decline-pattern callout when any declined response has a `decline_reason`.

**APF (5 slices + visual port redo, all done):**
- **Slice 0 (visual port, redone correctly)** — `/apf/*` now has a real left sidebar on `--ink` (dark variant, 232px) with terra-outlined "APF" badge, network/org indicator card, vertical nav, pinned "APF observes — it doesn't dispatch." footer. Main column is on `--paper`. Pages re-skinned to ink-on-paper. Distinct light/dark variant from admin per `NETWORK_HANDOFF §6`.
- **Slice 1** — `GET /api/v1/apf/snapshot` (one round-trip: kpis + status_breakdown + shortage_cities + org_activity + recent_closed_requests). 60s in-memory TTL cache per tenant. Dashboard wired to single fetch.
- **Slice 2** — `GET /api/v1/apf/activity` with chip filters (all/assigned/cancelled/escalated/invitations/removals), cursor pagination on `(created_at desc, id desc)`, tenant-scoped (audit org match OR actor tenant membership OR tenant-level entity). Counts per bucket returned alongside page. Server-side actor + org + request_title joins. `?org_id=` filter for the drill-in link.
- **Slice 3** — `/apf/substitutes` NetworkPool: editorial headline, distribution-by-city bar chart (moss ≥85 / sand 50-84 / rose <50), KPI bento (total / available now / multi-org % / avg reliability / shortage callout), top contributors table (last 30d). `POST /api/v1/apf/substitutes/invite` for bulk invite (idempotent per email). `POST /api/v1/apf/substitutes/recompute-reliability` for manual reliability refresh. **Schema delta:** `worker_profiles.reliability INTEGER NOT NULL DEFAULT 0` (migration `20260523_0007`).
- **Slice 4** — `/apf/organizations/[id]` drill-in: org-level KPIs (fill_rate, avg_fill_hours, unfilled, substitutes_in_city) + status breakdown + upcoming-open + recent-closed. "View full activity →" link with org filter applied. Org rows on dashboard + list link to drill-in.
- **Slice 5** — `POST /api/v1/apf/export` returns 202 + job id. Background CSV generation. `GET /export/{id}` for status, `GET /export/{id}/download` for CSV. SES-emailed link on completion (best-effort). Form at `/apf/export` with date range + org multi-select + status polling. "Export →" button on `/apf/activity`.

**New endpoints (this branch):**
- `GET /api/v1/apf/snapshot`
- `GET /api/v1/apf/activity` (filter, cursor, org_id)
- `GET /api/v1/apf/substitutes`
- `POST /api/v1/apf/substitutes/invite`
- `POST /api/v1/apf/substitutes/recompute-reliability`
- `GET /api/v1/apf/organizations/{id}/snapshot`
- `POST /api/v1/apf/export` + `GET /export/{id}` + `GET /export/{id}/download`
- `GET /api/v1/admin/substitutes` (rank_against_request_id / rank_against_draft_id)
- `POST /api/v1/admin/requests`
- `PATCH /api/v1/admin/requests/{id}`

**Schema deltas (this branch):**
- `worker_profiles.reliability` (migration `20260523_0007`).
- No other migrations.

**Test count:** 111 backend tests passing (up from 67). New test files: `test_apf_snapshot`, `test_apf_activity`, `test_apf_network_pool`, `test_apf_org_drillin`, `test_apf_export`, `test_admin_substitutes`, `test_admin_requests`.

**Honest gaps still open (post-pilot or post-real-data):**
- Reliability nightly cron not wired — APF admin can hit `POST /apf/substitutes/recompute-reliability` manually until one lands. Formula uses what we have (accepted/declined/completed/cancelled in 90d) as a proxy for the spec's `viewed-within-60min` formula (we don't track viewed_at + notified_at timestamps yet — TODO in `worker_service.py`).
- Export job registry is process-local — restart drops jobs. Fine for v2 pilot; swap to Redis/Inngest for production scale.
- `data_access_log` table for Law 25 §10 not built. Add if real worker PII lands on APF.
- `apf_observer` (read-only) role variant not implemented — only `network_admin`.
- Multi-network / many-to-many orgs not modeled — current `Tenant`/`TenantMembership` collapses network and tenant. The spec assumes orgs can belong to >1 network. Decide if/when to extend.

**APF spec items deliberately NOT built (per spec):**
- Coverage map (Mapbox cost > list value).
- Predictive analytics.
- Direct messaging between APF and substitutes.
- Cross-network reports.

**Acceptance test (NETWORK_HANDOFF §14):** APF admin signs in → dashboard loads with real KPIs → drills into a shortage city → bulk-invites 3 substitutes → sees their invitation in the activity feed → triggers export. Attempt to POST to any write endpoint outside the allowed list returns 403. **Status: not yet walked locally.**

### Git workflow
- Branches: `main` (prod only) ← `feature/*` / `fix/*` / `hotfix/*` (PRs go straight to `main`; `develop` is dormant)
- Vercel deploys `main` automatically; backend is deployed by hand with `make deploy-backend` **from the branch, before the merge** (if merged first, deploy from `main` after `git pull`)
- **Division of labour (since 2026-09-12):** Claude edits, tests, branches from a fresh `main` and commits locally — only after the user approved the work; Claude writes the PR body to `/tmp/pr.md`. The **user** runs everything that leaves the machine, one plain command per step, no `&&`: `git push -u origin <branch>` → `gh pr create --base main --head <branch> --title "…" --body-file /tmp/pr.md` → (`make deploy-backend`) → `gh pr merge NN --merge --delete-branch` → `git checkout main` → `git pull`
- Current active branch: none — all merged through PR #88 as of 2026-09-12 (`main` = `6de78ec`; prod backend `sha-0535436`, migrations through `0025`)

## Working agreements

- **No `terraform apply`** without explicit approval.
- **Frontend is current priority** — worker surface first, then admin.
- **No backwards-compat schema shims** — no prod data; fix migrations in-place.
- **No UI library** (Tailwind class-heavy, shadcn, Mantine, etc.) without discussion. Codebase uses inline styles + design system tokens.
- **Don't claim a feature works without exercising it.** Type checking ≠ behavioral verification.
- **Three distinct shells** — don't fold worker/admin/apf into one layout.
- **Mobile-first for worker** — large touch targets, cards, no dense tables.
- **Never commit or push without explicit user approval.**
- **User runs all deploy commands** — print the command, never execute it (and, since 2026-09-12, the push / PR / merge commands too — see Git workflow).
- **Verify on prod, in the user's Chrome.** Local runs are for pytest / vitest / tsc (and a smoke render when a server component's imports change); screen checks happen on the live app, signed in as the relevant role.
- **Live test rounds keep ≤5-minute gaps** between the moments to observe; design around fixed backend delays (no-show grace = 15 min) instead of waiting them out.
- **Never call a function exported from a `"use client"` module inside a server component** — rendering its components is fine, calling a helper crashes the route at runtime (PR #79/#80). Pure helpers live in `frontend/src/lib/`.

## Useful commands

```bash
make up          # docker compose up --build
make down
make migrate     # alembic upgrade head inside backend container
make seed        # python -m app.scripts.seed_dev_data
make test        # pytest in backend container
docker compose exec frontend npx tsc --noEmit
cd frontend && npm test          # vitest (frontend hooks)
./cleanup.sh           # safe between-build prune
./cleanup.sh --deep    # aggressive prune when disk gets tight
```

## When making changes

- **Schema changes** → update migration `20260420_0001_initial_schema.py` + SQLAlchemy model + `docs/initial_database_schema.sql`.
- **New API route** → `api/v1/*` → register in `api/v1/router.py` → fetch helper in `lib/api.ts` / `lib/browser-api.ts`.
- **New worker page** → `frontend/src/app/worker/<name>/page.tsx` (`"use client"`), use `useWorkerSession()`, add to `NAV_ITEMS` in `worker/layout.tsx` if top-level.
- **New admin page** → server component under `frontend/src/app/admin/`, fetch via `lib/api.ts`, add to `AdminNavigation`.
- **Matching logic** → `services/matching_service.py` + add a test.
- **Auth changes** → update `auth/clerk.py` + `lib/role-context.tsx` together.
- **Env config** → keep `backend/.env.example`, `frontend/.env.local.example`, and Terraform `terraform.tfvars` + secrets-manager module in sync. Drift here is the most common source of subtle breakage.
