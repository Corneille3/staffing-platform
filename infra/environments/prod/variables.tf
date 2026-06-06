variable "aws_region" { type = string }
variable "project_name" { type = string }
variable "environment" { type = string }
variable "vpc_cidr" { type = string }
variable "public_subnet_cidrs" { type = list(string) }
variable "private_subnet_cidrs" { type = list(string) }
variable "admin_cidr_blocks" { type = list(string) }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
variable "db_instance_class" { type = string }
variable "backup_retention_period" { type = number }
variable "skip_final_snapshot" { type = bool }
variable "deletion_protection" { type = bool }
variable "app_instance_type" { type = string }
variable "app_port" { type = number }
variable "app_image" { type = string }
variable "clerk_publishable_key" { type = string }
variable "clerk_secret_key" {
  type      = string
  sensitive = true
}
variable "clerk_issuer_url" { type = string }
variable "clerk_jwks_url" { type = string }
variable "allowed_origins" { type = string }

# SES email
variable "ses_domain_name" {
  description = "DNS zone to verify with SES (e.g. staffig.kouamvision.com)."
  type        = string
}
variable "ses_mail_from_address" {
  description = "From address used by the backend (e.g. noreply@staffig.kouamvision.com). Must be under ses_domain_name."
  type        = string
}

# Bootstrap admin
variable "apf_bootstrap_email" { type = string }
variable "apf_bootstrap_first_name" {
  type    = string
  default = "APF"
}
variable "apf_bootstrap_last_name" {
  type    = string
  default = "Admin"
}

# Tier-0 2FA gate (PLATFORM_HANDOFF §1). False until the Clerk plan
# supports MFA enrollment (paid feature on production instances).
variable "platform_mfa_enforced" {
  type    = bool
  default = true
}
