# 02 — Foundation Specification (Phase 0)

Detailed spec for milestones F1 to F8. Follow it exactly. If something is ambiguous, ask the owner (AGENTS.md section 7). Keep this file in sync with the code (permission catalog, endpoints, schema).

## Environment variables

| Variable                 | Default (dev)                                       | Notes                                 |
| ------------------------ | --------------------------------------------------- | ------------------------------------- |
| `NODE_ENV`               | `development`                                       | `development` / `test` / `production` |
| `PORT`                   | `3000`                                              | API port                              |
| `APP_ORIGIN`             | `http://localhost:5173`                             | Used for Origin check                 |
| `DATABASE_URL`           | `postgresql://hms_app:...@localhost:5432/hms_dev`   | Runtime, least-privilege role         |
| `DATABASE_MIGRATION_URL` | `postgresql://hms_owner:...@localhost:5432/hms_dev` | Migrations only                       |
| `SESSION_IDLE_MINUTES`   | `15`                                                |                                       |
| `SESSION_ABSOLUTE_HOURS` | `12`                                                |                                       |
| `LOGIN_MAX_FAILURES`     | `5`                                                 |                                       |
| `LOGIN_LOCK_MINUTES`     | `15`                                                |                                       |
| `COOKIE_SECURE`          | `false` in dev, `true` in production                |                                       |
| `LOG_LEVEL`              | `info`                                              |                                       |
| `HOSPITAL_TIMEZONE`      | `UTC`                                               | IANA name                             |
| `DEFAULT_LOCALE`         | `en`                                                |                                       |

## F1 — Repo and tooling

Tasks:

- pnpm workspace with `apps/api`, `apps/web`, `packages/shared`; root scripts from AGENTS.md section 4.
- Shared TypeScript, ESLint, Prettier configs; Husky + lint-staged; commit message lint.
- `docker/docker-compose.yml` with PostgreSQL 16 and an init script creating roles `hms_owner`, `hms_app` and databases `hms_dev`, `hms_test`.
- Zod-validated config loader; `.env.example`; `.gitignore`.
- CI workflow (GitHub Actions) running lint, typecheck, tests with a Postgres service.
- `docs/THIRD_PARTY_LICENSES.md` populated for initial dependencies; `pnpm check:licenses` script.

Acceptance: fresh clone, `pnpm install`, `pnpm db:up`, `pnpm lint`, `pnpm typecheck` all succeed; CI passes.

## F2 — API skeleton

Tasks:

- NestJS app with pino logging, request-ID middleware, global validation pipe (Zod), global exception filter (error format from rule 01), `helmet`, throttler.
- `PrismaService`; Prisma schema; migration tooling using `DATABASE_MIGRATION_URL`.
- `GET /api/v1/health` (public): returns status and DB connectivity, no sensitive data.
- Swagger/OpenAPI at `/api/docs` (disabled in production by default via config).
- Test setup: Jest, Supertest, real `hms_test` database, helpers and factories.

Acceptance: API boots, health returns OK, error format verified by tests, integration test harness works.

## F3 — Identity data model

Tables (all follow rule 03; `hms_app` grants as noted):

**`users`**: `id`, `username` (unique, lowercase), `full_name`, `email` (nullable, unique when set, lowercase), `phone` (nullable), `password_hash`, `status` (`active` | `disabled`), `must_change_password` (default true), `failed_login_count` (default 0), `locked_until` (nullable), `password_changed_at`, `mfa_secret_encrypted` (nullable, reserved), `last_login_at`, plus standard columns (`created_at`, `updated_at`, `created_by`, `updated_by`, `version`).

**`roles`**: `id`, `code` (unique, snake_case, e.g. `receptionist`), `name`, `description`, `is_system` (system roles cannot be deleted; `admin` permissions cannot be reduced below the foundation set), standard columns.

**`permissions`**: `code` (primary key, e.g. `users.read`), `module`, `description`, `created_at`. Synced from the code catalog. No manual inserts.

**`role_permissions`**: `role_id`, `permission_code`, `granted_at`, `granted_by`. Primary key (`role_id`, `permission_code`). `DELETE` allowed for `hms_app`.

**`user_roles`**: `user_id`, `role_id`, `assigned_at`, `assigned_by`. Primary key (`user_id`, `role_id`). `DELETE` allowed for `hms_app`.

**`sessions`**: `id`, `user_id`, `token_hash` (unique), `csrf_token_hash`, `created_at`, `last_seen_at`, `expires_at` (absolute), `revoked_at`, `revoked_reason`, `ip`, `user_agent`. `DELETE` allowed (expired-session cleanup job).

`audit_log` is created in F5.

**Permission catalog (foundation):**

| Code                   | Meaning                                 |
| ---------------------- | --------------------------------------- |
| `users.read`           | List/view users                         |
| `users.create`         | Create users                            |
| `users.update`         | Edit user details                       |
| `users.disable`        | Disable/enable users                    |
| `users.reset_password` | Reset password and unlock accounts      |
| `users.manage_roles`   | Assign roles to users                   |
| `roles.read`           | View roles and permissions              |
| `roles.manage`         | Create/edit roles and their permissions |
| `audit.read`           | View the audit log                      |
| `sessions.read_any`    | View any user's sessions                |
| `sessions.revoke_any`  | Revoke any user's sessions              |

Actions on your own account (login, logout, change own password, view/revoke own sessions, view own profile) require authentication only, no permission.

**Default roles:** `admin` (all foundation permissions; `is_system`), and empty system roles `receptionist`, `nurse`, `doctor`, `pharmacist`, `lab_technician`, `cashier`. Later phases add each role's permissions through their own seeds.

**Seeds (`db:seed:required`, idempotent):** sync permission catalog, ensure default roles, ensure the first admin exists (`username: admin`, random one-time password printed once to the console, `must_change_password = true`).

Acceptance: migrations apply; grants verified by test; seeds are idempotent; permission catalog test passes.

## F4 — Authentication

Endpoints (`/api/v1`):

| Method | Path                    | Access                | Purpose                                                                       |
| ------ | ----------------------- | --------------------- | ----------------------------------------------------------------------------- |
| POST   | `/auth/login`           | Public (rate-limited) | Username/password; sets session cookie; returns user, permissions, CSRF token |
| POST   | `/auth/logout`          | Authenticated         | Revokes current session                                                       |
| GET    | `/auth/me`              | Authenticated         | Current user, permissions, CSRF token, `must_change_password`                 |
| POST   | `/auth/change-password` | Authenticated         | Requires current password; revokes other sessions                             |
| GET    | `/auth/sessions`        | Authenticated         | Own active sessions                                                           |
| DELETE | `/auth/sessions/:id`    | Authenticated         | Revoke own session                                                            |

Behavior per rule 04: argon2id, generic errors, lockout, idle/absolute timeout, cookie flags, CSRF token and Origin check, session rotation, forced password change (all endpoints except `/auth/me`, `/auth/change-password`, `/auth/logout` are refused while `must_change_password` is true).

Guards and decorators: `AuthGuard` (global), `PermissionGuard`, `@RequirePermission(code)`, `@Public()`, `@CurrentUser()`.

Acceptance: full permission matrix tests; route-audit test proves every route is protected or `@Public()`; lockout and timeout tests; no secrets in responses or logs.

## F5 — Audit module

Implements rule 05 completely: `audit_log` table, grants (INSERT/SELECT only, migration test), `AuditService.record`, `@Audit` interceptor for reads and denied attempts, auth events wired in, `GET /audit` with filters (requires `audit.read`), and audit of reading the audit log.

Acceptance: audit rows verified for every auth event and permission denial; `hms_app` cannot UPDATE/DELETE/TRUNCATE `audit_log`; write-and-audit atomicity test passes.

## F6 — Web skeleton

- React app shell (header, side navigation built from permissions, content area), Mantine theme, self-hosted fonts.
- Login page, forced change-password page, `AuthProvider` bootstrapped from `/auth/me`.
- API client (credentials, CSRF header, error parsing, 401 handling).
- `usePermission`, `<Can>`, protected routes, 403 and 404 pages, error boundary showing `requestId`.
- i18n set up with `en` locale; idle-timeout warning dialog.

Acceptance: Playwright tests for login, forced password change, logout, timeout; unauthorized route hidden and blocked.

## F7 — Admin screens

- **Users:** list (search, pagination), create, edit, disable/enable, unlock, reset password (temporary password shown once), assign roles, view sessions.
- **Roles:** list, create, edit, permission editor grouped by module.
- **Audit viewer:** filterable table (date range, actor, action, entity, patient, outcome).
- Endpoints: `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/disable|enable|reset-password|unlock`, `PUT /users/:id/roles`, `GET /users/:id/sessions`, `DELETE /users/:id/sessions/:sessionId`, `GET/POST /roles`, `GET/PATCH /roles/:id`, `PUT /roles/:id/permissions`, `GET /permissions`.
- Self-lockout protections from rule 04 enforced and tested.

Acceptance: an admin completes all user/role/audit tasks in the UI; every action audited; e2e tests pass.

## F8 — Quality gate

- Full suite green: unit, integration, e2e; coverage targets met (rule 06).
- CI green including license check, audit, secret scan.
- README with setup and commands; decision log and license register current; progress file updated.
- Owner sign-off recorded in `docs/05-progress.md` before Phase 1 begins.
