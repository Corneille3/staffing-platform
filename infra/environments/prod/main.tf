locals {
  name_prefix = "${var.project_name}-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

module "vpc" {
  source               = "../../modules/vpc"
  name_prefix          = local.name_prefix
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  tags                 = local.tags
}

module "security_groups" {
  source            = "../../modules/security-groups"
  name_prefix       = local.name_prefix
  vpc_id            = module.vpc.vpc_id
  admin_cidr_blocks = var.admin_cidr_blocks
  tags              = local.tags
}

module "frontend" {
  source      = "../../modules/s3-frontend"
  name_prefix = local.name_prefix
  tags        = local.tags
}

module "cloudfront" {
  source                      = "../../modules/cloudfront"
  name_prefix                 = local.name_prefix
  bucket_name                 = module.frontend.bucket_name
  bucket_arn                  = module.frontend.bucket_arn
  bucket_regional_domain_name = module.frontend.bucket_regional_domain_name
  tags                        = local.tags
}

module "db" {
  source                  = "../../modules/rds-postgres"
  name_prefix             = local.name_prefix
  db_name                 = var.db_name
  db_username             = var.db_username
  db_password             = var.db_password
  private_subnet_ids      = module.vpc.private_subnet_ids
  db_security_group_id    = module.security_groups.db_security_group_id
  instance_class          = var.db_instance_class
  backup_retention_period = var.backup_retention_period
  skip_final_snapshot     = var.skip_final_snapshot
  deletion_protection     = var.deletion_protection
  tags                    = local.tags
}

module "secrets" {
  source                = "../../modules/secrets-manager"
  name_prefix           = local.name_prefix
  db_url                = module.db.database_url
  clerk_publishable_key = var.clerk_publishable_key
  clerk_secret_key      = var.clerk_secret_key
  clerk_issuer_url      = var.clerk_issuer_url
  clerk_jwks_url        = var.clerk_jwks_url
  app_env               = var.environment
  app_port              = var.app_port
  tags                  = local.tags
}

module "app_runtime" {
  source                = "../../modules/app-runtime"
  name_prefix           = local.name_prefix
  subnet_id             = module.vpc.public_subnet_ids[0]
  app_security_group_id = module.security_groups.app_security_group_id
  instance_type         = var.app_instance_type
  app_port              = var.app_port
  app_image             = var.app_image
  app_env_secret_name   = module.secrets.app_env_secret_name
  secret_arns           = [module.secrets.app_env_secret_arn]
  aws_region            = var.aws_region
  tags                  = local.tags
}

module "ses" {
  source      = "../../modules/ses"
  name_prefix = local.name_prefix
  tags        = local.tags
}
