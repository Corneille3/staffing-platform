# AWS SES — DKIM verification complete

**Date:** 2026-05-10 20:37:48 GMT
**Region:** ca-central-1
**Domain:** `staffig.kouamvision.com`
**AWS account:** 515275664907
**Event type:** `AWS_SES_DKIM_PENDING_TO_VERIFIED`

DKIM setup for `staffig.kouamvision.com` is verified. Outbound mail sent through Amazon SES (or Pinpoint) from any address under this domain in `ca-central-1` will be DKIM-signed, which improves deliverability and reduces spam-folder placement.

## What this does and doesn't change

- **Does** — Mail is DKIM-signed now. No code changes required; SES handles signing transparently once the DNS records are verified.
- **Does not** — Lift the SES sandbox. The account is still sandboxed (200 emails/day, only-to-verified recipients). Production-access request is still pending. See [CLAUDE.md → Known gaps #1](../CLAUDE.md) for the recipient pre-verification workaround.

## Notes

> Settings for individually verified email addresses override domain-level settings. If DKIM is enabled for a verified domain but disabled for a verified email address in that domain, mail from that address will not be DKIM-signed.

For more on DKIM with SES: <http://docs.aws.amazon.com/ses/latest/DeveloperGuide/dkim.html>

## Raw notification text

```
DKIM setup SUCCESS for staffig.kouamvision.com in Canada (Central) region

Congratulations! Your DKIM setup for the domain staffig.kouamvision.com is
complete. You can now send DKIM-signed emails from any address within this
domain through both Amazon SES and Amazon Pinpoint.

Please note that the settings for individually verified email addresses
override domain-level settings. For example, if you enable DKIM signing for
a verified domain but disable DKIM signing for a verified email address in
that domain, then emails from that email address will not be DKIM-signed.

For more information about DKIM, see the Amazon SES Developer Guide at
http://docs.aws.amazon.com/ses/latest/DeveloperGuide/dkim.html .

Please note that this email only relates to the Canada (Central) region.

Thank you for using Amazon Web Services.

Message metadata
  Affected account:       515275664907
  Event type code:        AWS_SES_DKIM_PENDING_TO_VERIFIED
  Event region:           ca-central-1
  Service:                SES
  Event type category:    accountNotification
  Start time:             Sun, 10 May 2026 20:37:48 GMT
```
