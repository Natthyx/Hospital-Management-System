---
description: Scaffold and deliver a new backend + frontend domain module the HMS way
---

Use when a roadmap milestone introduces a new domain module. Follow the steps in order and do not skip any.

1. Read `AGENTS.md`, all `.agents/rules/`, `docs/05-progress.md`, and the approved spec for this module. **If no approved spec exists, stop and draft one** from `docs/03-domain-modules.md`, list open questions, and wait for the owner's approval.
2. Confirm the module belongs to the CURRENT milestone. If not, stop.
3. Write a short plan: tables, permissions, endpoints, audit events, UI screens, tests. Present it and **wait for approval** (it touches schema, permissions, and audit).
4. Add the new permission codes to the catalog in `packages/shared`, and update `docs/02-foundation-spec.md` or the module spec accordingly. Add grants for default roles in the required seed.
5. Add the Zod schemas and DTO types to `packages/shared`.
6. Create the Prisma models and the migration (use `/add-migration`). Include `hms_app` grants (no DELETE on clinical tables).
7. Create the backend module folder: module, controller, service, repository, dto, `index.ts`, `__tests__` (rule 01 anatomy).
8. Implement services with: transactions, optimistic locking, audit calls inside the transaction, typed domain errors, no PHI in logs.
9. Implement controllers with `@RequirePermission`, strict Zod validation, explicit response DTOs, and `@Audit` where reads of patient data occur.
10. Write tests: happy path, validation, permission matrix, audit rows, version conflict, transactions, IDOR, no data leakage (rule 06).
11. Build the frontend feature folder: pages, forms (shared Zod schema), tables with server-side pagination, permission-aware UI, i18n keys, patient identifiers in headers where applicable (rule 07).
12. Add or update Playwright flows for the module's critical path.
13. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. Fix real causes; never skip or loosen tests.
14. Update `docs/05-progress.md`, `docs/04-decisions.md`, and `docs/THIRD_PARTY_LICENSES.md` as needed.
15. Report: what was built, what was tested, open questions, and anything outside scope that you noticed (recorded under "Ideas / follow-ups").
