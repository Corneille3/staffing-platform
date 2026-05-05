terraform {
  backend "s3" {
    bucket         = "ai-compliance-copilot-devca-docs-ca-central-1"
    key            = "staffig-platform/prod/terraform.tfstate"
    region         = "ca-central-1"
    dynamodb_table = "staffig-prod-tflock"
    encrypt        = true
  }
}
