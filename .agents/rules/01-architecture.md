# Rule 01 — Architecture

## Style

- **Modular monolith**: one NestJS app, one React SPA, one PostgreSQL database per hospital deployment.
- No microservices, message brokers, Redis, GraphQL, or extra infrastructure unless an owner-approved decision exists.
- One codebase for all hospitals. **Never fork per customer.** Differences are handled by configuration and feature flags.
- Each hospital gets its own isolated deployment and database. Therefore **no `tenant_id` columns**.

## Repository layout (fixed)

```
hms/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── prisma/               # schema.prisma, migrations/, seeds/
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── config/           # Zod-validated env config
│   │       ├── common/           # guards, filters, interceptors, decorators, pipes
│   │       ├── database/         # PrismaService
│   │       └── modules/
│   │           ├── auth/  users/  roles/  audit/  health/
│   │           └── ...           # one folder per domain module, added per roadmap
│   └── web/                      # React + Vite
├── packages/
│   └── shared/                   # Zod schemas, DTO types, permission catalog, constants
├── docker/                       # docker-compose.yml, DB init scripts
├── docs/
├── scripts/
└── .agents/
```

## Backend module anatomy

```
modules/<name>/
  <name>.module.ts
  <name>.controller.ts     # HTTP only: parse, authorize, delegate, shape response
  <name>.service.ts        # business rules, transactions, audit calls
  <name>.repository.ts     # Prisma queries only
  dto/                     # types derived from packages/shared schemas
  __tests__/
  index.ts                 # public surface: only what other modules may use
```

Rules:

- Controllers contain no Prisma calls and no business logic.
- Services never touch HTTP objects (`req`, `res`).
- Repositories contain no business rules.
- Other modules may import only from a module's `index.ts` (its exported services).
- No circular module dependencies. Use in-process events when two modules must react to each other.
- Dependencies point inward: modules depend on `common/` and `database/`, never the reverse.

## Transactions and consistency

- The **service layer owns the transaction boundary**. Use Prisma interactive transactions.
- Operations that must be atomic run in ONE transaction, including their audit record. Example: dispensing a drug creates the dispense record, decrements stock, and writes the audit row together.
- Operations that must never execute twice (payments, dispensing, stock adjustments) need an idempotency key or a unique constraint that prevents duplicates.
- Use optimistic locking (`version` column) on editable records. A stale update returns `409 VERSION_CONFLICT`.

## In-process events

Use NestJS `EventEmitter` for decoupled reactions (for example "prescription created" notifies the pharmacy queue). Events are a convenience, never the source of truth. State changes are committed to the database first.

## Background jobs

Use `@nestjs/schedule` (in-process). Jobs (expired-session cleanup, stock expiry alerts) must be idempotent and safe to run twice. No external job queue.

## API conventions

- Base path `/api/v1`. REST + JSON. Plural kebab-case nouns (`/lab-orders`).
- `GET` read/list; `POST` create and actions (`POST /prescriptions/:id/dispense`); `PATCH` partial update (must include `version`); `PUT` only for replacing a set (e.g. a role's permissions); `DELETE` only for join records and sessions, **never clinical data**.
- Pagination: `?page=1&pageSize=25` (default 25, max 100). Sorting: `?sort=field:asc`. Search: `?q=`.
- Success: `{ "data": ..., "meta": { "page", "pageSize", "total" } }` (`meta` only on lists).
- Error: `{ "error": { "code", "message", "details"?, "requestId" } }`. Every error response without exception includes `requestId`.
- Error codes (UPPER_SNAKE): `VALIDATION_FAILED` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `VERSION_CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500), `SERVICE_UNAVAILABLE` (503).
- Never leak stack traces, SQL, or internal messages to clients.
- Always return explicit response DTOs. Never return Prisma entities directly.
- Every request gets a validated `requestId` (matching `^[a-zA-Z0-9_-]{1,64}$`, otherwise a generated UUID v4), returned in the `x-request-id` response header, included in log lines (`id`), included in audit rows, and returned in every error body.
- Generate OpenAPI docs from the code. The web app uses types from `packages/shared`; never hand-duplicate types.

## Configuration

- Environment variables only, validated with Zod at boot (fail fast on invalid config).
- Never hardcode hosts, ports, secrets, or timezone.
- Maintain `.env.example` with every variable and a safe placeholder.
- The application must run against ANY PostgreSQL via `DATABASE_URL`. No cloud-provider SDKs. This keeps the deployment choice (hospital server or cloud) open.

## Time and locale

- Server and database use UTC. The UI renders times in the hospital timezone (`HOSPITAL_TIMEZONE`).
- Dates and times in APIs use ISO 8601 with timezone.
