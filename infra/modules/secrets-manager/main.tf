resource "aws_secretsmanager_secret" "app_env" {
  name_prefix = "${var.name_prefix}-app-env-"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "app_env" {
  secret_id = aws_secretsmanager_secret.app_env.id
  secret_string = jsonencode({
    DATABASE_URL            = var.db_url
    CLERK_PUBLISHABLE_KEY   = var.clerk_publishable_key
    CLERK_SECRET_KEY        = var.clerk_secret_key
    CLERK_JWKS_URL          = var.clerk_jwks_url
    APP_ENV                 = var.app_env
    APP_PORT                = tostring(var.app_port)
  })
}
