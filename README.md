# Hospital Management System

A production-grade hospital management system covering reception, clinical records, pharmacy, lab, billing, and inpatient care.

## Prerequisites

- **Node.js** ≥ 22.20.0 (see `.nvmrc`)
- **pnpm** ≥ 10.28.0 (`corepack enable` to use the version pinned in `packageManager`)
- **Docker** (for the development PostgreSQL database)

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env
# Edit .env — at minimum, set the three database passwords

# 3. Start the development database
pnpm db:up

# 4. Migrate database and run initial required seed
pnpm db:migrate
pnpm build
pnpm db:seed:required

# 5. Verify tooling
pnpm lint        # ESLint (flat config, type-aware)
pnpm typecheck   # TypeScript strict across all packages

# 6. Check dependency licenses
pnpm check:licenses
```

> [!IMPORTANT]
> **Admin Password Security:** Running `pnpm db:seed:required` creates the initial `admin` user if no users exist and prints an unambiguous 24-character temporary password to stdout. This temporary password **prints only once**, must be changed at first login (`must_change_password` is set to `true`), and **must never be pasted into chats, issue trackers, or logs**.

## Available Scripts

| Command                       | Purpose                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `pnpm install`                | Install all workspace dependencies                                   |
| `pnpm db:up` / `pnpm db:down` | Start/stop dev PostgreSQL (Docker)                                   |
| `pnpm db:migrate`             | Apply Prisma migrations _(F2)_                                       |
| `pnpm db:seed:required`       | Sync permissions, default roles, first admin _(F3)_                  |
| `pnpm db:seed:dev`            | Load synthetic dev data _(F3)_                                       |
| `pnpm db:reset`               | Drop, migrate, seed — requires `docker compose down -v` first _(F2)_ |
| `pnpm dev`                    | Run API + web dev servers _(F2/F6)_                                  |
| `pnpm lint`                   | ESLint across all packages                                           |
| `pnpm typecheck`              | TypeScript type checking                                             |
| `pnpm test`                   | Unit + integration tests _(F2)_                                      |
| `pnpm test:e2e`               | Playwright end-to-end tests _(F6)_                                   |
| `pnpm build`                  | Build all apps                                                       |
| `pnpm check:licenses`         | Validate dependency licenses against policy                          |

Scripts marked _(FN)_ are placeholders that exit with an error until their milestone is implemented.

## Project Structure

```
├── apps/
│   ├── api/            # NestJS backend
│   └── web/            # React + Vite frontend
├── packages/
│   └── shared/         # Zod schemas, types, permission catalog
├── docker/             # Docker Compose + PostgreSQL init
├── scripts/            # Utility scripts (license checker)
├── docs/               # Project documentation
└── .agents/            # Agent rules and workflows
```

## Documentation

- [Project Overview](docs/00-project-overview.md)
- [Roadmap](docs/01-roadmap.md)
- [Foundation Spec](docs/02-foundation-spec.md)
- [Decision Log](docs/04-decisions.md)
- [Progress Tracker](docs/05-progress.md)
- [Third-Party Licenses](docs/THIRD_PARTY_LICENSES.md)
