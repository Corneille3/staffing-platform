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

variable "platform_mfa_enforced" {
  type        = bool
  default     = true
  description = "Tier-0 2FA gate (PLATFORM_HANDOFF §1). Set false while the Clerk plan has no MFA (paid feature)."
}

# SMS (Twilio). Empty = SMS disabled — SmsNotificationService skips when the
# account SID is blank, so environments without credentials keep working.
variable "twilio_account_sid" {
  type      = string
  default   = ""
  sensitive = true
}
variable "twilio_auth_token" {
  type      = string
  default   = ""
  sensitive = true
}
variable "twilio_from_number" {
  type        = string
  default     = ""
  description = "E.164, e.g. +15145551234"
}

# Web Push (PWA). Empty = push disabled — WebPushService skips when the keys
# are blank, so environments without them keep working.
variable "vapid_public_key" {
  type    = string
  default = ""
}
variable "vapid_private_key" {
  type      = string
  default   = ""
  sensitive = true
}
variable "vapid_subject" {
  type        = string
  default     = "mailto:noreply@staffig.kouamvision.com"
  description = "mailto: contact for push-service operators"
}

variable "tags" { type = map(string) }

# Shared secret of the public lead intake (marketing site -> API, header
# X-Intake-Secret). Blank = the intake route answers 404. Generate with
# `openssl rand -hex 32`; the value lives in terraform.tfvars and in the
# marketing site's Vercel env (LEADS_INTAKE_SECRET).
variable "leads_intake_secret" {
  type      = string
  default   = ""
  sensitive = true
}
