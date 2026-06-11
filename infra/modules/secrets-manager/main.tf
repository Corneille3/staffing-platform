resource "aws_secretsmanager_secret" "app_env" {
  name_prefix = "${var.name_prefix}-app-env-"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "app_env" {
  secret_id = aws_secretsmanager_secret.app_env.id
  secret_string = jsonencode({
    DATABASE_URL          = var.db_url
    CLERK_PUBLISHABLE_KEY = var.clerk_publishable_key
    CLERK_SECRET_KEY      = var.clerk_secret_key
    CLERK_ISSUER_URL      = var.clerk_issuer_url
    CLERK_JWKS_URL        = var.clerk_jwks_url
    APP_ENV               = var.app_env
    APP_PORT              = tostring(var.app_port)
    ALLOWED_ORIGINS       = var.allowed_origins
    DEV_AUTH_BYPASS       = "false"

    # SMTP — sourced from the SES module. The backend's
    # EmailNotificationService reads these directly.
    SMTP_HOST     = var.smtp_host
    SMTP_PORT     = tostring(var.smtp_port)
    SMTP_USE_TLS  = tostring(var.smtp_use_tls)
    SMTP_USERNAME = var.smtp_username
    SMTP_PASSWORD = var.smtp_password
    SMTP_FROM     = var.smtp_from

    # Bootstrap admin — used by Alembic migration 20260507_0003 to
    # seed the first network admin, and by 20260510_0004 to bump them
    # to platform_admin. Bringing into Terraform so reruns don't
    # clobber the value (we previously set this via the AWS CLI; that
    # would now be overwritten by Terraform).
    APF_BOOTSTRAP_EMAIL      = var.apf_bootstrap_email
    APF_BOOTSTRAP_FIRST_NAME = var.apf_bootstrap_first_name
    APF_BOOTSTRAP_LAST_NAME  = var.apf_bootstrap_last_name

    # Tier-0 2FA gate (PLATFORM_HANDOFF §1). False until the Clerk plan
    # supports MFA enrollment (paid feature on production instances).
    PLATFORM_MFA_ENFORCED = tostring(var.platform_mfa_enforced)

    # SMS (Twilio). Blank SID = SmsNotificationService skips — SMS off.
    TWILIO_ACCOUNT_SID = var.twilio_account_sid
    TWILIO_AUTH_TOKEN  = var.twilio_auth_token
    TWILIO_FROM_NUMBER = var.twilio_from_number

    # Web Push (PWA). Blank keys = WebPushService skips — push off.
    VAPID_PUBLIC_KEY  = var.vapid_public_key
    VAPID_PRIVATE_KEY = var.vapid_private_key
    VAPID_SUBJECT     = var.vapid_subject
  })
}
