#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../environments/prod"
terraform init
terraform fmt -recursive ../../
terraform validate
terraform plan -out=plan.out
