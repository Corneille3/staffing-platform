# Observability + CI/CD

Infra workstream for the prod backend (EC2 `i-04a60b0aaf80c1528`). Run in this order —
each step depends on the one before.

| # | Step | Spec | State (2026-10-18) |
|---|------|------|--------------------|
| 1 | Elastic IP — make the prod instance replaceable | [`SPEC_STEP0_ELASTIC_IP.md`](SPEC_STEP0_ELASTIC_IP.md) | Implemented 2026-08-29 in worktree `~/STAFFIG-observability` (branch `feature/observability`, base `6e57764`), plan-validated, **not committed, not applied**. Rebase on `main` and re-run `terraform plan` first. Applying changes the API origin IP → same-minute Cloudflare A-record edit for `api.kouamvision.com`. |
| 2 | Observability — Grafana Cloud + Sentry, 4 sequential PRs | [`SPEC_OBSERVABILITY.md`](SPEC_OBSERVABILITY.md) | Not started. Requires step 1 merged, applied and verified (it changes `user_data`, which recreates the instance). |
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
4. **Deploy = `aws ec2 reboot-instances`** (~1–2 min downtime, no health gate) because the SSM agent is not
   registered. Replace with SSM `docker pull` + restart once SSM works. Infra change — no `terraform apply`
   without explicit approval.

Rules for the whole workstream: the user runs every deploy, `terraform apply` and git/gh command; nothing is
applied without explicit approval.
