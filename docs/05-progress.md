# 05 — Progress Tracker

The agent updates this file at the end of every task. The owner signs off milestones here.

## Current milestone

**F4 Authentication** (status: complete — pending owner sign-off)

## Phase 0 — Foundation

- [x] F1 Repo and tooling (F1 signed off by owner: 2026-09-30)
- [x] F2 API skeleton (F2 signed off by owner: 2026-09-30)
- [x] F3 Identity data model (F3 signed off by owner: 2026-10-01)
- [x] F4 Authentication (implemented; pending owner sign-off)
- [ ] F5 Audit module
- [ ] F6 Web skeleton
- [ ] F7 Admin screens
- [ ] F8 Quality gate

Owner sign-off for Phase 0: _pending_

## Later phases (do not start until the previous phase is signed off and its spec is approved)

- [ ] Phase 1 — Reception and Registration
- [ ] Phase 2 — Clinical (Nurse and Doctor)
- [ ] Phase 3 — Pharmacy
- [ ] Phase 4 — Laboratory
- [ ] Phase 5 — Billing
- [ ] Phase 6 — Inpatient
- [ ] Phase 7 — Supporting modules
- [ ] Phase 8 — Delivery hardening

## Log (newest first)

Format: `YYYY-MM-DD — milestone — what was done — tests run — open issues`

2026-10-02 — F4 — Authentication:

- Migration `20261002000000_auth_csrf_token`: Renamed `sessions.csrf_token_hash` to `sessions.csrf_token` via PostgreSQL migration. Raw random 32-byte base64url CSRF token stored in plaintext in `sessions.csrf_token` per ADR-026.
- Password policy and blocklist:
  - Provenance verification: Verified primary provenance of `wikimedia/mediawiki-libs-CommonPasswords` (MIT) derived from Daniel Miessler's `SecLists/blob/aad07ff/Passwords/10_million_password_list_top_100000.txt` (MIT), originating from Mark Burnett's 2015 10M public-domain dataset. Registered in `docs/THIRD_PARTY_LICENSES.md`.
  - Bundled 2,312 entries (length >= 10, normalized lowercase NFKC) as `COMMON_PASSWORDS_SET` in `apps/api/src/modules/auth/data/password-blocklist.data.ts`.
  - Pure validation in `packages/shared/src/identity/password-rules.ts`: 10–128 chars, NFKC normalization, username containment rejection, run limits (identicals, character sequences, keyboard patterns >= 6), at least 6 distinct characters, and blocklist rejection.
- Concurrency limiter (`Argon2LimiterService`): Bounded concurrent Argon2id hashing operations (default concurrency 2, queue capacity 50, queue timeout 10s) in `apps/api/src/modules/auth/argon2-limiter.service.ts` per ADR-028.
- Cookies & Types: Added direct dependency `cookie@0.7.2` (MIT). Implemented local type declaration in `apps/api/src/types/cookie.d.ts` declaring only `parse` and `serialize` with zero external `@types/cookie` dependency (ADR-027). Browser-session cookie `hms_session` (httpOnly, SameSite=Strict, Path=/, no Max-Age or Expires; cleared with identical attributes). Ambiguous duplicate cookie rejection.
- Time abstraction: Injectable `Clock` (`SystemClock`, `TestClock`) in global `TimeModule` (`apps/api/src/common/time/`).
- Global security guards execution sequence:
  1. `ThrottlerGuard` (rate limiting; auth limit 10/min)
  2. `OriginGuard` (strict `APP_ORIGIN` validation with `Referer` fallback, ADR-030)
  3. `AuthGuard` (session lookup, constant-time CSRF verification via `crypto.timingSafeEqual` with length pre-check, idle timeout 15m, absolute timeout 12h, user active check, duplicate cookie check, and `must_change_password` gate)
  4. `PermissionGuard` (validates permissions from session context; default deny)
- Endpoints (`/api/v1/auth`):
  - `POST /auth/login`: Atomic lockout evaluation in single SQL UPDATE statement; generic 401 on login failure; no Set-Cookie when locked or failed; session replacement revocation on re-login; returns user, permissions, and CSRF token.
  - `POST /auth/logout`: Revokes active session in database and clears session cookie.
  - `GET /auth/me`: Returns current user, permissions, CSRF token, and `mustChangePassword`.
  - `POST /auth/change-password`: Verifies current password (counting failures toward lockout), validates new password policy, bumps version, revokes all other sessions, rotates session cookie and CSRF token.
  - `GET /auth/sessions`: Lists own active sessions without token hashes or CSRF tokens.
  - `DELETE /auth/sessions/:id`: Revokes own session (with 404 on IDOR attempts).
- Scheduled session retention cleanup: `SessionCleanupService` with `@Cron('0 * * * *')` via pinned `@nestjs/schedule@6.1.3` (MIT) purges sessions older than 30 days retention window (`expires_at < now - 30d OR (revoked_at IS NOT NULL AND revoked_at < now - 30d)`). Cron execution bypassed in `NODE_ENV === 'test'` (ADR-029).
- Admin emergency recovery CLI: Implemented `pnpm admin:reset-password --username <username> [--force]` (`scripts/admin-reset-password.mjs` and `apps/api/src/modules/auth/admin-recovery.ts`). Validates TTY or `--force`, requires typing username to confirm, increments user version, revokes active sessions with `admin_recovery_reset`, clears lockout counters, generates compliant temporary password, emits `auth.admin_recovery_reset` audit event, prints security notice to stderr and temporary password to stdout.
- Documentation & ADRs: Added ADR-026 (CSRF Defense), ADR-027 (Browser-Session Cookie), ADR-028 (Account Lockout & Concurrency Limiting), ADR-029 (Session Retention & Scheduled Purge), and ADR-030 (OriginGuard & Proxy). Updated Rule 01 error codes (`PASSWORD_CHANGE_REQUIRED`, `INVALID_CURRENT_PASSWORD`), `docs/02-foundation-spec.md`, and `docs/THIRD_PARTY_LICENSES.md`.
  — Tests run: `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm test` (29 suites, 200 tests) ✓, `pnpm build` ✓, `pnpm check:licenses` (709 packages) ✓.

2026-10-01 — F3 — Identity data model:

- Housekeeping: Renamed `scripts/db-reset-guard.ts` to `scripts/db-reset-guard.mts` via `git mv` and updated `scripts/db-reset.mjs` to import `.mts`; configured dedicated Jest ESM-to-CJS transformer for `.mts` files (`apps/api/test/mts-transformer.js`); eliminated `MODULE_TYPELESS_PACKAGE_JSON` warning cleanly while keeping 11/11 tests passing.
- Pinned `argon2` to exact version `0.45.1` (no caret) in `apps/api/package.json`; preserved `@prisma/*` packages in `pnpm.onlyBuiltDependencies` (`["@prisma/client", "@prisma/engines", "prisma", "argon2"]`); registered `argon2` and its 4 transitive dependencies in `docs/THIRD_PARTY_LICENSES.md`; verified all 705 packages compliant with permissive license policy.
- Shared domain types and catalogs (`packages/shared/src/identity`): defined `ROLE_CODE_REGEX` (`^[a-z][a-z0-9_]{1,49}$`), `PERMISSION_CODE_REGEX` (`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`), `USER_STATUSES` (`active`, `disabled`), `PERMISSIONS` catalog (11 foundation permissions), and types. Single source of truth across API, frontend, tests, and database constraints.
- Database schema & migrations: updated `apps/api/prisma/schema.prisma` preserving F2 datasource configuration (`DATABASE_MIGRATION_URL` and `SHADOW_DATABASE_URL`). Created migration `20261001000000_identity_data_model`:
  - 6 tables: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `sessions`.
  - Application-generated UUIDv7 via `@id @default(uuid(7)) @db.Uuid` without database defaults.
  - Mapped enum `user_status` (`active`, `disabled`).
  - Strict CHECK constraints on usernames, emails, codes, statuses, and Argon2id hash prefix.
  - Foreign keys with explicit `ON DELETE RESTRICT` and `ON UPDATE CASCADE` across all tables (including `sessions`).
  - Least-privilege grants for `hms_app`: `INSERT/SELECT/UPDATE` on entities, `INSERT/SELECT/DELETE` on join tables, `INSERT/SELECT/UPDATE/DELETE` on sessions. Zero `DELETE` or `TRUNCATE` on entities; zero `UPDATE` on join tables. Verified `PUBLIC` has zero privileges via `pg_class.relacl` `aclexplode`.
  - Reusable `set_updated_at` trigger attached only to tables containing `updated_at`. Omitted `enforce_version_increment` trigger per ADR-023 to avoid locking conflicts with login counter updates in F4.
- Test database isolation & safety: added `TEST_DATABASE_URL` and `TEST_DATABASE_MIGRATION_URL` safeguards. `jest.config.js` fails loudly if missing or not pointing to `hms_test`. Automatically maps test URLs onto `DATABASE_URL` and `DATABASE_MIGRATION_URL` for the test process only. Jest `globalSetup` runs `prisma migrate deploy` as owner against `hms_test`. Test cleaner strictly checks `SELECT current_database() === 'hms_test'` over the active connection. All test suites run sequentially (`--runInBand`).
- Required seed (`pnpm db:seed:required`): runnable via standalone CLI (`node apps/api/dist/database/seeds/cli.js`), checks if `dist` exists and exits with clear error ("Run pnpm build first") if absent. Upserts permissions, creates default roles without overwriting descriptions, ensures admin has all permissions, and creates admin user + assigns admin role in ONE atomic transaction with 24-character unambiguous password (`crypto.randomInt`, no `O, 0, o, l, 1, I`). Idempotent on second run. Tested for concurrent race safety and atomic rollback on midway crash.
- Drift check command: added `pnpm db:check:drift` to `package.json` and CI workflow; verified zero drift against migrations.
- Updated documentation and ADRs: added ADR-023 (Identity Schema & Concurrency Strategy), ADR-024 (Password Hashing with Argon2id), and ADR-025 (Test Database Isolation & Safety Safeguards) to `docs/04-decisions.md`. Updated `docs/02-foundation-spec.md` with complete F3 specifications and test suite catalog.
  — Tests run: `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm test` (21 suites, 128 tests) ✓, `pnpm build` ✓, `pnpm check:licenses` (705 packages) ✓, `pnpm audit --audit-level=high` ✓, `pnpm db:check:drift` ✓.

2026-09-30 — F2 — API skeleton (Defect Fixes & Owner Verification Response):

- Security guard implemented in `scripts/db-reset-guard.mjs`: `validateDbResetEnv` strictly verifies `NODE_ENV === 'development'`, `DATABASE_MIGRATION_URL` host in `[localhost, 127.0.0.1, ::1]`, database name in `[hms_dev, hms_test]`, and shadow database host. Integrated into `scripts/db-reset.mjs` before calling Prisma. Covered by 11 unit tests.
- Replaced symlink dependency on `apps/api/.env` with explicit root `.env` loading via `scripts/prisma.mjs` wrapper and Jest root `.env` loader; removed symlink and added `apps/api/.env*` to `.gitignore`.
- Unified Request ID handling via `resolveRequestId`: enforces `^[a-zA-Z0-9_-]{1,64}$`, replaces invalid client headers with `crypto.randomUUID()`, sets `genReqId` in Pino to share the identical validated ID across `req.id`, `x-request-id` response header, log lines, and error response bodies.
- Error envelope updated: `{ error: { code, message, details?, requestId } }` now guaranteed across all HTTP status codes (400, 401, 403, 404, 429, 500, 503).
- Success envelope: `ResponseEnvelopeInterceptor` globally wraps responses into `{ data: ... }` (and `{ data, meta }`), prevents double-wrapping, and bypasses error responses.
- Health module refactored to `apps/api/src/modules/health/` per Rule 01; removed `/health/liveness` and `/health/readiness`; `GET /api/v1/health` returns `{ data: { status: "ok", database: "connected" } }` without timestamp or connection leakage.
- Security headers & Swagger: Helmet CSP set to strict (`'self'`) across all API routes; relaxed CSP with `'unsafe-inline'` applied only to `/api/docs` and only in non-production when `SWAGGER_ENABLED=true`; Swagger disabled by default.
- Added comprehensive test suites:
  - `test/log-redaction.e2e-spec.ts`: proves redaction of Cookie, Authorization, CSRF, Set-Cookie, query string, query object, and body. Verified to fail if sensitive values leak.
  - `test/health.e2e-spec.ts`: verifies 200 data envelope, 404 on removed probe routes, 503 on database disconnection without leaking credentials, and recovery to 200 without app restart.
  - `test/route-audit.spec.ts`: enumerates all registered routes and verifies each declares `@Public()` or `@RequirePermission(...)`.
  - `test/security-guards.e2e-spec.ts`: verifies default-deny 401 on routes without `@Public()`, 400 with unrecognized keys details on strict Zod DTO, rejection of route parameter without ZodDto (`strictSchemaDeclaration`), and error envelope `requestId` coverage across 400, 401, 403, 404, 429, 500, 503.
  - `test/request-id.e2e-spec.ts`: echoes valid request ID, generates UUID for invalid format, generates UUID for missing header.
  - `test/swagger-csp.e2e-spec.ts`: verifies Swagger 200 in development, 404 when disabled/in production, and CSP relaxation isolation.
  - Silenced Logger stack traces in test runs to keep output clean.
- Updated documentation and ADRs: ADR-021 recorded owner approval for Python-2.0 and CC-BY-4.0; added ADR-022 for `deepmerge-ts` override; updated `.agents/rules/01-architecture.md` with `SERVICE_UNAVAILABLE` (503) and request ID rules; updated `docs/02-foundation-spec.md` with environment table, health spec, scripts, and full test list.
  — Tests run: `pnpm lint` ✓, `pnpm typecheck` ✓, `pnpm test` (12 suites, 57 tests) ✓, `pnpm build` ✓, `pnpm check:licenses` (699 packages) ✓, `pnpm audit --audit-level=high` ✓.

2026-09-30 — F1 — Repo and tooling scaffolded: pnpm workspace monorepo (apps/api, apps/web, packages/shared), TypeScript strict, ESLint flat config with type-aware rules, Prettier, Husky + lint-staged + commitlint, Docker Compose PostgreSQL 16 (hms_owner/hms_app roles, no hardcoded passwords, bind 127.0.0.1, named volume, healthcheck), Zod-validated env config in apps/api/src/config/, all root scripts (unimplemented ones exit non-zero), GitHub Actions CI (lint/typecheck/build/license-check/audit/secret-scan, pinned actions/Node/pnpm), license check script with policy JSON (SPDX expression handling), .editorconfig, .nvmrc, packageManager pin. ADR-001 updated with versions, ADR-015 added for shared build strategy. License check updated to scan full tree (prod + dev), added ADR-016 and updated license register for allowedDev (BlueOak-1.0.0, Python-2.0), updated placeholders to exit 0 with notice, updated CI audit to pnpm audit --audit-level=high. — lint ✓, typecheck ✓, build ✓, test ✓, license check ✓ (213 packages), audit ✓ — Docker verified working.

## Open questions for the owner

_(None. Milestone F4 implemented and verified across 4 commits. Ready for owner review and sign-off.)_

## Ideas / follow-ups (not in scope yet)

- Phase 8 must ship a third-party notices file containing license texts for all included dependencies.
- Phase 8 needs a TLS / HSTS / CSP upgrade-insecure-requests plan for hospital LAN installs (production requires `COOKIE_SECURE=true` and an `https` `APP_ORIGIN`).
- Phase 8 packaging must ship the correct argon2 prebuilt binary for the target platform (glibc vs musl).
- F7 will add an admin unlock endpoint/screen (to reset lockout counters without changing passwords).
- Audit log rows in F5 (`audit_log.session_id`) must not place a database foreign key to `sessions.id` to allow 30-day session purge per ADR-029.

## Known issues

- **Audit finding (moderate, non-blocking):** `js-yaml` (GHSA-r3ph-w7gj-g6xm) via `@nestjs/swagger`. In this project, `@nestjs/swagger` uses `js-yaml` only when serializing OpenAPI documents to YAML format; our application serves Swagger UI dynamically using JSON and does not parse untrusted YAML input. Per instructions, no override is added; will be upgraded when `@nestjs/swagger` ships a release with a patched `js-yaml`.
- **Placeholder scripts:** `build` in `apps/web` prints a notice and exits 0 until F6.
- **E2E placeholder:** `test:e2e` prints a notice and exits 0 until Playwright setup in F6.
- **Database stubs:** `db:seed:required` is implemented in F3. `db:seed:dev` prints an error and exits non-zero until dev seeds are added in later milestones.
