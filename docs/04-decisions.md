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
5. In root `package.json`, `pnpm.onlyBuiltDependencies` is strictly limited to `@prisma/client`, `@prisma/engines`, and `prisma`. Telemetry (`@scarf/scarf`) is blocked. `argon2` is deferred to F4. _(Note: Superseded in part by ADR-024, which brought `argon2@0.45.1` into milestone F3 to hash passwords for the required admin seed, updating `onlyBuiltDependencies` to include `argon2`)._
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

## ADR-023 — Identity Data Model, UUIDv7 Generation, and Optimistic Locking Scope

**Status:** Accepted
**Date:** 2026-10-01
**Decision:**

1. Generate UUIDv7 primary keys at the application level via Prisma Client (`@id @default(uuid(7)) @db.Uuid`) with zero database-level default clauses. Raw SQL inserts must supply generated UUIDs explicitly.
2. Status column implemented as a PostgreSQL enum type `"user_status"` (`@@map("user_status")`) with values `active` and `disabled` per Rule 03 line 37.
3. Database `set_updated_at` trigger attached only to tables that have the `updated_at` column (`users` and `roles`); explicitly omitted from `sessions`, `permissions`, `role_permissions`, and `user_roles`.
4. Omit the `enforce_version_increment` trigger from the database.
   **Reason:**
   A database trigger enforcing `NEW.version = OLD.version + 1` forces every `UPDATE` on `users` to bump `version`, including high-frequency login counters (`failed_login_count`, `last_login_at` in F4). This would cause spurious `VERSION_CONFLICT` errors for an administrator updating profile details when a user logs in concurrently. Optimistic locking remains in the application service layer (`WHERE id = $id AND version = $expected_version`), where F4 will define which specific business updates increment `version`.
   **Consequences:** Clean separation of business-level concurrency control from system-level counter updates. Fully compliant with Rule 03.

## ADR-024 — Password Hashing with Argon2id

**Status:** Accepted
**Date:** 2026-10-01
**Decision:**

1. Pin `argon2` to exact version `0.45.1` (no caret) in `apps/api`. Only `argon2` is added to `pnpm.onlyBuiltDependencies`. Its four dependencies (`cross-env`, `@phc/format`, `node-addon-api`, `node-gyp-build`) are all MIT-licensed and have no install scripts.
2. Enforce Argon2id parameters via `env.schema.ts`:
   - Default profile: `ARGON2_MEMORY=65536` KiB (64 MiB), `ARGON2_ITERATIONS=3`, `ARGON2_PARALLELISM=4` (corresponding to RFC 9106's second recommended profile).
   - Production/development floor: `ARGON2_MEMORY >= 19456` KiB (19 MiB OWASP floor), `ARGON2_ITERATIONS >= 3`, `ARGON2_PARALLELISM >= 1`.
   - Test environment override: relaxed in `NODE_ENV=test` (`memory >= 1024`, `iterations >= 1`) for fast test execution.
3. Enforce hash prefix in PostgreSQL: `CHECK (password_hash LIKE '$argon2id$%')`.
   **Reason:** Argon2id is the state-of-the-art memory-hard password hashing algorithm providing maximum resistance against GPU/ASIC cracking attacks.
   **Consequences:** High security for stored passwords; fast test suite execution via test overrides; compliance with Rule 04.

## ADR-025 — Test Database Isolation & Safety Safeguards

**Status:** Accepted
**Date:** 2026-10-01
**Decision:**

1. Dedicated test connection variables: `TEST_DATABASE_URL` (hms_app) and `TEST_DATABASE_MIGRATION_URL` (hms_owner). Jest fails fast if either variable is missing or does not point to `hms_test`. No silent URL rewriting.
2. Inside Jest, `jest.config.js` maps test variables onto `DATABASE_URL` and `DATABASE_MIGRATION_URL` for the test process only. Dev server and CLI scripts continue using `hms_dev`.
3. Jest `globalSetup` executes `prisma migrate deploy` as `hms_owner` against `hms_test` before any test suite runs, ensuring migrations reach the test database automatically.
4. Test cleaner helper connects as `hms_owner` and executes `SELECT current_database()` over the active connection. If the returned string is not strictly `'hms_test'`, it hard-refuses execution.
5. All database tests run sequentially via `--runInBand` because the cleaner uses `TRUNCATE ... CASCADE` across shared tables.
   **Reason:** Complete test isolation from development data, with fail-fast protection preventing any test from accidentally touching `hms_dev`.
   **Consequences:** Fast, repeatable, and completely safe test suite execution.

## ADR-026 — CSRF Defense and Token Storage

**Status:** Accepted
**Date:** 2026-10-02
**Decision:**

1. Rename `sessions.csrf_token_hash` to `sessions.csrf_token` via migration `20261002000000_auth_csrf_token`. Store the raw random per-session CSRF token (32 bytes base64url) in plaintext in `sessions.csrf_token`.
2. Compare incoming `X-CSRF-Token` header against `sessions.csrf_token` using `crypto.timingSafeEqual` after pre-checking byte lengths. Length mismatch immediately rejects with 403 Forbidden without calling `timingSafeEqual` (preventing exceptions on unequal buffer lengths).
3. Rotate CSRF token and session identifier on login and password change.
4. **Why plaintext storage of `csrf_token` is acceptable while the session identifier cookie stays hashed:**
   The session token is a bearer credential stored in an `httpOnly` cookie; if the database is compromised, hashed session tokens prevent an attacker from impersonating users via hijacked sessions. The CSRF token, by contrast, is NOT a bearer credential and cannot be used alone to authenticate any request. An attacker who has read access to the database already has access to all clinical data, rendering CSRF against those sessions moot. Storing the random CSRF token in plaintext eliminates double hashing overhead on every state-changing request while maintaining full protection against browser cross-origin state-changing attacks.
   **Reason:** Balances state-of-the-art security against Cross-Site Request Forgery with predictable performance and zero timing-leak attack surface.
   **Consequences:** All state-changing endpoints (POST, PUT, PATCH, DELETE) strictly require matching `X-CSRF-Token`.

## ADR-027 — Browser-Session Cookie and Type Declarations

**Status:** Accepted
**Date:** 2026-10-02
**Decision:**

1. Session cookie name: `hms_session`.
2. Attributes: `HttpOnly`, `SameSite=Strict`, `Path=/`, and `Secure` conditional on `COOKIE_SECURE=true` (or `NODE_ENV=production`).
3. Browser-session cookie: explicitly omit `Max-Age` and `Expires`. The cookie naturally expires when the client browser closes, aligning with hospital workstation security. Inactivity (15 min) and absolute (12 hour) timeouts are strictly enforced server-side.
4. Set-Cookie and clearCookie use identical attributes (`Path=/`, `HttpOnly`, `SameSite=Strict`, matching `Secure`).
5. Duplicate cookie protection: if a request contains multiple `hms_session` cookies, `AuthGuard` rejects the request with generic 401 `UNAUTHENTICATED` ("Ambiguous session credentials") and clears the cookie to prevent cookie jar poisoning / dual-cookie attacks.
6. Cookie library: use `cookie` (0.7.2, MIT) as a direct dependency. Provide local type definitions in `apps/api/src/types/cookie.d.ts` declaring only `parse` and `serialize` rather than pulling in `@types/cookie`.
   **Reason:** Adheres to Rule 04 and Rule 12 with minimal dependencies and robust session handling.
   **Consequences:** Clean, deterministic cookie serialization and parsing.

## ADR-028 — Account Lockout and Argon2 Concurrency Limiting

**Status:** Accepted
**Date:** 2026-10-02
**Decision:**

1. Atomic lockout evaluation: evaluate and update failed login counters inside a single atomic SQL statement (`CASE WHEN locked_until > $now THEN locked_until ...`). Lock account for 15 minutes after 5 consecutive failures. Subsequent failures while locked do NOT extend `locked_until`.
2. Generic 401 response: on login failure (invalid username, invalid password, locked account, disabled account), return identical generic 401 `UNAUTHENTICATED` with message "Invalid username or password" to prevent username enumeration or lockout discovery. Never set session cookie when account is locked or credentials fail.
3. Existing active sessions remain valid during login lockout: a brute-force attack on a user's password does not kick an active doctor or nurse out of their currently working workstation session.
4. Password change failure: incorrect `currentPassword` counts toward lockout counters. If 5 consecutive failures occur on password change, lockout triggers AND the current session is revoked.
5. Argon2 limiter service (`Argon2LimiterService`): bounds concurrent argon2 operations (default concurrency 2, queue limit 50, queue timeout 10 seconds). Protects the API server from CPU/memory starvation DoS attacks caused by concurrent login attempts.
   **Reason:** Prevents timing attacks, username enumeration, DoS attacks against memory-hard hashing, and workstation disruption.
   **Consequences:** Predictable server resource utilization under attack or load.

## ADR-029 — Session Retention and Scheduled Purge

**Status:** Accepted
**Date:** 2026-10-02
**Decision:**

1. Retain expired and revoked sessions in PostgreSQL for 30 days before deletion. This window preserves session records for security forensics and incident investigation.
2. Foreign key restriction: audit log rows in Milestone F5 (`audit_log.session_id`) must NOT place a database foreign key constraint to `sessions.id`, ensuring sessions can be purged after 30 days without breaking audit integrity.
3. Hourly scheduled purge: `SessionCleanupService` runs hourly via `@nestjs/schedule` (`@Cron('0 * * * *')`). Deletes sessions where `expires_at < now - 30 days OR (revoked_at IS NOT NULL AND revoked_at < now - 30 days)`.
4. Test mode bypass: when `NODE_ENV === 'test'`, `handleCron()` skips execution so automated tests maintain deterministic control over execution via direct service calls using `TestClock`.
   **Reason:** Balances security forensic retention with bounded database table growth.
   **Consequences:** `sessions` table remains compact and indexed over time.

## ADR-030 — OriginGuard and Reverse Proxy Origin Verification

**Status:** Accepted
**Date:** 2026-10-02
**Decision:**

1. `OriginGuard` executes globally BEFORE `AuthGuard`.
2. Validates incoming `Origin` header against `APP_ORIGIN` (default `http://localhost:5173` in development). If `Origin` is missing (common in some browser navigation or same-origin top-level requests), falls back to `Referer` origin matching `APP_ORIGIN`. If neither or mismatched on state-changing methods, immediately returns 403 Forbidden.
3. For `Origin: null` (such as sandboxed iframes or local privacy modes), requires a valid `Referer` matching `APP_ORIGIN`.
4. Executes before `AuthGuard` so that malicious cross-origin requests are rejected before session lookups or credential evaluation occur.
   **Reason:** Robust defense-in-depth against CSRF and cross-origin hijacking before authentication layers run.
   **Consequences:** Prevents cross-origin state tampering.

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
