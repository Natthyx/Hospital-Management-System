---
description: Add a Prisma database migration safely (schema, grants, tests)
---

Use for any database change. Read `.agents/rules/03-database.md` first.

1. Confirm the change is part of the current milestone and the owner approved the schema plan.
2. Edit `apps/api/prisma/schema.prisma`. Apply the conventions: UUIDv7 `id`, `created_at`/`updated_at`/`created_by`/`updated_by`, `version` on editable records, `timestamptz`, exact numeric types for money and clinical values, foreign keys with `ON DELETE RESTRICT`, constraints that make illegal states unrepresentable, `@@map`/`@map` to snake_case names.
3. Generate the migration using the owner role (`DATABASE_MIGRATION_URL`) with a descriptive name.
4. Open the generated SQL and review it. Add by hand where Prisma cannot express it: `CHECK` constraints, partial or trigram indexes, and **`GRANT`/`REVOKE` statements for `hms_app`**:
   - Default: `SELECT, INSERT, UPDATE`.
   - `DELETE` only on join tables, `sessions`, and other tables explicitly allowed by the spec.
   - `audit_log`: `SELECT, INSERT` only.
   - Clinical tables: never `DELETE`.
5. Put a header comment in the migration explaining the purpose, and justify each index.
6. If the migration changes existing tables: make it safe for existing data (defaults or backfill). Never edit an already-applied migration; fix forward with a new one.
7. Run `pnpm db:reset` to verify it applies cleanly from scratch, then test the upgrade path from the previous migration state.
8. Add or update tests: constraint behavior, grant checks (`hms_app` cannot do what it must not), repository tests against the real test database.
9. Update `docs/02-foundation-spec.md` (or the module spec) so the documented schema matches.
10. Run `pnpm lint && pnpm typecheck && pnpm test`, then update `docs/05-progress.md`.
