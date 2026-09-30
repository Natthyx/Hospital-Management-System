---
description: Verify and close the current milestone, then request owner sign-off
---

Use when you believe the current milestone is complete. Do not start the next milestone until the owner signs off.

1. Re-read the milestone's acceptance criteria in the spec (`docs/02-foundation-spec.md` or the approved module spec). Check each criterion explicitly and list the evidence (test name, screen, endpoint).
2. Run the full verification: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build && pnpm check:licenses`. All must pass. Run `pnpm audit` and review results.
3. Confirm the global guard tests exist and pass: every route protected or `@Public()`; `hms_app` grants (no UPDATE/DELETE on `audit_log`, no DELETE on clinical tables); migrations apply from an empty database; permission catalog matches the seeded table.
4. Review the diff against the rules: no PHI or secrets in logs, no `any`, no skipped tests, no out-of-scope changes, no disallowed dependency, UI strings via i18n, audit events present for every clinical write and patient-data read.
5. Update the docs: permission catalog and endpoint lists match the code; `docs/04-decisions.md` has entries for every design decision made; `docs/THIRD_PARTY_LICENSES.md` is current.
6. Update `docs/05-progress.md`: tick the milestone, add a log entry (date, what was done, tests run, open issues), move leftover ideas to "Ideas / follow-ups", and list open questions for the owner.
7. Present a sign-off summary to the owner: what was delivered, how it was verified, known limitations, and the proposed next milestone. **Stop and wait for the owner's approval.** After approval, record the sign-off in `docs/05-progress.md` and set the next milestone as current.
