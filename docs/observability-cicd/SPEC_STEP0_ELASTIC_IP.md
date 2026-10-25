# SPEC — Step 0: Make the prod instance replaceable (Elastic IP)

Status: ready to implement
Branch: `feature/observability`
Estimated size: ~40 lines of Terraform + ~15 lines of bash
Downtime: none from the Terraform change itself; up to ~1 min of public
unreachability during the Cloudflare DNS switch (see Runbook).

## Why

The prod EC2 (`i-04a60b0aaf80c1528`) has an auto-assigned public IP
(`99.79.127.227`) that dies with the instance. Because
`user_data_replace_on_change = true`, ANY future change to `user_data`
(e.g. adding the observability agent, next spec) destroys and recreates
the instance and changes the IP — breaking the Cloudflare A record for
`api.kouamvision.com` and the hardcoded IP in `scripts/deploy-backend.sh`.

This spec pins the address to an Elastic IP and removes both hardcodings,
so the instance becomes disposable. It is a prerequisite for
SPEC_OBSERVABILITY (which will modify `user_data`).

## Non-goals — explicitly out of scope, do NOT touch

- NO changes to `user_data.sh.tftpl` (would recreate the instance — that
  is exactly what we are not ready for yet).
- NO ALB, ASG, ACM, or launch template (later spec).
- NO changes to the backend app, Dockerfile, or CI workflows.
- NO changes to `infra/environments/dev`.
- NO refactoring of `deploy-backend.sh` beyond the IP/instance-id
  resolution described below. Keep its polling logic exactly as is.
- Do NOT run `terraform apply`. Stop after `terraform plan` and show the
  plan to the human. Apply is a human action (see Runbook).

## Change 1 — Terraform: EIP in `infra/modules/app-runtime/main.tf`

Add:

```hcl
resource "aws_eip" "app" {
  domain = "vpc"
  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app-eip"
  })
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.this.id
  allocation_id = aws_eip.app.id
}
```

In `infra/modules/app-runtime/outputs.tf`:

- Change `public_ip` to `aws_eip.app.public_ip` (so
  `output "app_public_ip"` in the prod environment automatically reports
  the stable address; do not rename the output).

No changes to `aws_instance.this` (in particular, leave
`associate_public_ip_address = true` alone — the EIP simply replaces the
auto-assigned address on association).

Expected plan: **2 to add, 0 to change, 0 to destroy** (plus the output
value change). If the plan shows ANY destroy, stop and report — do not
apply.

## Change 2 — `scripts/deploy-backend.sh`: resolve instead of hardcode

Replace the hardcoded constants:

```bash
INSTANCE_ID="i-04a60b0aaf80c1528"
DIRECT_IP="99.79.127.227"
```

with runtime resolution by tag (both values from one call):

```bash
read -r INSTANCE_ID DIRECT_IP < <(aws ec2 describe-instances \
  --region "${REGION}" \
  --filters "Name=tag:Name,Values=apf-staffing-platform-prod-app" \
            "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].[InstanceId,PublicIpAddress]" \
  --output text)

if [ -z "${INSTANCE_ID}" ] || [ "${INSTANCE_ID}" = "None" ]; then
  echo "[deploy-backend] could not resolve prod instance by tag" >&2
  exit 1
fi
echo "==> resolved instance ${INSTANCE_ID} at ${DIRECT_IP}"
```

Rationale for tag-based resolution (vs `terraform output`): the script
must work without a local Terraform init/state, and the tag
`Name=apf-staffing-platform-prod-app` is set by the module
(`${var.name_prefix}-app`). Everything else in the script stays untouched.

## Change 3 — docs

- `CLAUDE.md`, "Manual deploy procedure": replace the hardcoded
  `99.79.127.227` and instance id references with "resolved automatically
  by `scripts/deploy-backend.sh` (tag `Name=…-prod-app`)"; note the
  stable EIP and that `terraform output app_public_ip` reports it.
- Add one line to the infra section: the API's public address is now an
  EIP and survives instance replacement.

## Runbook (human, after the PR is reviewed) — order matters

1. Merge the PR (or apply from the branch — human's call).
2. `terraform -chdir=infra/environments/prod apply` → note the new
   `app_public_ip` (the EIP).
3. **Immediately** update the Cloudflare A record for `api.kouamvision.com`
   to the EIP (proxy stays ON, orange cloud). Until this is done, the API
   is unreachable through Cloudflare because the origin IP changed at
   association time. Expect ≤1 min gap; do it at a quiet hour.
4. Verify: `curl -s http://<EIP>/health` → 200, and
   `curl -s https://api.kouamvision.com/health` → 200.
5. Rehearsal (recommended, proves the point of this spec):
   `aws ec2 reboot-instances --region ca-central-1 --instance-ids <id>`,
   wait, confirm the same EIP still answers.

## Acceptance criteria (Claude Code must verify 1–3 before handing off)

1. `terraform -chdir=infra/environments/prod plan` runs clean and shows
   2 to add / 0 to destroy.
2. `terraform fmt -check -recursive infra/` passes (CI gate).
3. `bash -n scripts/deploy-backend.sh` passes, and running the script's
   resolution snippet alone prints a valid instance id + IP.
4. (Human, post-apply) `https://api.kouamvision.com/health` returns 200
   and `deploy-backend.sh` completes a full deploy without edits.

## Rollback

`terraform destroy -target=aws_eip_association.app -target=aws_eip.app`
(module-addressed: `module.app_runtime.aws_eip*`), then point Cloudflare
back at the instance's auto-assigned public IP. The instance itself is
never touched by this spec.
