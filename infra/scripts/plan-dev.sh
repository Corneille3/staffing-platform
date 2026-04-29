#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../environments/dev"
terraform init
terraform fmt -recursive ../../
terraform validate
terraform plan -out=plan.out
