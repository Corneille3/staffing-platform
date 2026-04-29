# Infrastructure notes

This baseline now reflects the locked MVP architecture:

- single AWS account
- separate dev and prod VPCs
- application EC2 instance in a public subnet
- PostgreSQL RDS in private subnets
- no NAT gateway
- private S3 frontend bucket behind CloudFront OAC
- Clerk secrets stored in Secrets Manager

## Remaining placeholders

This Terraform is intentionally closer to real deployment, but a few values still need to be finalized before first apply:

- replace `CHANGE_ME` secrets in `terraform.tfvars`
- replace the placeholder `app_image`
- wire SES identities when email sending is ready
- move Terraform backend from local to S3 + DynamoDB lock before team use
- optionally swap direct public EC2 exposure for an ALB later
