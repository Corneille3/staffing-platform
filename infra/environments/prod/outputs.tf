output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "public_subnet_ids" {
  value = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  value = module.vpc.private_subnet_ids
}

output "app_public_ip" {
  value = module.app_runtime.public_ip
}

output "app_instance_id" {
  value = module.app_runtime.instance_id
}

output "db_endpoint" {
  value = module.db.db_endpoint
}

output "app_env_secret_name" {
  value = module.secrets.app_env_secret_name
}

output "ses_dkim_cname_records" {
  description = "Add these CNAMEs to Cloudflare for the SES domain to verify."
  value       = module.ses.dkim_cname_records
}

output "ses_domain" {
  value = module.ses.domain
}
