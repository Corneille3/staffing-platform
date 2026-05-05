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
