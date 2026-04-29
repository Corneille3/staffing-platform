# ADR-004: Authentication provider — Clerk

Status: Accepted (supersedes prior Cognito direction)

The platform will use **Clerk** for end-user authentication across the worker,
org admin, and APF admin surfaces. Earlier scaffolding referenced Amazon
Cognito; that direction is now rejected.

## Why Clerk

- Faster path to a working auth UI (hosted sign-in/sign-up, session
  management, multi-factor) without standing up a Cognito User Pool, app
  client, custom domain, and managed UI configuration.
- Cleaner Next.js integration (`@clerk/nextjs` middleware + components) with
  no DIY hosted-UI redirect dance.
- Per-user `public_metadata` is a natural place to carry our `role` claim
  (`worker` / `org_admin` / `apf_admin`).

## What this means

- **Backend** verifies Clerk JWTs via the Clerk-issued JWKS URL. Issuer is
  fixed per Clerk instance. Role is read from `public_metadata.role`
  (with `org_role` and `role` as fallbacks).
- **Database** carries `users.clerk_user_id` (replaces the prior
  `cognito_sub` column).
- **Frontend** integrates `@clerk/nextjs` (not yet wired — current code uses
  the dev role + worker selectors).
- **Terraform** stores `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
  `CLERK_JWKS_URL` in Secrets Manager. No User Pool resources are created.
- **No AWS Cognito resources** are provisioned in any module.

## Out of scope here

- Choice of Clerk plan or organization features.
- Migration tooling — there is no production data, so no user migration is
  required.
