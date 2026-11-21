# SPEC — Observability for Staffig (Track A)

Status: READY. The prerequisite is done: the Elastic IP has been live since
2026-10-25 (PR #115), so the prod instance is replaceable.
Branch: `feature/observability`, recreated from `main` (see "Before starting").
Structure: 4 sequential PRs, with PR2 split into PR2A and PR2B. Do not
combine them. Each PR has its own acceptance criteria; stop after each and
hand back to the human.

## Revision log

- 2026-11-21 — Step 0 marked done. Stale summer worktree/branch to be
  discarded. PR1 also fixes `docs/observability-cicd/README.md`. PR2 split
  into PR2A (secret + IAM, no instance change) and PR2B (alloy agent in
  `user_data`, replaces the instance), so the secret is filled BEFORE the new
  instance boots. PR2B gets a mandatory pre-apply checklist, after the
  2026-11-15 outage where an instance replacement picked an unusable AMI.
- 2026-11-21 (b) — PR4 now lists the credentials it needs (Grafana
  annotation and read tokens, Sentry auth token), which the first version
  had left implicit. Sentry is kept.

Reference plan (context, decisions, rationale): the project doc
`claude/observability-plan.md` in the user's Claude project. This spec is
self-contained — implement from THIS file.

## Before starting (human)

The worktree `~/STAFFIG-observability` and the local branch
`feature/observability` hold the old Elastic IP commit, already shipped
another way (PR #115). They contain nothing `main` lacks. Discard them and
start clean:

```
git worktree remove ~/STAFFIG-observability
git branch -D feature/observability
git switch main && git pull
git switch -c feature/observability
```

## Decisions already made (do not reopen)

- Hosted Grafana Cloud free tier (metrics + logs + dashboards + alerting).
  No self-hosted Prometheus/Grafana anywhere.
- Sentry free tier for error tracking.
- All new secrets in AWS Secrets Manager, exposed to the EC2 like the
  existing app secret.
- Metrics are served on a SEPARATE port bound to 127.0.0.1 only — never
  reachable through Cloudflare/port 80.
- The collection agent is grafana-alloy, run as a second systemd unit
  defined declaratively in `user_data.sh.tftpl` (this is why Step 0 was a
  prerequisite: changing user_data replaces the instance, now safe).

## Global non-goals — for every PR

- NO ALB, ASG, Kubernetes, Jenkins, ArgoCD.
- NO changes to business logic, matching, or notification behavior —
  instrumentation observes, it never alters a code path's outcome.
- NO new Python web frameworks or logging libraries beyond the ones this
  spec names.
- Metric emission and log shipping must NEVER raise into a request path:
  wrap in try/except where a failure is possible; a metrics outage must not
  break a claim.
- Do NOT run `terraform apply`, do NOT push to `main`, do NOT reboot or
  replace the prod instance. Plans and PRs only; apply/deploy is human.
- Do NOT modify `scripts/deploy-backend.sh` before PR4.

## Human prerequisites (before PR2B is applied)

- Grafana Cloud: Prometheus remote_write URL + username (instance id),
  Loki push URL + username, one access-policy token with `metrics:write`
  and `logs:write`.
- Sentry: project DSN.

PR4 needs more credentials, created later (see PR4).

PR1 needs none of these: it is built and verified entirely on the local
stack. PR2A creates the empty secret; the human fills it (see "Between
PR2A and PR2B"); only then is PR2B applied.

---

## PR1 — Application instrumentation (backend only)

New deps in `backend/requirements.txt` (pin exact versions):
`prometheus-fastapi-instrumentator`, `sentry-sdk[fastapi]`.

### 1a. Metrics endpoint on a private port

- `Instrumentator().instrument(app)` in `app/main.py` (default registry).
- On startup, `prometheus_client.start_http_server(9091)` — serves the
  default registry on :9091 inside the container. Do NOT add a `/metrics`
  route to the FastAPI app itself: the app is published on port 80 through
  Cloudflare and metrics must not be public.
- Note in a code comment: single-process uvicorn today; if `--workers > 1`
  is ever added, this must move to prometheus multiprocess mode.

### 1b. Custom Staffig metrics (`app/core/metrics.py`, one module)

| Metric | Type | Labels | Instrumented where |
|---|---|---|---|
| `staffig_requests_unfilled` | Gauge | — | recomputed in the scheduler sweep |
| `staffig_time_to_fill_seconds` | Histogram | — | on assignment confirmation (created_at → assigned) |
| `staffig_notifications_total` | Counter | `channel` (sms\|push\|email), `status` (sent\|failed\|skipped) | Notification dispatcher / each channel service |
| `staffig_sms_claim_replies_total` | Counter | `outcome` (claimed\|too_late\|invalid\|opted_out) | Twilio inbound webhook handler |
| `staffig_clock_events_total` | Counter | `kind` (in\|out), `geo_ok` (true\|false) | attendance check-in/out service |
| `staffig_scheduler_sweep_seconds` | Histogram | `job` (noshow\|expiry\|reminders) | wrap each sweep run |

Buckets: time_to_fill `(300, 900, 1800, 3600, 7200, 14400, 43200, 86400)`;
sweep `(0.1, 0.5, 1, 5, 15, 60)`.

### 1c. Structured JSON logs

- Replace the `logging.basicConfig` format in `app/core/logging.py` with a
  JSON formatter (stdlib `logging` + a custom `Formatter` emitting one JSON
  object per line: `ts`, `level`, `logger`, `message`, plus any `extra`).
  No new dependency needed.
- ASGI middleware: generate/propagate `X-Request-ID` (uuid4 if absent),
  store in a `contextvar`, inject `request_id` into every log record via a
  logging Filter, and return the header on responses.
- Do not rewrite existing log call sites; they inherit the formatter.

### 1d. Sentry

- `sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env,
  release=settings.git_sha, traces_sample_rate=0)` in `app/main.py`,
  guarded: skipped entirely when `SENTRY_DSN` is empty (local/dev/test).
  Keep `send_default_pii` at its default (off).
- New settings: `sentry_dsn: str = ""`, `git_sha: str = "unknown"`.
- `backend/Dockerfile`: add `ARG GIT_SHA=unknown` + `ENV GIT_SHA=$GIT_SHA`
  (the deploy script passes it in PR4; harmless until then).

### PR1 acceptance criteria (verify in the local Docker Compose stack)

1. `curl -s localhost:9091/metrics | grep staffig_` shows the custom
   metrics after exercising the app (seeded data + a publish).
2. `https://localhost` app behavior unchanged; `GET /metrics` on the app
   port returns 404.
3. Backend logs are one-JSON-object-per-line and carry `request_id`.
4. Full test suite passes (`make test`); add focused tests for: the
   sms_claim_replies counter increments on a webhook claim, and a raised
   exception inside a metrics helper does not fail the request.
5. With `SENTRY_DSN` unset, startup logs show Sentry skipped and nothing
   is sent anywhere.
6. `docs/observability-cicd/README.md` is up to date (see 1e).

### 1e. Docs

Update `docs/observability-cicd/README.md`: step 1 (Elastic IP) = done
2026-10-25 (PR #115); step 2 (observability) = in progress. Remove the
hardcoded instance id: the instance is identified by its tag
`Name=apf-staffing-platform-prod-app`, since it is now replaceable.

---

## PR2A — Secret + IAM only (Terraform, NO instance change)

### 2a. New secret

In the `secrets-manager` module pattern: a secret named
`<name_prefix>-observability`, created WITHOUT a Terraform-managed value
(no `aws_secretsmanager_secret_version`, or one with
`lifecycle { ignore_changes = [secret_string] }`), so Terraform never
overwrites what the human puts in it. Expected JSON keys, documented in the
PR description: `GRAFANA_PROM_URL`, `GRAFANA_PROM_USER`, `GRAFANA_LOKI_URL`,
`GRAFANA_LOKI_USER`, `GRAFANA_TOKEN`, `SENTRY_DSN`. Add its ARN to
`module.app_runtime.secret_arns` in `infra/environments/prod/main.tf`.

Do NOT touch `user_data.sh.tftpl` in this PR.

### PR2A acceptance criteria

1. `terraform plan` shows the secret ADDED and the instance role's secrets
   policy UPDATED in place, and **no change to `aws_instance`**. Any
   instance replacement in this plan = stop and report.
2. `terraform fmt -check -recursive infra/` passes.

### Between PR2A and PR2B (human)

After applying PR2A, fill the secret with the real values (one JSON object
with the six keys), from the console or with:

```
aws secretsmanager put-secret-value --region ca-central-1 \
  --secret-id <name_prefix>-observability \
  --secret-string file://observability.json
```

Then delete `observability.json` from disk.

---

## PR2B — Alloy agent in user_data (REPLACES the instance)

### 2b. `user_data.sh.tftpl` additions

- Fetch the observability secret at boot (same pattern as the app secret),
  write `/etc/alloy/config.alloy` and `/etc/alloy/env` (0600, root).
- `SENTRY_DSN` and `GIT_SHA` passed into the `apf-app` container env
  (`docker run -e SENTRY_DSN=... -e GIT_SHA=...`; GIT_SHA sourced from an
  image label or left to the image ENV — do not invent a new mechanism).
- Add `-p 127.0.0.1:9091:9091` to the `apf-app` docker run so the host
  can scrape the container's metrics port; verify port 9091 is NOT in any
  security group ingress rule (it must stay host-local).
- New systemd unit `apf-alloy.service` mirroring `apf-app.service`:
  `docker run --name apf-alloy --network host
  -v /etc/alloy:/etc/alloy:ro
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro
  -v /var/run/docker.sock:/var/run/docker.sock:ro
  grafana/alloy:<pinned version> run /etc/alloy/config.alloy`.
- `config.alloy` must implement: (1) `prometheus.scrape` of
  `localhost:9091` every 15s + `prometheus.remote_write` to Grafana Cloud
  with the token; (2) node/system metrics via alloy's unix exporter
  component (disk, mem, cpu); (3) `loki.source.docker` targeting the
  `apf-app` container → `loki.write` to Grafana Cloud.

### PR2B acceptance criteria

1. `terraform -chdir=infra/environments/prod plan` succeeds. Expected:
   `aws_instance.this` REPLACED and `aws_eip_association.app` updated as a
   consequence — nothing else. Flag the replacement clearly in the PR
   description so the human schedules the apply.
2. `terraform fmt -check -recursive infra/` passes.
3. The rendered user_data (`terraform plan` output or `templatefile`
   unit-render) contains both systemd units and no plaintext token.
4. The PR description quotes the AMI id the plan will use (see checklist).
5. (Human, post-apply) `/health/ready` returns 200 through
   `api.kouamvision.com`; Grafana Cloud explorer shows `staffig_*` and
   `up{job=...} == 1`; Loki shows apf-app log lines; reboot rehearsal:
   both units come back without manual action.

### PR2B pre-apply checklist (human, mandatory)

The 2026-11-15 outage came from an instance replacement: the AMI filter
resolved to an image that could not boot on this instance. The filter is
now restricted to `al2023-ami-2023.*-x86_64`, but `most_recent = true`
still means the AMI changes whenever Amazon publishes a new release, and
`ignore_changes = [ami]` does NOT apply to a replacement. So, before
`terraform apply`:

1. **RDS is running.** `aws rds describe-db-instances --region ca-central-1
   --query 'DBInstances[].DBInstanceStatus'` = `available`. Migrations run
   when the new instance boots; with RDS stopped, `/health/ready` stays 503
   (the 2026-06-03 failure).
2. **The secret is filled.** `aws secretsmanager get-secret-value` on
   `<name_prefix>-observability` returns the six keys with real values.
3. **The plan's scope.** Only `aws_instance.this` replaced and the EIP
   association updated. Anything else = stop.
4. **The AMI.** Take the `ami` value of the new instance from the plan,
   then run `aws ec2 describe-images --region ca-central-1 --image-ids <ami>
   --query 'Images[0].[Name,BlockDeviceMappings[0].Ebs.VolumeSize]'`. The
   name must be a standard `al2023-ami-2023.…-x86_64` image (no `minimal`,
   `ecs` or `neuron`) and the snapshot size must be at most 20 GB.
5. **The window.** Apply at a quiet hour. The API is unavailable during the
   replacement (boot, image pull, migrations), typically a few minutes.
   Warn pilot organizations if any are active.
6. **The way back.** Rollback = revert the PR2B commit and apply again (a
   second replacement). The Elastic IP keeps the address, so Cloudflare
   needs no change.

Recommendation, decision left to the human: pin the exact AMI id in a
variable instead of `most_recent`, so that a replacement only changes the
AMI when someone decides it.

---

## PR3 — Dashboards + alerts (repo artifacts + guided console work)

- New directory `observability/` in the repo:
  - `dashboards/overview.json`, `dashboards/service-health.json`,
    `dashboards/coverage-operations.json` — full Grafana dashboard JSON,
    importable as-is. Panels per the plan: Overview = readiness, 5xx rate,
    p95, `staffig_requests_unfilled`, notification failure rate, release
    annotations. Service health = per-route latency/errors, disk/mem/cpu,
    RDS CPU + connections (datasource: CloudWatch), container restarts.
    Coverage ops = time-to-fill histogram, notifications by channel,
    sms claim outcomes, clock events by geo_ok, sweep durations.
  - `alerts/rules.md` — the six rules with exact PromQL, thresholds,
    durations, severity, and routing (critical → interrupting channel,
    warning → email), written so the human can create them in the Grafana
    UI in one sitting:
    readiness ≠ 200 (2m, crit — implement as a blackbox/synthetic check in
    Grafana Cloud against `https://api.kouamvision.com/health/ready`, or
    `absent(up)` as fallback); notification failure rate >5%/10m (crit);
    5xx >1%/5m (crit); `staffig_scheduler_sweep_seconds` absent 15m (warn);
    p95 >1.5s/10m (warn); RDS connections >80% max (warn, CloudWatch).
- Terraform (small): `aws_iam_user` `grafana-cloudwatch` with the AWS
  managed policy `CloudWatchReadOnlyAccess` + access key; key surfaced as
  a sensitive output for the human to paste into Grafana's CloudWatch
  data source. Same plan/fmt gates as PR2.

### PR3 acceptance criteria

1. Each dashboard JSON is valid (parses; passes a JSON schema sanity
   check) and every panel query references only metrics defined in PR1,
   standard instrumentator metrics, alloy system metrics, or CloudWatch
   `AWS/RDS` namespaces.
2. `alerts/rules.md` PromQL expressions are syntactically valid.
3. (Human) dashboards imported and showing data; each alert rule tested
   once by forcing its condition (e.g. stop the app container for the
   readiness alert during a maintenance window).

---

## PR4 — Close the loop: annotate, bake, auto-rollback (deploy script)

Modify `scripts/deploy-backend.sh` only. Keep every existing phase; append
the steps below.

Credentials (human, before PR4): the instance token from PR2A only WRITES
metrics and logs. The deploy script, which runs on the human's machine,
needs two more, stored in a separate secret `<name_prefix>-deploy-observability`
and read with `aws secretsmanager get-secret-value` — never hardcoded:
`GRAFANA_URL` + `GRAFANA_SA_TOKEN` (a Grafana service-account token
allowed to write annotations) and `GRAFANA_PROM_QUERY_URL` +
`GRAFANA_READ_TOKEN` (an access-policy token with `metrics:read`, for the
bake queries), and `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`
(a Sentry auth token allowed to create releases; the DSN cannot do this).

Steps:

1. Build with `--build-arg GIT_SHA=${COMMIT}`.
2. Before rolling: record the previous live SHA tag (from ECR, the image
   currently tagged `:latest`) into a variable for rollback.
3. After the existing `/health/ready` gate passes: POST a Grafana
   annotation (`deploy sha-${COMMIT}`) through the Grafana HTTP API, and
   create a Sentry release for `${COMMIT}` through the Sentry API.
4. Bake: for 5 minutes, every 30s query Grafana Cloud's Prometheus API
   for 5xx rate and p95; compare against fixed thresholds (5xx >1%,
   p95 >1.5s sustained over 3 consecutive samples).
5. On breach: retag the recorded previous SHA as `:latest`, push, reboot
   the instance (resolved by tag, per Step 0), poll `/health/ready`,
   print a loud FAILED-AND-ROLLED-BACK summary, exit non-zero.
6. On success: annotate `bake passed`, exit 0.
7. New flag `--no-bake` to skip 4–6 (first deploys, emergencies).

### PR4 acceptance criteria

1. `bash -n` passes; `shellcheck` clean or exceptions justified inline.
2. Dry-run mode (`--dry-run`, add it) prints every external call it
   would make, without executing pushes/reboots — verified in CI-less
   local run.
3. (Human) one real deploy with bake passing; one rehearsal where a
   deliberately broken image (e.g. route that 500s under the smoke
   traffic) triggers rollback and the old SHA comes back live.

---

## Suggested prompts to Claude Code, one per PR

> Implement PR1 of SPEC_OBSERVABILITY.md. Respect the Global non-goals.
> Stop after the PR1 acceptance criteria pass locally and show me the
> results.

(then PR2A, PR2B, PR3, PR4 — sequentially, after each human verification;
PR2B only after its pre-apply checklist is complete.)
