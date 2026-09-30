# Rule 06 — Testing

Tests are part of the feature. A feature without tests is not done.

## Tools

- **API:** Jest (unit and integration) with Supertest for HTTP.
- **Web:** Vitest + React Testing Library.
- **End-to-end:** Playwright against the real API and a real PostgreSQL.
- **Database in tests:** a real PostgreSQL (`hms_test`) started by Docker Compose. **Do not mock the database** in integration tests. Migrations are applied before the run.

## Test layers

| Layer       | Scope                                                        | Speed       |
| ----------- | ------------------------------------------------------------ | ----------- |
| Unit        | Pure logic (validators, calculations, domain rules)          | Fast, no DB |
| Integration | Service + repository + real DB; HTTP endpoints via Supertest | Medium      |
| End-to-end  | Critical user flows in the browser                           | Slow, few   |

## Required tests for every feature

1. **Happy path** for each endpoint or use case.
2. **Validation:** invalid, missing, and unknown-key input returns `400 VALIDATION_FAILED`.
3. **Permission matrix:** each protected endpoint is tested as (a) a user WITH the permission (success), (b) a user WITHOUT it (`403` and a `denied` audit row), (c) unauthenticated (`401`).
4. **Audit:** the expected audit row exists with correct `action`, `outcome`, `entity_id`, `patient_id`, and redacted `before`/`after`.
5. **Business rules and edge cases** from the spec.
6. **Optimistic locking:** a stale `version` returns `409 VERSION_CONFLICT`.
7. **Transactions:** when a step fails, nothing is partially saved (including the audit row).
8. **IDOR:** accessing another record or scope by ID is refused where scoping applies.
9. **No leakage:** responses never contain password hashes, token hashes, or internal fields.

## Global guard tests (must always exist and pass)

- Route audit: every route has `@RequirePermission` or `@Public()`.
- DB grants: `hms_app` cannot `UPDATE`/`DELETE`/`TRUNCATE` `audit_log`, and cannot `DELETE` from clinical tables.
- Migrations: apply cleanly to an empty database.
- Permission catalog: every permission code used in code exists in `packages/shared`, and the seeded table matches it.
- Secrets: no `.env` or secret patterns in the repo (CI secret scan).

## Test data

- Factories generate **synthetic** data only (fake names, fake IDs). Never use real patient data anywhere.
- Each test is independent: isolate with per-test transactions rolled back, or truncate between tests. No reliance on test order.
- Time-dependent code takes an injectable clock; do not use real time or `sleep` in tests.

## Coverage targets

- `auth`, `audit`, `roles`, `users` modules: at least 90% line coverage.
- Other services: at least 80%.
- Coverage is a floor, not the goal. Meaningful assertions matter more than percentages.

## E2E flows (Playwright)

Maintain these as the system grows: login and forced password change; lockout after failures; admin creates a user and assigns a role; permission-restricted screen hidden and blocked; session idle timeout; then per phase: register patient, create visit, consultation, prescribe, dispense, invoice and pay.

## CI pipeline (must stay green)

1. Install with frozen lockfile
2. Lint and typecheck
3. Unit and integration tests (with Postgres service)
4. Build all apps
5. Playwright e2e
6. `pnpm check:licenses` and `pnpm audit`
7. Secret scan

## Rules for fixing failures

- Fix the cause. Never delete, skip (`.skip`), or weaken a test to get green.
- A failing test that reveals a spec problem is reported to the owner, not silently changed.
- Flaky tests are bugs; fix or report them, never retry-until-pass.
