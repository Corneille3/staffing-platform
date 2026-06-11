locals {
  name_prefix = "${var.project_name}-${var.environment}"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

resource "aws_ecr_repository" "backend" {
  name                 = "${local.name_prefix}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
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

# Frontend is deployed on Vercel — S3 + CloudFront are not used.
# module "frontend" { ... }
# module "cloudfront" { ... }

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
  allowed_origins       = var.allowed_origins

  smtp_host     = module.ses.smtp_host
  smtp_port     = module.ses.smtp_port
  smtp_use_tls  = module.ses.smtp_use_tls
  smtp_username = module.ses.smtp_username
  smtp_password = module.ses.smtp_password
  smtp_from     = module.ses.smtp_from

  apf_bootstrap_email      = var.apf_bootstrap_email
  apf_bootstrap_first_name = var.apf_bootstrap_first_name
  apf_bootstrap_last_name  = var.apf_bootstrap_last_name

  platform_mfa_enforced = var.platform_mfa_enforced

  twilio_account_sid = var.twilio_account_sid
  twilio_auth_token  = var.twilio_auth_token
  twilio_from_number = var.twilio_from_number

  vapid_public_key  = var.vapid_public_key
  vapid_private_key = var.vapid_private_key
  vapid_subject     = var.vapid_subject

  tags = local.tags
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
  source            = "../../modules/ses"
  name_prefix       = local.name_prefix
  aws_region        = var.aws_region
  domain_name       = var.ses_domain_name
  mail_from_address = var.ses_mail_from_address
  tags              = local.tags
}
