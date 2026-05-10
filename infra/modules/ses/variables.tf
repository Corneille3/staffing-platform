variable "name_prefix" { type = string }

variable "aws_region" {
  description = "Used to build the SES SMTP endpoint hostname (email-smtp.<region>.amazonaws.com)."
  type        = string
}

variable "domain_name" {
  description = <<-EOT
    DNS zone to verify with SES (e.g. "staffig.kouamvision.com" or
    "kouamvision.com"). Once verified, any mailbox under this zone can be
    used as the From address. DKIM CNAMEs are output for you to add to
    DNS — verification finalizes once they resolve.
  EOT
  type        = string
}

variable "mail_from_address" {
  description = <<-EOT
    The full email address the app will send From (e.g.
    "noreply@staffig.kouamvision.com"). The domain part must be under
    ``domain_name`` (or equal to it). Exported to the app's SMTP_FROM.
  EOT
  type        = string
}

variable "tags" { type = map(string) }
