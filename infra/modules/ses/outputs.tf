output "domain" {
  description = "SES-verified domain identity."
  value       = aws_ses_domain_identity.this.domain
}

output "dkim_cname_records" {
  description = <<-EOT
    Cloudflare DNS records to add for SES to verify the domain. Each
    record is a CNAME from ``<token>._domainkey.<domain>`` to
    ``<token>.dkim.amazonses.com``. Once these resolve, SES marks the
    domain "Verified" within ~10 minutes.
  EOT
  value = [
    for token in aws_ses_domain_dkim.this.dkim_tokens : {
      name  = "${token}._domainkey.${var.domain_name}"
      type  = "CNAME"
      value = "${token}.dkim.amazonses.com"
    }
  ]
}

output "smtp_host" {
  value = "email-smtp.${var.aws_region}.amazonaws.com"
}

output "smtp_port" {
  value = 465
}

output "smtp_use_tls" {
  value = true
}

output "smtp_username" {
  description = "SMTP username = the SES IAM user's access key id."
  value       = aws_iam_access_key.smtp.id
  sensitive   = true
}

output "smtp_password" {
  description = "SMTP password derived from the IAM access key via the SES v4 signing algorithm (provided directly by the AWS provider)."
  value       = aws_iam_access_key.smtp.ses_smtp_password_v4
  sensitive   = true
}

output "smtp_from" {
  value = var.mail_from_address
}
