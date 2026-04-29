variable "name_prefix" { type = string }

variable "db_url" {
  type      = string
  sensitive = true
}

variable "cognito_region" { type = string }
variable "cognito_user_pool_id" { type = string }
variable "cognito_app_client_id" { type = string }
variable "cognito_issuer_url" { type = string }
variable "cognito_jwks_url" { type = string }
variable "app_env" { type = string }
variable "app_port" { type = number }
variable "tags" { type = map(string) }
