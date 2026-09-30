# 05 — Progress Tracker

The agent updates this file at the end of every task. The owner signs off milestones here.

## Current milestone

**F2 — API skeleton** (status: defect fixes completed, ready for owner review and sign-off)

## Phase 0 — Foundation

- [x] F1 Repo and tooling (F1 signed off by owner: 2026-09-30)
- [ ] F2 API skeleton (ready for owner sign-off)
- [ ] F3 Identity data model
- [ ] F4 Authentication
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

_(None. All F2 defect fixes and requirements implemented and verified.)_

## Ideas / follow-ups (not in scope yet)

- Phase 8 must ship a third-party notices file containing license texts for all included dependencies.
- Phase 8 needs a TLS / HSTS / CSP upgrade-insecure-requests plan for hospital LAN installs that may run over plain HTTP.
- Enable the route-audit and default-deny tests to accept the real `AuthGuard` in F4.

## Known issues

- **Audit finding (moderate, non-blocking):** `js-yaml` (GHSA-r3ph-w7gj-g6xm) via `@nestjs/swagger`. In this project, `@nestjs/swagger` uses `js-yaml` only when serializing OpenAPI documents to YAML format; our application serves Swagger UI dynamically using JSON and does not parse untrusted YAML input. Per instructions, no override is added; will be upgraded when `@nestjs/swagger` ships a release with a patched `js-yaml`.
- **Placeholder scripts:** `build` in `apps/web` prints a notice and exits 0 until F6.
- **E2E placeholder:** `test:e2e` prints a notice and exits 0 until Playwright setup in F6.
- **Database stubs:** `db:seed:required` and `db:seed:dev` exit non-zero until seeds are added in F3.
