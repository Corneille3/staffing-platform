variable "name_prefix" { type = string }

variable "db_url" {
  type      = string
  sensitive = true
}

variable "clerk_publishable_key" { type = string }
variable "clerk_secret_key" {
  type      = string
  sensitive = true
}
variable "clerk_issuer_url" { type = string }
variable "clerk_jwks_url" { type = string }
variable "app_env" { type = string }
variable "app_port" { type = number }
variable "allowed_origins" { type = string }

# SMTP — populated from the SES module outputs. All required so we
# don't accidentally ship a half-configured email setup.
variable "smtp_host" { type = string }
variable "smtp_port" { type = number }
variable "smtp_use_tls" { type = bool }
variable "smtp_username" {
  type      = string
  sensitive = true
}
variable "smtp_password" {
  type      = string
  sensitive = true
}
variable "smtp_from" { type = string }

# Bootstrap admin — used by Alembic migrations to seed and promote
# the first network/platform admin. Set in terraform.tfvars (or as
# TF_VAR_apf_bootstrap_email).
variable "apf_bootstrap_email" { type = string }
variable "apf_bootstrap_first_name" {
  type    = string
  default = "APF"
}
variable "apf_bootstrap_last_name" {
  type    = string
  default = "Admin"
}

variable "tags" { type = map(string) }
