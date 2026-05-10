data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_iam_role" "ec2" {
  name_prefix = "${var.name_prefix}-ec2-role-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "ecr_read" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_role_policy" "secrets_access" {
  name_prefix = "${var.name_prefix}-secrets-"
  role        = aws_iam_role.ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.secret_arns
    }]
  })
}

resource "aws_iam_instance_profile" "ec2" {
  name_prefix = "${var.name_prefix}-instance-profile-"
  role        = aws_iam_role.ec2.name
}

resource "aws_instance" "this" {
  ami                         = data.aws_ami.amazon_linux.id
  instance_type               = var.instance_type
  subnet_id                   = var.subnet_id
  vpc_security_group_ids      = [var.app_security_group_id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  user_data_replace_on_change = true

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    app_port       = var.app_port
    app_image      = var.app_image
    app_env_secret = var.app_env_secret_name
    aws_region     = var.aws_region
  })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  metadata_options {
    http_tokens = "required"
  }

  # The data.aws_ami.amazon_linux data source resolves to "most_recent",
  # which drifts as AWS publishes new Amazon Linux 2023 images.
  # Without this lifecycle rule, every terraform apply would replace the
  # instance just to pick up the new AMI — losing the public IP that's
  # wired into Cloudflare DNS. The running instance still gets OS
  # security updates via the dnf auto-update in user_data + systemd.
  # When you want to rebuild on a fresh AMI, do it deliberately:
  # remove the ignore_changes line, run apply, restore it.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-app"
  })
}
