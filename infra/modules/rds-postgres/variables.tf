variable "name_prefix" { type = string }
variable "db_name" { type = string }
variable "db_username" { type = string }
variable "db_password" {
  type      = string
  sensitive = true
}
variable "private_subnet_ids" { type = list(string) }
variable "db_security_group_id" { type = string }
variable "instance_class" { type = string }
variable "backup_retention_period" { type = number }
variable "skip_final_snapshot" { type = bool }
variable "deletion_protection" { type = bool }
variable "tags" { type = map(string) }
