#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../environments/prod"
terraform apply plan.out
