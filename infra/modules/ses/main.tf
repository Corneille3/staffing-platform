# SES outbound email for the Staffig backend.
#
# Pieces provisioned here:
#   1. SES domain identity for ``var.domain_name`` and its DKIM keypair.
#      The DKIM tokens are emitted as a ``cname_records`` output;
#      operator adds them to Cloudflare and SES marks the identity
#      verified within ~10 minutes.
#   2. An IAM user with permission to call ``ses:SendRawEmail``, plus
#      an access key. The access key's ``ses_smtp_password_v4`` attribute
#      is the SMTP password the backend uses; the access key id is the
#      SMTP username.
#
# Note: new SES accounts start in **sandbox**. Until production access
# is granted (one-time review via the AWS console under SES → "Request
# production access"), only verified recipient addresses receive mail.
# For sandbox testing, add ``aws_ses_email_identity`` rows for the
# specific addresses you want to test with — or do it via the console.

resource "aws_ses_domain_identity" "this" {
  domain = var.domain_name
}

resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
}

resource "aws_iam_user" "smtp" {
  name = "${var.name_prefix}-ses-smtp"
  tags = var.tags
}

resource "aws_iam_user_policy" "smtp" {
  name = "${var.name_prefix}-ses-send"
  user = aws_iam_user.smtp.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendRawEmail", "ses:SendEmail"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_access_key" "smtp" {
  user = aws_iam_user.smtp.name
}
