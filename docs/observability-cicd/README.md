# Observability + CI/CD

Infra workstream for the prod backend. The EC2 instance is identified by its tag
`Name=apf-staffing-platform-prod-app`, never by an id: it is replaceable, and its id changes whenever
`user_data` does. Run in this order —
each step depends on the one before.

| # | Step | Spec | State (2026-11-21) |
|---|------|------|--------------------|
| 1 | Elastic IP — make the prod instance replaceable | [`SPEC_STEP0_ELASTIC_IP.md`](SPEC_STEP0_ELASTIC_IP.md) | **Done 2026-10-25** (PR #115, applied and rehearsed): EIP `15.175.98.103` behind `api.kouamvision.com`. The old worktree `~/STAFFIG-observability` / local branch `feature/observability` hold a superseded copy of that work — nothing `main` lacks. |
| 2 | Observability — Grafana Cloud + Sentry: PR1, PR2A, PR2B, PR3, PR4 | [`SPEC_OBSERVABILITY.md`](SPEC_OBSERVABILITY.md) (revised 2026-11-21) | **In progress.** PR1 (application instrumentation) shipped 2026-11-21 (#166) — see « PR1 as built » below. Next: PR2A (secret + IAM, no instance change), then the human fills the secret, then PR2B (alloy agent in `user_data` — replaces the instance, with the spec's mandatory pre-apply checklist). |
| 3 | CI/CD overhaul | no spec yet — plan below | Not started. |

## CI/CD plan (from 2026-05-24, to turn into a spec)

What already works: `backend-dev.yml` / `frontend-dev.yml` run pytest + tsc on every push/PR; the frontend
deploys through Vercel's native integration.

What is weak, cheapest fix first:

1. **Migrations run in the app entrypoint** (`backend/docker-entrypoint.sh`: `alembic upgrade head`, then
   uvicorn) — a bad migration takes the app down with no gate. Move the migration to an explicit deploy step.
2. **"Edit migrations in place" rule** in CLAUDE.md is stale now that prod holds real data — forward-only
   migrations.
3. **Automated deploy is dormant** — `backend-prod.yml` has a deploy job that no-ops because the AWS GitHub
   secrets are unset (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `ECR_REPOSITORY_URL`,
   `EC2_INSTANCE_ID`). Needs the user.
4. **Deploy = `aws ec2 reboot-instances`** (~1–2 min downtime). SSM has been online since 2026-11-15
   (PR #130), so this can now become an SSM `docker pull` + restart. Infra change — no `terraform apply`
   without explicit approval.

Rules for the whole workstream: the user runs every deploy, `terraform apply` and git/gh command; nothing is
applied without explicit approval.

## PR1 as built (2026-11-21)

Where the code follows the spec to the letter, nothing is repeated here. What differs, and why:

- **Pinned versions:** `prometheus-fastapi-instrumentator==7.1.0` — 8.x requires a newer Starlette than
  `fastapi==0.115.12` allows. `prometheus-client==0.26.0` is pinned too (imported directly by
  `app/core/metrics.py`). `sentry-sdk[fastapi]==2.75.0`.
- **`staffig_sms_claim_replies_total{outcome}`** — the spec lists `claimed | too_late | invalid | opted_out`.
  The handler knows three situations that are none of those, kept as their own value rather than miscounted:
  `opted_in` (START), `pending_approval` (managed org: the reply raises a hand, it does not take the shift)
  and `overlap` (the worker already holds a shift at that time). `too_late` covers a lost race and « nothing
  open »; `invalid` covers an unknown number and any text that is not a command.
- **`staffig_clock_events_total{geo_ok}`** — `true | false`, plus `unknown` when the phone sent no position.
- **`staffig_scheduler_sweep_seconds{job}`** — the spec's three labels, mapped onto the three jobs that exist:
  `expiry` = replacement sweep (escalation + expiry), `noshow` = attendance sweep (clock reminders + no-show
  alerts), `reminders` = the daily sales-pipeline reminder (a no-op tick outside its hour — still a heartbeat).
  The nightly reliability recompute is not timed.
- **`staffig_time_to_fill_seconds`** is observed on both ways a request gets filled: the coordinator's
  assignment and the self-serve claim (app tap or SMS « 1 »).
- **`staffig_notifications_total`** is counted inside each channel's `send`, so no caller can forget it. Push
  counts per device; an endpoint the browser unsubscribed (pruned) is `skipped`, not `failed`.
- **Settings:** `METRICS_PORT` (9091; 0 turns the server off), `SENTRY_DSN`, `GIT_SHA`. The local compose stack
  publishes the metrics port on `127.0.0.1:9091`, as the prod instance will in PR2.
- **Logs:** uvicorn's own lines (access log included) go through the JSON formatter. The few lines the
  entrypoint prints before the app starts (`[entrypoint] …`, alembic's migration output) are still plain text
  — they come from another process.

