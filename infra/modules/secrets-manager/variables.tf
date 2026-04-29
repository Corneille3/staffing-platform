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
variable "clerk_jwks_url" { type = string }
variable "app_env" { type = string }
variable "app_port" { type = number }
variable "tags" { type = map(string) }
