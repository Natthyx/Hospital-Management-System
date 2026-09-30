# Rule 04 — Security and Authentication

This system holds patient data. Treat every shortcut here as a defect.

## Authentication

- **Username + password.** Usernames are lowercase, 3 to 32 characters, `[a-z0-9._-]`. Email is optional.
- **Password hashing: argon2id** (`argon2` package). Parameters at or above the current OWASP minimum, configurable via env.
- Password policy: minimum 10 characters, must not equal the username, checked against a small bundled blocklist of common passwords (no network calls).
- Login errors are always generic: "Invalid username or password". Response time must not reveal whether the username exists (hash a dummy value for unknown users).
- **Lockout**: 5 consecutive failures lock the account for 15 minutes (`LOGIN_MAX_FAILURES`, `LOGIN_LOCK_MINUTES`). An admin with `users.reset_password`/unlock rights can unlock. Every failure and lockout is audited.
- **No email-based password reset** in the first versions (hospitals may be offline). An admin resets a password: the system sets a random temporary password shown once, and `must_change_password = true`.
- New and admin-reset accounts must change their password at first login before doing anything else.
- MFA (TOTP): the schema reserves a nullable field, but implementation is a later phase. Do not build it early.

## Sessions

- **Server-side sessions in PostgreSQL.** No JWTs, no tokens in `localStorage` or `sessionStorage`, no Redis.
- Session token: 32 random bytes from a CSPRNG, sent to the browser once; only its **SHA-256 hash** is stored.
- Cookie `hms_session`: `httpOnly`, `Secure` (mandatory in production; dev over http is the only exception, controlled by `COOKIE_SECURE`), `SameSite=Strict`, `Path=/`.
- Same-origin only: the Vite dev server proxies `/api` to the API so cookies are same-origin in development too. No wildcard CORS.
- **Idle timeout** 15 minutes (`SESSION_IDLE_MINUTES`), **absolute timeout** 12 hours (`SESSION_ABSOLUTE_HOURS`). `last_seen_at` is refreshed at most once per minute.
- Rotate the session on login. Invalidate on logout, on password change (other sessions), and when a user is disabled.
- Users can list and revoke their own sessions; admins with permission can revoke any.

## CSRF

- A per-session CSRF token is issued at login and returned in the login/`me` response body. State-changing requests (`POST`, `PATCH`, `PUT`, `DELETE`) must send it in `X-CSRF-Token`; the server compares it against the stored hash. Also verify the `Origin` header matches `APP_ORIGIN`.

## Authorization (RBAC)

- **Permission-based.** Endpoints declare `@RequirePermission('patient.read')`. Never check role names in code.
- Permissions are **defined in code** (`packages/shared/permissions`) and synced into the `permissions` table by `db:seed:required`. Hospitals compose roles from permissions; they cannot invent permissions.
- Naming: `resource.action`, lowercase. Actions: `read`, `create`, `update`, `void`, `dispense`, `approve`, etc.
- A user's effective permissions are the union of their roles' permissions. Resolve per request from the database (small cache with short TTL is allowed only if invalidated on role changes).
- **Default deny.** A missing decorator is a test failure (a test enumerates all routes and asserts each has a permission or `@Public()`).
- **Separation of duties:** the `admin` role manages users, roles, and system settings. It gets **no clinical permissions by default**.
- Guards against self-lockout: an admin cannot disable themselves, remove their own admin role, or remove the last active admin.
- Object-level checks: when a resource belongs to a scope (a department, a ward), enforce it in the service, not only by route permission. Test for IDOR (accessing another record by guessing an ID).
- **Break-glass** (emergency access outside normal scope) is a later, separately specified feature. It must require a reason and be heavily audited. Do not improvise it.

## Input and output safety

- Zod schemas with **strict** mode: unknown keys are rejected. Validate body, query, and params.
- Explicit response DTOs. Never return `password_hash`, token hashes, `mfa_secret`, or internal fields.
- Rate limiting via `@nestjs/throttler`: strict on `/auth/login`, sensible global limits.
- Security headers via `helmet`. A strict Content-Security-Policy with no external origins (fits rule 18, no internet dependency).
- Prisma parameterizes queries. Raw SQL only with tagged templates and only when necessary.
- File uploads (later phases): allow-list of types, size limits, randomized storage names, stored outside any web root, never executed or served inline without checks.

## Secrets and data protection

- Secrets only in environment variables; never in code, logs, or the repo. `.env.example` has placeholders only.
- Sensitive stored secrets (for example a future TOTP secret) are encrypted at the application level with a key from the environment.
- TLS is terminated at the deployment layer (reverse proxy). The app assumes HTTPS in production and refuses insecure cookies there.
- Backups and database-at-rest encryption are handled in Phase 8 (delivery hardening); design nothing that prevents them.

## Dependencies and supply chain

- Run `pnpm audit` in CI; fail on high/critical issues that have a fix.
- Lockfile committed. No install scripts from unknown packages without review.

## When in doubt

If a change weakens any rule above, stop and ask the owner. Do not decide alone.
