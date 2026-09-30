# 05 — Progress Tracker

The agent updates this file at the end of every task. The owner signs off milestones here.

## Current milestone

**F2 — API skeleton** (status: in progress)

## Phase 0 — Foundation

- [x] F1 Repo and tooling (F1 signed off by owner: 2026-09-30)
- [ ] F2 API skeleton
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

2026-09-30 — F1 — Repo and tooling scaffolded: pnpm workspace monorepo (apps/api, apps/web, packages/shared), TypeScript strict, ESLint flat config with type-aware rules, Prettier, Husky + lint-staged + commitlint, Docker Compose PostgreSQL 16 (hms_owner/hms_app roles, no hardcoded passwords, bind 127.0.0.1, named volume, healthcheck), Zod-validated env config in apps/api/src/config/, all root scripts (unimplemented ones exit non-zero), GitHub Actions CI (lint/typecheck/build/license-check/audit/secret-scan, pinned actions/Node/pnpm), license check script with policy JSON (SPDX expression handling), .editorconfig, .nvmrc, packageManager pin. ADR-001 updated with versions, ADR-015 added for shared build strategy. License check updated to scan full tree (prod + dev), added ADR-016 and updated license register for allowedDev (BlueOak-1.0.0, Python-2.0), updated placeholders to exit 0 with notice, updated CI audit to pnpm audit --audit-level=high. — lint ✓, typecheck ✓, build ✓, test ✓, license check ✓ (213 packages), audit ✓ — Docker not available to test db:up on this machine

## Open questions for the owner

- Docker daemon was not running during development, so `pnpm db:up` and the hms_app privilege check could not be verified. Please run `pnpm db:up` and verify the init script creates both roles and databases correctly.

## Ideas / follow-ups (not in scope yet)

_(empty. Add ideas here instead of building them.)_

## Known issues

- **Placeholder scripts:** `build` in `apps/api` (until F2) and `apps/web` (until F6) print a notice and exit 0. (`@hms/shared` builds for real).
- **Test placeholders:** `test` scripts in root and workspaces print a notice and exit 0 until test suites are implemented in F2.
- **E2E placeholder:** `test:e2e` prints a notice and exits 0 until Playwright setup in F6.
- **CI Test step:** Enable the `pnpm test` CI step in `.github/workflows/ci.yml` in F2 once real test suites exist.
- **Database stubs:** Database scripts (`db:migrate`, `db:seed:required`, `db:seed:dev`, `db:reset`) exit non-zero until Prisma migrations and seeds are added in F2 and F3.
