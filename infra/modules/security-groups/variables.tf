variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "admin_cidr_blocks" {
  type    = list(string)
  default = []
}

variable "tags" {
  type = map(string)
}
