# Third-Party License Register

Purpose: the owner sells this software as proprietary code. Every dependency must be under a license that allows that. The agent adds each new dependency here **before** adding it to the project, and `pnpm check:licenses` enforces the allow-list automatically.

## Allowed licenses (production and development)

MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, PostgreSQL License, Unlicense/CC0 (public domain), OFL-1.1 (fonts only), Python-2.0 (ADR-021).

## Allowed licenses (devDependencies only — ADR-016, ADR-021)

BlueOak-1.0.0, CC-BY-4.0 (browser/compatibility data assets in tooling). Permitted strictly for tooling and developer dependencies; forbidden in production dependencies.

## Needs owner approval before use

MPL-2.0, CC-BY-3.0, any dual-licensed package (state which license is chosen).

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
| zod                              | 4.6.5   | MIT        | shared, api        | Schema validation (upgraded to Zod 4 per ADR-018)    | 2026-09-30   |
| @types/node                      | 26.x    | MIT        | api                | Node.js type definitions                             | 2026-09-30   |
| @nestjs/common                   | 11.2.7  | MIT        | api                | NestJS core framework common utilities               | 2026-09-30   |
| @nestjs/core                     | 11.2.7  | MIT        | api                | NestJS core application kernel                       | 2026-09-30   |
| @nestjs/platform-express         | 11.2.7  | MIT        | api                | NestJS HTTP adapter on Express                       | 2026-09-30   |
| @nestjs/swagger                  | 11.4.7  | MIT        | api                | OpenAPI / Swagger documentation                      | 2026-09-30   |
| swagger-ui-express               | 5.0.1   | MIT        | api                | Swagger UI middleware                                | 2026-09-30   |
| @nestjs/throttler                | 6.7.1   | MIT        | api                | Rate limiting guard and middleware                   | 2026-09-30   |
| @prisma/client                   | 6.19.3  | Apache-2.0 | api                | Prisma ORM runtime database client                   | 2026-09-30   |
| prisma                           | 6.19.3  | Apache-2.0 | api                | Prisma ORM CLI tooling (dev)                         | 2026-09-30   |
| helmet                           | 8.3.0   | MIT        | api                | HTTP security headers middleware                     | 2026-09-30   |
| nestjs-pino                      | 5.2.1   | MIT        | api                | NestJS integration for Pino structured logger        | 2026-09-30   |
| pino                             | 10.3.1  | MIT        | api                | High-performance structured JSON logger              | 2026-09-30   |
| pino-http                        | 11.0.0  | MIT        | api                | HTTP request logging middleware                      | 2026-09-30   |
| pino-pretty                      | 13.1.3  | MIT        | api                | Dev log pretty printing (dev)                        | 2026-09-30   |
| nestjs-zod                       | 5.5.0   | MIT        | api                | NestJS integration with Zod DTOs and validation      | 2026-09-30   |
| reflect-metadata                 | 0.2.2   | Apache-2.0 | api                | TypeScript decorator metadata polyfill               | 2026-09-30   |
| rxjs                             | 7.8.2   | Apache-2.0 | api                | Reactive extensions for JavaScript (NestJS dep)      | 2026-09-30   |
| @nestjs/cli                      | 11.0.24 | MIT        | api                | NestJS build & dev CLI (dev)                         | 2026-09-30   |
| @nestjs/testing                  | 11.2.7  | MIT        | api                | NestJS test utilities (dev)                          | 2026-09-30   |
| jest                             | 29.7.0  | MIT        | api                | Test runner (dev)                                    | 2026-09-30   |
| ts-jest                          | 29.4.14 | MIT        | api                | TypeScript preprocessor for Jest (dev)               | 2026-09-30   |
| @types/jest                      | 29.5.14 | MIT        | api                | Jest TypeScript definitions (dev)                    | 2026-09-30   |
| supertest                        | 7.3.0   | MIT        | api                | HTTP integration test assertions (dev)               | 2026-09-30   |
| @types/supertest                 | 6.0.3   | MIT        | api                | Supertest TypeScript definitions (dev)               | 2026-09-30   |
| @types/express                   | 5.0.6   | MIT        | api                | Express TypeScript definitions (dev)                 | 2026-09-30   |
| argon2                           | 0.45.1  | MIT        | api                | Password hashing with Argon2id (ADR-024)             | 2026-10-01   |
| cross-env                        | 10.1.0  | MIT        | api                | Cross-platform env vars (argon2 dep)                 | 2026-10-01   |
| @phc/format                      | 1.0.0   | MIT        | api                | PHC string format encoder/decoder (argon2 dep)       | 2026-10-01   |
| node-addon-api                   | 8.9.0   | MIT        | api                | Node.js C++ addon API bindings (argon2 dep)          | 2026-10-01   |
| node-gyp-build                   | 4.8.4   | MIT        | api                | Native prebuild loader (argon2 dep)                  | 2026-10-01   |

## Notes

- Check transitive dependencies too. The license check tool must scan the full tree.
- Fonts and icons are dependencies too. Record them, and only use those with permissive/OFL licenses.
- If a needed package is under a forbidden license, propose an alternative in `docs/04-decisions.md` and ask the owner.
