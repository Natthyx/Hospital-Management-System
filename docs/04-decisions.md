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

## ADR-017 — Zod 3 for schema validation

**Status:** Superseded by ADR-018
**Date:** 2026-09-30
**Decision:** Standardize on Zod 3 (`^3.25.67`) across all workspaces (`packages/shared`, `apps/api`, and `apps/web`), rather than adopting Zod 4.
**Reason:** Initial assessment assumed limited ecosystem support. Superseded once verified that `nestjs-zod@5.5.0` supports Zod 4 natively.
**Consequences:** Superseded by ADR-018.

## ADR-018 — Upgrade to Zod 4 across all workspaces

**Status:** Accepted
**Date:** 2026-09-30
**Decision:** Standardize on Zod 4 (`^4.6.5`) across `packages/shared`, `apps/api`, and `apps/web`.
**Reason:**

1. Ecosystem verification confirmed that `nestjs-zod@5.5.0` natively targets Zod 4, and `@hookform/resolvers@5.1.0+` fully supports Zod 4 for the upcoming frontend.
2. Adopting Zod 4 at the foundation stage (F2) eliminates future breaking migration costs when dozens of clinical domain schemas are built.
3. In Zod 4, object schemas preserve strict stripping and checking semantics (`z.object({...}).strict()` or `.strip()`), fulfilling rule 01 and rule 02 input boundaries.
   **Consequences:** Supersedes ADR-017. All DTO schemas in `packages/shared` use Zod 4. `apps/api` uses `nestjs-zod` with Zod 4 for controller parameter validation and OpenAPI schema extraction.

## ADR-019 — Prisma 6.19.3, zero-model bootstrap, and dual DB URLs

**Status:** Accepted
**Date:** 2026-09-30
**Decision:**

1. Pin Prisma ORM to `6.19.3` (`@prisma/client` and `prisma`). Do not use Prisma 7 or 8 (currently release candidates / early previews with breaking changes).
2. Prisma 6 is fully compatible with NestJS running under CommonJS (`module: "commonjs"`).
3. Bootstrap the database with zero models: verify that `prisma generate` and `$queryRaw` work with an empty schema.
4. Separate migration credentials from runtime credentials:
   - `schema.prisma` configures `url = env("DATABASE_MIGRATION_URL")` and `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")`. Migration commands (`prisma migrate dev`, `prisma migrate deploy`, `prisma migrate reset`) always run under the privileged `hms_owner` role.
   - At runtime, `PrismaService` initializes `PrismaClient` with `datasources: { db: { url: envConfig.DATABASE_URL } }`, ensuring the running NestJS application strictly operates under the least-privilege `hms_app` role.
5. In root `package.json`, `pnpm.onlyBuiltDependencies` is strictly limited to `@prisma/client`, `@prisma/engines`, and `prisma`. Telemetry (`@scarf/scarf`) is blocked. `argon2` is deferred to F4.
   **Consequences:** Clear architectural separation between schema migrations (`hms_owner`) and application runtime (`hms_app`).

## ADR-020 — Validation, response serialization, and OpenAPI with nestjs-zod v5

**Status:** Accepted
**Date:** 2026-09-30
**Decision:**

1. Keep `packages/shared` 100% free of NestJS dependencies: it exports pure Zod schemas and inferred TypeScript types only.
2. `apps/api` creates controller DTO classes using `createZodDto` from `nestjs-zod`.
3. Validation uses a global `ZodValidationPipe` created via `createZodValidationPipe({ strictSchemaDeclaration: true })` to guarantee that any endpoint parameter lacking a validated DTO is caught and rejected immediately.
4. Validation errors are formatted into the standardized error response `{ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [...] } }` matching Rule 01.
5. Response serialization is handled by a global `ZodSerializerInterceptor` from `nestjs-zod`, ensuring response shapes are validated and stripped according to declared response schemas.
6. OpenAPI/Swagger document post-processing uses `cleanupOpenApiDoc` from `nestjs-zod` (the v5 API replacing v4's `patchNestjsSwagger`).
   **Consequences:** Clean separation of concerns between shared schemas and API framework integration. Strict type safety and schema validation enforced at runtime and documented in OpenAPI.

## ADR-021 — Third-party license approvals for Python-2.0 and CC-BY-4.0

**Status:** Accepted
**Date:** 2026-09-30
**Decision:**
The OWNER approved Python-2.0 (production) and CC-BY-4.0 (dev tooling only) on 2026-09-30.

1. Approve `Python-2.0` as an allowed license for production dependencies. `@nestjs/swagger` depends on `js-yaml` -> `argparse` (licensed under Python-2.0). Python-2.0 is an OSI-approved, permissive, non-copyleft license compatible with proprietary commercial software.
2. Approve `CC-BY-4.0` in `allowedDev` for developer dependencies only. `jest` depends on `@babel/helper-compilation-targets` -> `browserslist` -> `caniuse-lite` (licensed under CC-BY-4.0 for browser support data).
   **Reason:** Both licenses are permissive, standard components of the NestJS and Jest ecosystems, and do not impose any copyleft or source-disclosure obligations on the hospital management system.
   **Consequences:** Recorded in `docs/THIRD_PARTY_LICENSES.md` and enforced by `scripts/license-policy.json`.

## ADR-022 — Dependency override for deepmerge-ts (GHSA-ggr8-5vv4-36mx)

**Status:** Accepted
**Date:** 2026-09-30
**Decision:** Configure a pnpm dependency override in root `package.json`: `"pnpm.overrides": { "deepmerge-ts": "^8.0.0" }`.
**Reason:**

1. **Advisory ID:** GHSA-ggr8-5vv4-36mx (stack exhaustion when merging recursive object graphs in deepmerge-ts).
2. **Declared dependency:** `nestjs-zod@5.5.0` specifies `"deepmerge-ts": "^7.1.5"` in its dependencies.
3. **Investigation of 7.x line:** Evaluated whether a patched 7.x release exists. Although `7.1.6` exists on npm, advisory GHSA-ggr8-5vv4-36mx explicitly classifies all versions `< 8.0.0` as vulnerable, with patched versions starting at `>= 8.0.0`. Testing `7.1.6` fails `pnpm audit --audit-level=high`. Therefore, an override to `^8.0.0` is strictly necessary to clear the high-severity advisory.
4. **Safety of override:** `deepmerge-ts` v8 maintains runtime API compatibility for the object-merging functionality consumed by `nestjs-zod`.
5. **Validation:** Exercised and tested via `cleanupOpenApiDoc` and `SwaggerModule.createDocument` in `apps/api/test/swagger-csp.e2e-spec.ts`.
6. **Removal condition:** Remove this override when `nestjs-zod` publishes an updated release specifying `deepmerge-ts >= 8.0.0`.
   **Consequences:** High-severity audit vulnerability is resolved; OpenAPI schema generation is tested and working properly.

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
