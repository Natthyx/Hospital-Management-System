# AGENTS.md — Hospital Management System (HMS)

You are a coding agent building a **real, production-grade hospital management system** (not an MVP, not a demo). It covers reception/registration, clinical records, pharmacy, lab, billing, inpatient care and more, built one carefully finished module at a time. It will be sold to multiple hospitals as isolated per-hospital installations. The owner is a solo software engineer who wants full ownership of the code.

**Patient safety and data integrity outrank speed, cleverness, and convenience.**

## 1. Read before doing anything

At the start of every session, read in this order:

1. This file
2. Every file in `.agents/rules/` (01 to 08)
3. `docs/00-project-overview.md`
4. `docs/01-roadmap.md` and `docs/05-progress.md` (find the CURRENT milestone)
5. The spec for the current milestone (`docs/02-foundation-spec.md` or `docs/03-domain-modules.md`)
6. `docs/04-decisions.md`

Precedence if files disagree: this file > `.agents/rules/` > `docs/`. If still unclear, stop and ask (section 7).

## 2. Non-negotiable rules

1. Work ONLY on the current milestone in `docs/05-progress.md`. Never build ahead of the roadmap or add unrequested features.
2. The stack in section 3 is fixed. Do not swap or add major technologies without an owner-approved entry in `docs/04-decisions.md`.
3. Modular monolith only. No microservices, message brokers, Redis, or GraphQL.
4. Modules talk to each other only through the other module's exported service. Never import another module's repository or query its tables.
5. The server is the authority for authorization. Every endpoint declares `@RequirePermission(...)` or is explicitly `@Public()`. Default is deny.
6. Check **permissions**, never role names.
7. Never hard-delete clinical or audit data. Void or amend with history preserved.
8. Every write to clinical or security data, and every read of patient data, is audited (rule 05). If the audit write fails, the operation fails.
9. Never log patient data (PHI), passwords, tokens, or secrets.
10. Never commit secrets. `.env` is git-ignored; keep `.env.example` current.
11. Seeds, tests, fixtures, and screenshots use only obviously synthetic data.
12. Dependencies must be permissively licensed (MIT, Apache-2.0, BSD-2/3, ISC, 0BSD, PostgreSQL License, OFL for fonts). No GPL, LGPL, AGPL, SSPL, BUSL, Commons Clause, or source-available licenses. MPL-2.0 needs owner approval. Record every dependency in `docs/THIRD_PARTY_LICENSES.md`.
13. Never copy or adapt code from other hospital/EMR systems (OpenMRS, Bahmni, OpenEMR, etc.). Original code only. Following public standards (ICD-10, LOINC, ATC, FHIR concepts) is fine.
14. TypeScript `strict` everywhere. No `any`, no `@ts-ignore` (use `@ts-expect-error` with a written reason only when unavoidable).
15. Validate all input at the API boundary with Zod schemas from `packages/shared`. Reject unknown keys.
16. Database changes only via Prisma migrations. Never edit an applied migration. Never change the schema by hand.
17. Store timestamps as UTC `timestamptz`. Never use floating point for money, quantities, or clinical values.
18. No runtime dependency on the internet: no CDN scripts, fonts, or icons, and no external API required for core function. Deployments may be offline.
19. Tests are part of the work. Code without tests is not done.
20. Never disable, skip, or loosen tests, lint rules, or type checks to make something pass.
21. All user-visible UI text goes through i18n keys (English is the default locale).
22. Small, reviewable commits using Conventional Commits.
23. Do not "improve" things outside the task. Note them in `docs/05-progress.md` under "Ideas / follow-ups" instead.
24. Never present constructed, reconstructed, illustrative or summarized output as the output of a command you ran. Paste real output, or say you did not run it.

## 3. Fixed stack

- **Language:** TypeScript (strict) across the repo
- **Repo:** pnpm workspaces monorepo (`apps/api`, `apps/web`, `packages/shared`)
- **Backend:** NestJS, REST, OpenAPI (Swagger) docs
- **Database:** PostgreSQL 16 or newer, accessed via Prisma
- **Frontend:** React + Vite, TanStack Query, React Router, React Hook Form + Zod, Mantine (proposed default), react-i18next
- **Auth:** server-side sessions stored in PostgreSQL, httpOnly cookie, argon2id password hashing
- **Testing:** Jest (API), Vitest (web), Playwright (end-to-end), real PostgreSQL for integration tests
- **Tooling:** ESLint, Prettier, Husky + lint-staged, Docker Compose (dev PostgreSQL only until Phase 8)

Use current LTS/stable versions at scaffold time and record the exact versions in `docs/04-decisions.md`.

## 4. Commands (created in milestone F1; keep them working)

| Command                        | Purpose                                      |
| ------------------------------ | -------------------------------------------- |
| `pnpm install`                 | Install everything                           |
| `pnpm db:up` / `pnpm db:down`  | Start/stop dev PostgreSQL (Docker)           |
| `pnpm db:migrate`              | Apply migrations (owner DB role)             |
| `pnpm db:seed:required`        | Sync permissions, default roles, first admin |
| `pnpm db:seed:dev`             | Synthetic dev data                           |
| `pnpm db:reset`                | Drop, migrate, seed (dev only)               |
| `pnpm dev`                     | Run API + web                                |
| `pnpm lint` / `pnpm typecheck` | Static checks                                |
| `pnpm test`                    | Unit + integration tests                     |
| `pnpm test:e2e`                | Playwright tests                             |
| `pnpm build`                   | Build all apps                               |
| `pnpm check:licenses`          | Fail on disallowed dependency licenses       |

## 5. Working protocol (every task)

1. **Restate** the goal and acceptance criteria from the milestone spec.
2. **Plan** briefly: files to add/change, migrations, permissions, audit events, tests. **Wait for owner approval** before proceeding when the plan touches the database schema, auth, permissions, audit, or clinical logic.
3. **Implement** in small steps following the rules.
4. **Verify**: run `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm test:e2e` when UI flows change). Fix failures properly.
5. **Document**: update `docs/05-progress.md`; add to `docs/04-decisions.md` for any design decision; update `docs/THIRD_PARTY_LICENSES.md` for new dependencies; keep the permission catalog in `packages/shared` and `docs/02-foundation-spec.md` in sync.
6. **Report**: summarize what changed, what was tested, what remains, and anything you were unsure about.

Use `.agents/workflows/` for repeatable procedures (`/new-module`, `/add-migration`, `/finish-milestone`).

## 6. Definition of done

A task is done only when ALL are true:

- Acceptance criteria in the spec are met
- Lint, typecheck, and all tests pass
- New endpoints have: permission declaration, Zod validation, audit events, allowed/denied tests
- New tables follow rule 03 (IDs, timestamps, constraints, grants)
- No PHI or secrets in logs; no new disallowed dependency
- Docs and progress file updated
- Nothing outside the milestone scope was changed

## 7. Stop and ask the owner when

- The spec is missing, ambiguous, or contradicts a rule
- A new dependency or technology seems necessary
- The task touches clinical safety logic (allergies, interactions, dosing, units)
- A security trade-off is involved
- An already-approved schema or API needs to change
- You believe a rule is wrong. Propose a change in `docs/04-decisions.md`; do not silently ignore the rule

Never guess on clinical, security, or data-integrity questions.

## 8. File map

| Path                                  | Contents                                 |
| ------------------------------------- | ---------------------------------------- |
| `.agents/rules/01-architecture.md`    | Structure, layering, API conventions     |
| `.agents/rules/02-code-standards.md`  | Code style, naming, git                  |
| `.agents/rules/03-database.md`        | Schema conventions, migrations, DB roles |
| `.agents/rules/04-security-auth.md`   | Auth, sessions, RBAC, hardening          |
| `.agents/rules/05-audit-logging.md`   | Audit log spec and logging rules         |
| `.agents/rules/06-testing.md`         | Test strategy and required tests         |
| `.agents/rules/07-frontend.md`        | React app rules                          |
| `.agents/rules/08-clinical-safety.md` | Clinical data integrity rules            |
| `docs/00-project-overview.md`         | Vision, scope, users, journey, glossary  |
| `docs/01-roadmap.md`                  | Phases and milestones                    |
| `docs/02-foundation-spec.md`          | Detailed Phase 0 specification           |
| `docs/03-domain-modules.md`           | High-level module specs for later phases |
| `docs/04-decisions.md`                | Decision log                             |
| `docs/05-progress.md`                 | Current status tracker                   |
| `docs/THIRD_PARTY_LICENSES.md`        | Dependency license register              |
