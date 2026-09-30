# 04 — Decision Log

Record every design decision here. Statuses:

- **Accepted**: agreed with the owner; binding.
- **Proposed**: the default to use until the owner objects; flag it at the next milestone review.
- **Superseded**: replaced by a newer decision (link it).

To change an Accepted decision, add a new entry with the reasoning and get owner approval. Never silently deviate.

Entry format: `ADR-NNN — Title` · Status · Date · Decision · Reason · Consequences.

---

## ADR-001 — Technology stack

**Status:** Accepted
**Decision:** TypeScript everywhere; NestJS (backend) + React (frontend); PostgreSQL; Prisma; pnpm workspaces monorepo.
**Reason:** Owner's chosen stack (NestJS + React). Strong typing suits a domain where mistakes are costly; one language reduces maintenance for a solo developer; PostgreSQL gives transactions and integrity needed for clinical data.
**Consequences:** Exact versions at scaffold time (F1, 2026-09-30): Node 22.20.0, pnpm 10.28.2, TypeScript 5.9.3, ESLint 9.39.5, Prettier 3.9.9, Husky 9.1.7, commitlint 19.8.1, PostgreSQL 16 (Docker image `postgres:16`), Zod 3.25.67.

## ADR-002 — Modular monolith

**Status:** Accepted
**Decision:** One NestJS application with strict module boundaries; one database per deployment.
**Reason:** Solo developer; simple deployment and cross-department transactions; modules can be extracted later if ever needed.
**Consequences:** No microservices or brokers. Cross-module access only via exported services.

## ADR-003 — Isolated per-hospital deployments

**Status:** Accepted
**Decision:** Each hospital gets its own isolated instance and database, deployed from one codebase and one automated pipeline. No `tenant_id`. No per-customer forks.
**Reason:** Easier to sell (hospital data stays isolated), small blast radius, still maintainable through identical automated releases and configuration-only differences.
**Consequences:** Multi-tenant hosting is out of scope. Code must stay free of hospital-specific assumptions.

## ADR-004 — Development and hosting approach

**Status:** Accepted
**Decision:** Develop against PostgreSQL in local Docker. The app is deployment-agnostic (environment variables only, no cloud SDKs, no runtime internet dependency). Hosting/installation model is decided per customer later. Installer, backup tooling, updates, and licensing are Phase 8.
**Reason:** The owner cannot currently afford cloud hosting; offline packaging adds work that does not affect module development; keeping the app portable preserves both options.
**Consequences:** Real patient data never goes on free-tier cloud databases. A synthetic-data demo may be hosted cheaply.

## ADR-005 — Full ownership and licensing

**Status:** Accepted
**Decision:** The product is proprietary and wholly owned by the owner. Only permissively licensed dependencies; no copyleft or source-available licenses. No code taken from existing hospital/EMR systems.
**Reason:** Allows selling the software without obligations to open the source.
**Consequences:** License register and automated license check are mandatory (`docs/THIRD_PARTY_LICENSES.md`, `pnpm check:licenses`).

## ADR-006 — Authentication mechanism

**Status:** Accepted
**Decision:** Username + password; argon2id; server-side sessions stored in PostgreSQL; httpOnly, Secure, SameSite=Strict cookie; CSRF token header; idle and absolute timeouts; no JWT in browser storage; no Redis.
**Reason:** Safer for browser clients handling clinical data and one fewer moving part to install and maintain.
**Consequences:** Session cleanup job required; details in rule 04.

## ADR-007 — Permission-based RBAC defined in code

**Status:** Accepted
**Decision:** Permissions are defined in `packages/shared` and synced into the database; roles are editable bundles of permissions; code checks permissions, never role names. The admin role has no clinical permissions by default.
**Reason:** Hospitals can tailor roles without code changes; separation of duties.

## ADR-008 — Append-only audit log enforced by the database

**Status:** Accepted
**Decision:** `audit_log` is INSERT/SELECT-only for the application DB role; writes are audited in the same transaction; patient-data reads are fail-closed. Hash-chain tamper evidence deferred to Phase 8.
**Reason:** Accountability and legal defensibility.

## ADR-009 — Username login and admin-led password reset

**Status:** Accepted
**Decision:** Login by username; email optional; no email-based reset; admins reset passwords (temporary password shown once, forced change).
**Reason:** Many hospital staff lack work email; supports offline installations.

## ADR-010 — No hard deletes; revisions for clinical documents

**Status:** Accepted
**Decision:** Clinical and financial data is voided or superseded by revisions; `hms_app` lacks DELETE on those tables.
**Reason:** Medical-legal integrity and patient safety.

## ADR-011 — Identifiers, time, and concurrency

**Status:** Accepted
**Decision:** UUIDv7 primary keys; `timestamptz` in UTC; optimistic locking via `version`; exact decimals for money and clinical quantities.

## ADR-012 — Testing tools

**Status:** Accepted
**Decision:** Jest (API), Vitest (web), Playwright (e2e), real PostgreSQL for integration tests, CI on every push.

## ADR-013 — UI library and internationalization

**Status:** Proposed
**Decision:** Mantine as the component library; react-i18next with all strings as keys from day one; English default.
**Reason:** Mantine (MIT) provides tables, forms, dialogs, and date pickers, saving time; i18n from the start avoids a costly retrofit when selling to hospitals in different regions.
**Consequences:** Owner to confirm at the F6 review.

## ADR-014 — Patient identity and duplicates

**Status:** Proposed
**Decision:** UUID plus DB-generated MRN; duplicate candidates suggested by trigram matching, resolved by humans; merge implemented as reversible linking.
**Reason:** Duplicate records are a common hospital-system failure; deletion would break history.
**Consequences:** Final MRN format and matching rules set in the Phase 1 spec.

## ADR-015 — Shared package build strategy (CJS + ESM)

**Status:** Accepted
**Date:** 2026-09-30
**Decision:** `packages/shared` is built twice by `tsc`: once to `dist/` as CommonJS (with declarations), once to `dist/esm/` as ES modules (no declarations). The `package.json` `exports` map routes `require()` to CJS and `import` to ESM. Types always resolve from the CJS build's `.d.ts` files.
**Reason:** NestJS runs as CJS by default; Vite/React works best with ESM. A dual build avoids forcing either consumer to adapt. Using `tsc` directly (no bundler like tsup) keeps the build simple and dependency-light for a solo developer.
**Consequences:** The root `pnpm build` must build `@hms/shared` before the apps. The `pnpm dev` script (F2/F6) will run `tsc --watch` on shared in parallel. The `tsconfig.base.json` contains only strict/target settings; module format and declaration flags are set per build config to keep NestJS and Vite concerns separate.

## ADR-016 — Separate devDependencies license allow-list (allowedDev)

**Status:** Accepted
**Date:** 2026-09-30
**Decision:** Approve `BlueOak-1.0.0` and `Python-2.0` for `devDependencies` only, maintaining a separate `allowedDev` list in `scripts/license-policy.json`. Production dependencies must strictly pass the main `allowed` list. Any new license outside both lists requires owner approval.
**Reason:** Build, lint, and commit-validation tooling (`minimatch` under BlueOak-1.0.0, `argparse` under Python-2.0) are developer-only dependencies that are not included in production runtime artifacts. Permitting these permissive licenses for tooling preserves the proprietary licensing boundary of the hospital application while enabling modern development tooling.
**Consequences:** `pnpm check:licenses` scans the full tree (prod + dev), cross-referencing production dependencies against `policy.allowed` only, and flagging an error if any production dependency uses an `allowedDev` license. `docs/THIRD_PARTY_LICENSES.md` documents both tiers.

---

## Template for new entries

```
## ADR-NNN — Title
**Status:** Proposed | Accepted | Superseded by ADR-XXX
**Date:** YYYY-MM-DD
**Decision:**
**Reason:**
**Consequences:**
```
