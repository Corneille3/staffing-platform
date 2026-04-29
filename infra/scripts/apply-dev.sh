#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../environments/dev"
terraform apply plan.out
