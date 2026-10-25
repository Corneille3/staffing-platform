# SPEC — Observability for Staffig (Track A)

Status: ready to implement AFTER SPEC_STEP0_ELASTIC_IP is merged, applied,
and verified (EIP live, Cloudflare updated, deploy script resolves by tag).
Branch: `feature/observability`
Structure: 4 sequential PRs. Do not combine them. Each PR has its own
acceptance criteria; stop after each and hand back to the human.

Reference plan (context, decisions, rationale): the project doc
`claude/observability-plan.md` in the user's Claude project. This spec is
self-contained — implement from THIS file.

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

## Human prerequisites (before PR2 can be tested)

The human provides, as a new Secrets Manager secret (see PR2):
- Grafana Cloud: Prometheus remote_write URL + username (instance id),
  Loki push URL + username, one API token with metrics:write + logs:write.
- Sentry: project DSN.
Until these exist, PR1 and PR2 can still be built and reviewed; end-to-end
verification waits for the secret.

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

---

## PR2 — Infra: secret + alloy agent (Terraform only)

### 2a. New secret

In the `secrets-manager` module pattern: a secret named
`<name_prefix>-observability` holding JSON keys `GRAFANA_PROM_URL`,
`GRAFANA_PROM_USER`, `GRAFANA_LOKI_URL`, `GRAFANA_LOKI_USER`,
`GRAFANA_TOKEN`, `SENTRY_DSN` (values placeholder; human fills in console).
Add its ARN to `module.app_runtime.secret_arns` in
`infra/environments/prod/main.tf`.

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

### PR2 acceptance criteria

1. `terraform -chdir=infra/environments/prod plan` succeeds. Expected:
   the new secret + policy attachment ADDED, and `aws_instance` REPLACED
   (this is the intended, Step-0-enabled replacement — flag it clearly in
   the PR description so the human schedules the apply).
2. `terraform fmt -check -recursive infra/` passes.
3. The rendered user_data (`terraform plan` output or `templatefile`
   unit-render) contains both systemd units and no plaintext token.
4. (Human, post-apply) Grafana Cloud explorer shows `staffig_*` and
   `up{job=...} == 1`; Loki shows apf-app log lines; reboot rehearsal:
   both units come back without manual action.

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

Modify `scripts/deploy-backend.sh` only. Keep every existing phase; append:

1. Build with `--build-arg GIT_SHA=${COMMIT}`.
2. Before rolling: record the previous live SHA tag (from ECR, the image
   currently tagged `:latest`) into a variable for rollback.
3. After the existing `/health/ready` gate passes: POST a Grafana
   annotation (`deploy sha-${COMMIT}`) and create a Sentry release via
   their APIs (tokens read from the observability secret via
   `aws secretsmanager get-secret-value` — never hardcoded).
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

(then PR2, PR3, PR4 — sequentially, after each human verification.)
