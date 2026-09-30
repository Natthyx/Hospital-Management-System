# Third-Party License Register

Purpose: the owner sells this software as proprietary code. Every dependency must be under a license that allows that. The agent adds each new dependency here **before** adding it to the project, and `pnpm check:licenses` enforces the allow-list automatically.

## Allowed licenses (production and development)

MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, PostgreSQL License, Unlicense/CC0 (public domain), OFL-1.1 (fonts only).

## Allowed licenses (devDependencies only — ADR-016)

BlueOak-1.0.0, Python-2.0. Permitted strictly for tooling and developer dependencies; forbidden in production dependencies.

## Needs owner approval before use

MPL-2.0, CC-BY (non-code assets), any dual-licensed package (state which license is chosen).

## Forbidden

GPL (any version), LGPL, AGPL, SSPL, BUSL, Commons Clause, Elastic License, "source-available" or "non-commercial" licenses, and packages with no license.

## Register

| Package                          | Version | License    | Used in            | Purpose                                              | Added (date) |
| -------------------------------- | ------- | ---------- | ------------------ | ---------------------------------------------------- | ------------ |
| typescript                       | 5.9.3   | Apache-2.0 | root, all packages | TypeScript compiler                                  | 2026-09-30   |
| eslint                           | 9.39.5  | MIT        | root               | Linting                                              | 2026-09-30   |
| @eslint/js                       | 9.28.0  | MIT        | root               | ESLint recommended JS rules                          | 2026-09-30   |
| @typescript-eslint/parser        | 8.71.0  | MIT        | root               | TypeScript ESLint parser                             | 2026-09-30   |
| @typescript-eslint/eslint-plugin | 8.71.0  | MIT        | root               | TypeScript ESLint rules                              | 2026-09-30   |
| typescript-eslint                | 8.71.0  | MIT        | root               | TypeScript ESLint flat config helper                 | 2026-09-30   |
| eslint-config-prettier           | 10.1.8  | MIT        | root               | Disable formatting rules that conflict with Prettier | 2026-09-30   |
| eslint-plugin-import-x           | 4.17.1  | MIT        | root               | Import order enforcement                             | 2026-09-30   |
| globals                          | 16.5.0  | MIT        | root               | Global variable definitions for ESLint               | 2026-09-30   |
| prettier                         | 3.9.9   | MIT        | root               | Code formatting                                      | 2026-09-30   |
| husky                            | 9.1.7   | MIT        | root               | Git hooks                                            | 2026-09-30   |
| lint-staged                      | 16.4.0  | MIT        | root               | Run linters on staged files                          | 2026-09-30   |
| @commitlint/cli                  | 19.8.1  | MIT        | root               | Commit message linting                               | 2026-09-30   |
| @commitlint/config-conventional  | 19.8.1  | MIT        | root               | Conventional Commits config                          | 2026-09-30   |
| zod                              | 3.25.67 | MIT        | shared, api        | Schema validation                                    | 2026-09-30   |
| @types/node                      | 22.x    | MIT        | api                | Node.js type definitions                             | 2026-09-30   |

## Notes

- Check transitive dependencies too. The license check tool must scan the full tree.
- Fonts and icons are dependencies too. Record them, and only use those with permissive/OFL licenses.
- If a needed package is under a forbidden license, propose an alternative in `docs/04-decisions.md` and ask the owner.
