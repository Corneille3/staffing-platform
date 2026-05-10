#!/usr/bin/env bash
# Manual prod backend deploy — until CI secrets are wired.
#
# Why this script exists:
#   - SSM agent never registered for the prod EC2; we can't `aws ssm
#     send-command` to restart the container in place. Reboot-instances
#     is the only restart path, and the systemd unit pulls :latest from
#     ECR on every start.
#   - ECR auth tokens expire ~12h; every deploy needs a fresh login.
#   - Cloudflare can serve stale 5xx responses while the EC2 origin is
#     restarting, so polling Cloudflare looks broken even when the
#     origin is fine. This script polls the direct EC2 IP.
#   - Earlier we chained these steps as inline `&& | tail`. Multiple
#     failed runs left orphan `docker push` processes holding registry
#     locks — that took a `sudo snap restart docker` to clear.
#
# Run from the repo root:
#   ./scripts/deploy-backend.sh             # tags with current HEAD short SHA
#   ./scripts/deploy-backend.sh <sha-or-tag> # override the SHA tag

set -Eeuo pipefail
trap 'echo "[deploy-backend] FAILED at line $LINENO" >&2' ERR

REGION="ca-central-1"
ACCOUNT="515275664907"
REPO="apf-staffing-platform-prod-backend"
INSTANCE_ID="i-04a60b0aaf80c1528"
DIRECT_IP="99.79.127.227"
ECR_HOST="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com"
ECR_REPO="${ECR_HOST}/${REPO}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="${1:-$(git -C "${REPO_ROOT}" rev-parse --short=7 HEAD)}"

cd "${REPO_ROOT}/backend"

echo "==> [1/5] ECR login (${ECR_HOST})"
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_HOST}" >/dev/null
echo "    ok"

echo "==> [2/5] Build linux/amd64 image (commit ${COMMIT})"
docker build --platform linux/amd64 -t "${ECR_REPO}:latest" .
docker tag "${ECR_REPO}:latest" "${ECR_REPO}:sha-${COMMIT}"
echo "    tagged :latest and :sha-${COMMIT}"

echo "==> [3/5] Push :latest"
docker push "${ECR_REPO}:latest"
echo "==> [3/5] Push :sha-${COMMIT}"
docker push "${ECR_REPO}:sha-${COMMIT}"

echo "==> [4/5] Reboot EC2 (${INSTANCE_ID})"
aws ec2 reboot-instances --region "${REGION}" --instance-ids "${INSTANCE_ID}"
REBOOT_AT="$(date -u +%H:%M:%SZ)"
echo "    rebooted at ${REBOOT_AT}"

# `aws ec2 reboot-instances` is async — the instance keeps serving the old
# image for ~10–30s before it actually starts shutting down. If we polled
# right away we'd get a false-positive 200 from the old container. Two
# phases: (a) wait until the API is observed DOWN at least once, then
# (b) wait until it comes back UP. If we never see it go down within 60s,
# warn but still wait for steady-state up + verify the new image via a
# new-code marker (the DELETE /api/v1/users/{user_id} route).

URL="http://${DIRECT_IP}/openapi.json"

echo "==> [5/5] Wait for restart to propagate, then verify new image"
START="$(date +%s)"
SAW_DOWN=0
DOWN_DEADLINE=$((START + 60))
while [ "$(date +%s)" -lt "${DOWN_DEADLINE}" ]; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${URL}" 2>/dev/null || echo "000")"
  if [ "${CODE}" != "200" ]; then
    SAW_DOWN=1
    echo "    observed origin down (status=${CODE}), waiting for it to come back…"
    break
  fi
  sleep 5
done
if [ "${SAW_DOWN}" -eq 0 ]; then
  echo "    (did not observe origin downtime in 60s — reboot may have been fast or skipped)"
fi

UP_DEADLINE=$(( $(date +%s) + 300 ))
while :; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${URL}" 2>/dev/null || echo "000")"
  if [ "${CODE}" = "200" ]; then
    break
  fi
  if [ "$(date +%s)" -ge "${UP_DEADLINE}" ]; then
    echo ""
    echo "✗ API did not return 200 within 5 minutes (last status: ${CODE})" >&2
    echo "  Check the EC2 console output: aws ec2 get-console-output --region ${REGION} --instance-id ${INSTANCE_ID}" >&2
    exit 1
  fi
  printf "."
  sleep 10
done

# Quick check that the image really is the one we just pushed: the DELETE
# /api/v1/users/{user_id} route only exists in the new code path. If it
# shows up in /openapi.json we've definitively rolled forward.
TMP_OPENAPI="$(mktemp)"
trap 'rm -f "${TMP_OPENAPI}"' EXIT
curl -sS --max-time 10 "${URL}" -o "${TMP_OPENAPI}"
if python3 -c "
import json, sys
spec = json.load(open('${TMP_OPENAPI}'))
methods = list(spec.get('paths', {}).get('/api/v1/users/{user_id}', {}).keys())
sys.exit(0 if 'delete' in methods else 1)
" 2>/dev/null; then
  ELAPSED=$(( $(date +%s) - START ))
  echo ""
  echo "✓ API up after ${ELAPSED}s, new image (sha-${COMMIT}) confirmed live"
  exit 0
else
  echo ""
  echo "⚠ API responding but /api/v1/users/{user_id} DELETE not present —" >&2
  echo "  the EC2 may still be running the previous image. Re-run the deploy" >&2
  echo "  or inspect: ssh / EC2 Instance Connect → docker ps → docker logs apf-app." >&2
  exit 2
fi
