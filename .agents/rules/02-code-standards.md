# Rule 02 — Code Standards

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` where practical.
- No `any`. Use `unknown` and narrow it. No `@ts-ignore`. `@ts-expect-error` only with a written reason.
- Prefer `type` for data shapes, `interface` for contracts implemented by classes.
- Use `readonly` and immutability by default. No mutation of function arguments.
- No default exports (except where a framework requires them). Named exports only.
- Use enums sparingly. Prefer string-literal unions defined in `packages/shared`.
- All async code uses `async/await`. Never leave a promise unhandled.

## Naming

| Thing                 | Convention                        | Example                               |
| --------------------- | --------------------------------- | ------------------------------------- |
| Files and folders     | kebab-case                        | `lab-orders.service.ts`               |
| Classes, types        | PascalCase                        | `PatientsService`                     |
| Functions, variables  | camelCase                         | `findByMrn`                           |
| Constants             | UPPER_SNAKE                       | `MAX_PAGE_SIZE`                       |
| DB tables and columns | snake_case, plural tables         | `lab_orders`, `created_at`            |
| Permission codes      | `resource.action` lowercase       | `patient.read`                        |
| Audit actions         | `resource.action` or `auth.event` | `patient.update`, `auth.login_failed` |
| Env variables         | UPPER_SNAKE                       | `SESSION_IDLE_MINUTES`                |

## Structure and size

- One responsibility per file. Keep functions short and focused; extract when a function needs a comment to explain its sections.
- No dead code, no commented-out code, no `TODO` without an entry in `docs/05-progress.md` under "Ideas / follow-ups".
- No `console.log`. Use the injected pino logger.

## Comments

- Comments explain **why**, not what. Non-obvious clinical or business rules get a comment naming the rule.
- Public functions in shared packages get short doc comments.

## Errors

- Throw typed domain errors from services (for example `NotFoundError`, `ConflictError`, `BusinessRuleError`). A global exception filter maps them to the API error format.
- Never swallow errors. Never catch just to log and continue on clinical or security paths.

## Logging

- Structured JSON logs via pino with the `requestId`.
- Levels: `error` (needs attention), `warn` (unexpected but handled), `info` (lifecycle), `debug` (dev only).
- **Never log**: patient names, identifiers, diagnoses, notes, request bodies of clinical endpoints, passwords, tokens, cookies. Log IDs only.

## Tooling

- ESLint (strict TypeScript ruleset) and Prettier, enforced by Husky + lint-staged on commit and by CI.
- Import order enforced by lint. No relative imports that climb more than two levels; use path aliases.

## Git

- Trunk-based with short-lived branches: `feat/<milestone>-<topic>`, `fix/<topic>`, `chore/<topic>`.
- Conventional Commits: `feat(patients): add duplicate detection`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`.
- One logical change per commit. Migrations ship in the same commit as the code that needs them.
- Never commit: `.env`, secrets, real data, generated build output, or `node_modules`.
- Never rewrite published history without owner approval.

## Dependencies

- Prefer the platform and existing dependencies over adding new ones.
- Before adding any package: check its license (rule 12 in AGENTS.md), maintenance status, and size. Add it to `docs/THIRD_PARTY_LICENSES.md`. Pin via lockfile; commit `pnpm-lock.yaml`.
