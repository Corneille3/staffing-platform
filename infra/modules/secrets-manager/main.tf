resource "aws_secretsmanager_secret" "app_env" {
  name_prefix = "${var.name_prefix}-app-env-"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "app_env" {
  secret_id = aws_secretsmanager_secret.app_env.id
  secret_string = jsonencode({
    DATABASE_URL          = var.db_url
    COGNITO_REGION        = var.cognito_region
    COGNITO_USER_POOL_ID  = var.cognito_user_pool_id
    COGNITO_APP_CLIENT_ID = var.cognito_app_client_id
    COGNITO_ISSUER_URL    = var.cognito_issuer_url
    COGNITO_JWKS_URL      = var.cognito_jwks_url
    APP_ENV               = var.app_env
    APP_PORT              = tostring(var.app_port)
  })
}
