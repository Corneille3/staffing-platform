output "app_env_secret_name" {
  value = aws_secretsmanager_secret.app_env.name
}

output "app_env_secret_arn" {
  value = aws_secretsmanager_secret.app_env.arn
}

# Null when the environment does not create the observability secret.
output "observability_secret_name" {
  value = one(aws_secretsmanager_secret.observability[*].name)
}

output "observability_secret_arn" {
  value = one(aws_secretsmanager_secret.observability[*].arn)
}
