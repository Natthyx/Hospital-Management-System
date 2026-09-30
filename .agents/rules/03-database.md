# Rule 03 — Database

## Engine and access

- PostgreSQL 16 or newer. Access through Prisma. Raw SQL only via Prisma tagged templates (`$queryRaw`) or inside migrations; never string-concatenate SQL.
- Allowed extensions: `pg_trgm` (fuzzy search), `unaccent`, `pgcrypto` (only if needed). Others need owner approval.
- One database per hospital deployment. No `tenant_id`.

## Two database roles (least privilege)

| Role        | Used by                                    | Privileges            |
| ----------- | ------------------------------------------ | --------------------- |
| `hms_owner` | Migrations only (`DATABASE_MIGRATION_URL`) | Owns schema objects   |
| `hms_app`   | The running API (`DATABASE_URL`)           | Only the grants below |

- The API never connects as `hms_owner`.
- Every migration that creates a table must also grant `hms_app` the privileges it needs, explicitly.
- Default grant is `SELECT, INSERT, UPDATE`. **`DELETE` is granted only on tables where deletion is legitimate** (join tables such as `user_roles`, `role_permissions`; `sessions`).
- `audit_log`: `INSERT` and `SELECT` only. No `UPDATE`, `DELETE`, or `TRUNCATE`.
- Clinical tables: no `DELETE` for `hms_app`. This makes "never hard-delete" enforced by the database, not just by convention.

## Conventions for every table

| Column / rule                  | Requirement                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                           | `uuid` primary key, UUIDv7 (time-ordered). Use Prisma `@default(uuid(7))` or generate in the app if the Prisma version lacks it         |
| `created_at`, `updated_at`     | `timestamptz not null default now()`; `updated_at` maintained on every update                                                           |
| `created_by`, `updated_by`     | `uuid` referencing `users.id` (nullable only for system actions)                                                                        |
| `version`                      | `integer not null default 1` on editable records; every update increments it and must match the caller's `version` (optimistic locking) |
| Timestamps                     | Always `timestamptz`, stored in UTC                                                                                                     |
| Money                          | `numeric(14,2)` or integer minor units. Never `float` or `double`                                                                       |
| Quantities and clinical values | `numeric` with explicit precision, with a separate `unit` column                                                                        |
| Text                           | `text`. Enforce lengths with `CHECK` constraints only when the domain requires it                                                       |
| Foreign keys                   | Always declared. `ON DELETE RESTRICT` by default                                                                                        |
| Constraints                    | Use `NOT NULL`, `UNIQUE`, and `CHECK` constraints to make illegal states unrepresentable                                                |
| Indexes                        | Index foreign keys and every column used in filters or sorts. Justify each index in the migration comment                               |
| Fixed states                   | Prisma enums for closed sets (for example status). Lookup tables for sets hospitals may extend (departments, specialties)               |

## Naming

- Tables: snake_case plural (`lab_orders`). Columns: snake_case. Prisma models: PascalCase with `@@map("lab_orders")` and `@map` on fields.
- Join tables: `<a>_<b>` (`user_roles`). Booleans: `is_`/`has_` prefix.

## No hard deletes; voiding and amendments

- Clinical and financial rows are **never deleted**. Two allowed patterns:
  1. **Void**: `voided_at`, `voided_by`, `void_reason` columns. Voided rows stay queryable and are excluded from normal reads by default.
  2. **Revisions**: for clinical documents (consultation notes, results), an edit inserts a new revision row; earlier revisions remain. The exact structure is defined in the module spec.
- Reference data (drugs, tests, departments) is deactivated with `is_active = false`, not deleted.

## Migrations

- Prisma migrations only. Commit every migration with the code that needs it.
- **Never edit an applied migration.** Fix forward with a new one.
- Every migration must be safe to run on a database with existing data. For destructive or backfilling changes, write a data-preserving multi-step migration and describe it in the file header.
- Migrations that add `NOT NULL` columns to existing tables must include a safe default or backfill.
- Name migrations descriptively: `20260930_add_patients_table`.
- Migrations must run cleanly on an empty database and on the previous release's schema (`pnpm db:reset` and upgrade path both tested in CI).

## Seeds

- `db:seed:required`: idempotent. Syncs the permission catalog, default roles, and creates the first admin (random one-time password printed once, forced change on first login; never a hardcoded password).
- `db:seed:dev`: synthetic data only, idempotent, never run in production.

## Search

- Patient and drug search use `pg_trgm` indexes and normalized (lowercased, unaccented) search columns. Design in the module spec.

## Data ownership rules

- A module owns its tables. Other modules read them only through the owner's exported service.
- Cross-module foreign keys are allowed (for integrity) but cross-module writes are not.
