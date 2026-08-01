# GitHub main branch protection

## Scope

`main` is protected after B003 is merged. Changes reach `main` through a pull
request from a short-lived task branch. Force-push and branch deletion are
disabled for `main`.

## Required checks

The required status check contexts are exact and stable:

- `quality / format`
- `quality / lint`
- `quality / typecheck`
- `quality / unit`
- `contracts / openapi`
- `auth / integration`
- `security / secret-scan`
- `database / migration-smoke`

Branch protection requires all eight checks to pass on the latest commit and
requires the branch to be up to date before merge. Administrators do not bypass
these checks during normal development.

## Workflow security

All workflows start with `contents: read`. GitHub Actions use full commit SHAs;
Gitleaks 8.30.1 and actionlint use immutable container digests. CI installs
pnpm 11.18.0 exactly and uses `pnpm install --frozen-lockfile`. No workflow has
a production deployment, production credential, remote Supabase operation, or
write permission.

## Controlled negative evidence

The manually dispatched workflows expose test-only inputs that create ephemeral
format, lint, typecheck, unit, secret-scan, or migration-policy failures inside
the runner. The canaries are never committed. A failed required context must
leave a pull request unmergeable; the run URL and branch-protection API response
are recorded in the G1 evidence document.

## GitHub configuration

Repository administrators apply the following settings to `main`:

- Require a pull request before merging.
- Require the eight status checks above and require branches to be up to date.
- Require conversation resolution.
- Block force-pushes and deletion.
- Do not allow bypass of the required checks.

The repository API response is the operational source of truth. This document
must be updated in the same change if a required context name changes.
