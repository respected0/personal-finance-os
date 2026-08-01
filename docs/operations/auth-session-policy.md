# Local authentication and session policy

## Boundary

Supabase Auth is enabled only for the local/test stack in M0. Public signup is
disabled; a trusted local test administrator creates the synthetic invited
identity. The normal browser and BFF path uses only the publishable key and user
session context. No production project, credential, email delivery, or real
identity is created.

Provider session material is managed by the server-side Supabase SSR adapter
with `HttpOnly`, `Secure`, `SameSite=Lax`, and root-path cookie options. Browser
source must not use localStorage/sessionStorage for auth, and normal runtime
source must not reference service_role credentials.

## Assurance policy

- Public signup: disabled; invite/admin bootstrap only.
- First factor: email and password in Supabase Auth; application DB stores no
  password hash.
- Second factor: TOTP; protected write context requires AAL2.
- Idle timeout: 30 minutes.
- Absolute AAL2 age: 12 hours.
- Sensitive export/restore/delete/MFA/recovery proof: younger than 5 minutes.
- A valid AAL2 session does not repeat TOTP for normal operations.

## Verification

`pnpm auth:integration` starts the local Auth stack, proves signup rejection,
creates one synthetic invited identity, performs password login, enrolls and
verifies a TOTP factor, confirms AAL2, deletes the identity, and stops the stack.
The service-role value is read only from local CLI status inside this test and
is never printed or used by application runtime.

`pnpm auth:browser` runs Chromium at desktop and 390×844 and proves both browser
storage areas and visible cookies contain no auth tokens. Unit tests enforce
cookie attributes and the 30-minute, 12-hour, and 5-minute boundaries.
