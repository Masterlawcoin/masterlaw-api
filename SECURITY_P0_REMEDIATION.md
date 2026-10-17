# Masterlaw API — P0 Security Remediation Plan

Date: 2026-08-27
Branch: `security/p0-remediation-2026-08-27`

## Status

This branch documents the security workstream. **P0 findings are still open until the closure criteria below are met and a post-remediation audit passes.** Do not describe the repository as secure based on this document alone.

No credentials, tokens, passwords, service-role keys, JWT secrets or marketplace API keys belong in this repository, this document, issues, pull requests, logs or screenshots.

## P0-1 — Previously exposed credentials / Git history

Risk: credentials that appeared in committed files or Git history must be treated as compromised even when the current file is ignored.

Closure criteria:
1. Inventory every affected credential without recording its value.
2. Rotate/revoke it at the provider and verify the old credential no longer works.
3. Remove secret-bearing blobs from repository history using a coordinated history rewrite.
4. Re-scan all reachable history and the working tree for secrets.
5. Re-deploy applications with only the new environment variables.

The history rewrite is intentionally not performed by this documentation PR because it rewrites shared Git history and must be coordinated after credential rotation.

## P0-2 — Role escalation during registration

Current risk: the registration handler accepts `rol` from the request body and persists it.

Required patch:
- Public/self-service registration must always create the least-privileged role (for example `cliente`).
- Elevated roles must be assigned only through an authenticated administrative flow with an explicit allow-list.
- Add tests proving that a caller cannot register as `ceo`, `admin`, `broker` or any other privileged role by changing JSON input.

## P0-3 — Service-role client and missing object-level authorization

Current risk: the backend uses a Supabase service-role client, which bypasses RLS, while several handlers read/update data without an owner/tenant filter.

Required patch:
- Create an endpoint authorization matrix: route, method, allowed roles, ownership/tenant scope, sensitive fields.
- Apply deny-by-default authorization helpers before every protected read/write.
- Filter rows by authenticated user/tenant where applicable.
- Restrict administrative/global reads to explicit privileged roles.
- Add cross-user tests that expect `403` or no rows when user A attempts to access user B data.
- Where practical, prefer user-scoped Supabase access/RLS rather than the service role for ordinary user operations.

## P0-4 — Hard-coded JWT fallback

Current risk: `server.js` and `panos-api.js` include a fallback JWT secret when `JWT_SECRET` is missing.

Required patch:
- Remove every hard-coded fallback.
- Fail fast on startup when `JWT_SECRET` is absent or too weak.
- Rotate the production JWT secret through the deployment secret store.
- Define the expected consequence for existing sessions (usually forced re-authentication).

## P0-5 — Public AI endpoint without adequate abuse controls

Current risk: `/api/ia/consulta` accepts requests without authentication and the application-level JSON body limit is large.

Required patch:
- Require authenticated access or a narrowly scoped public-use token if a public demo is intentionally retained.
- Add rate limiting per IP and authenticated account.
- Add quota/cost controls per account/plan.
- Add a route-specific payload/history limit smaller than the global body limit.
- Validate message/history shape and reject unsupported fields.
- Log only operational metadata; do not log confidential prompts or credentials by default.
- Test `401`, `429`, payload rejection and quota exhaustion behavior.

## P0-6 — Marketplace credentials stored without real encryption

Current risk: the API writes raw `api_key`/`token` input into fields named `*_encrypted`; naming a column "encrypted" does not encrypt the value.

Required patch:
- Use a managed secret store/KMS/Vault or application encryption with keys kept outside the database.
- Never return complete secrets from API responses.
- Restrict read/write access to the smallest necessary administrative/service scope.
- Migrate existing values and rotate credentials when exposure cannot be ruled out.
- Record rotation status and timestamps, never the secret value.

## P1 follow-up

- Upgrade dependencies after checking current advisories and run tests/audit.
- Remove tracked `node_modules` from Git index while keeping `node_modules/` ignored and retaining the lockfile.
- Apply `express-rate-limit` (or equivalent) to authentication, AI and sensitive write routes.
- Establish versioned Supabase migrations as the schema source of truth and document RLS/permissions.

## Verification gate

A P0 is closed only when all of the following are available:
- code/configuration change merged or deployed as applicable;
- credential rotation/revocation evidence where applicable (without secret values);
- automated/manual test proving the abuse path is blocked;
- secret/code scan results;
- second audit with **zero open P0 findings**.

Only after that gate should a sanitized security summary be used in investor due diligence.
