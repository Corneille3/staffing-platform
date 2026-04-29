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

output "frontend_bucket_name" {
  value = module.frontend.bucket_name
}

output "cloudfront_domain_name" {
  value = module.cloudfront.domain_name
}

output "db_endpoint" {
  value = module.db.db_endpoint
}

output "app_env_secret_name" {
  value = module.secrets.app_env_secret_name
}
