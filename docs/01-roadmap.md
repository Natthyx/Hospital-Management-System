# 01 — Roadmap

## How the roadmap works

- Work proceeds **in order, one milestone at a time**. The current milestone is recorded in `docs/05-progress.md`.
- Each phase must be **finished and usable end to end** (tests green, docs updated, owner sign-off) before the next phase starts.
- Phase 0 has a detailed spec (`02-foundation-spec.md`). For every later phase, **a detailed spec must be written and approved by the owner before implementation starts**. The agent drafts it from `03-domain-modules.md`, asks the open questions, and waits for approval. Do not implement from the high-level description alone.
- Do not work ahead. Ideas for later phases go in "Ideas / follow-ups" in the progress file.

## Phase 0 — Foundation (detailed in `02-foundation-spec.md`)

| ID  | Milestone           | Outcome                                                                                                                 |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F1  | Repo and tooling    | Monorepo, TypeScript strict, lint/format/hooks, Docker Compose PostgreSQL (two DB roles), validated config, CI skeleton |
| F2  | API skeleton        | NestJS app, logging, request IDs, error format, health endpoint, Prisma set up, first migration, OpenAPI                |
| F3  | Identity data model | Users, roles, permissions, sessions tables, permission catalog, seeds, default roles, DB grants                         |
| F4  | Authentication      | Login, logout, sessions, CSRF, lockout, password change, permission guard, `@Public`, route audit test                  |
| F5  | Audit module        | `audit_log`, `AuditService`, interceptor, DB immutability, audit query endpoint                                         |
| F6  | Web skeleton        | React app shell, login, forced password change, API client, permission-aware routing, i18n, timeout UX                  |
| F7  | Admin screens       | User management, role editor, audit viewer                                                                              |
| F8  | Quality gate        | Full test suite, e2e for auth/admin flows, CI green, docs and licenses register complete                                |

**Phase 0 exit criteria:** an administrator can log in, create users, define roles, and review the audit trail; every endpoint is permission-checked and audited; all tests and CI pass.

## Phase 1 — Reception and Registration

- R1 Patient master record (demographics, identifiers, contacts, next of kin, consent flags); MRN generation
- R2 Patient search and duplicate detection (fuzzy matching with `pg_trgm`); merge-by-link design
- R3 Patient card (printable, with barcode/QR)
- R4 Visits/encounters and queue tokens
- R5 Reception UI (fast registration flow, keyboard-first)

**Exit:** a receptionist can register a patient, print the card, open a visit, and manage the queue; all audited and permission-controlled.

## Phase 2 — Clinical (Nurse and Doctor)

- C1 Departments and staff profiles (doctors, specialties)
- C2 Triage and vitals
- C3 Consultation records: complaints, history, examination, diagnoses (ICD-10), plan; revision history
- C4 Orders (lab, imaging, procedures)
- C5 Prescriptions (structured dosing)
- C6 Patient history and timeline views
- C7 Referrals and follow-up appointments

## Phase 3 — Pharmacy

- P1 Drug catalog (ATC, forms, strengths)
- P2 Suppliers, receiving stock, batches with expiry
- P3 Prescription queue and dispensing (FEFO, atomic, idempotent)
- P4 Returns, adjustments, write-offs (stock movements)
- P5 Allergy and interaction checks (data source decided with the owner)
- P6 Controlled-substance register; low-stock and expiry alerts

## Phase 4 — Laboratory

- L1 Test catalog with reference ranges
- L2 Order queue and sample tracking
- L3 Result entry, validation, corrections
- L4 Printable lab reports; results visible to the ordering doctor

## Phase 5 — Billing

- B1 Price lists and service catalog
- B2 Charge capture from all departments
- B3 Invoices, payments, receipts
- B4 Credit, insurance handling (as decided), refunds as reversals
- B5 Cashier shift closing and daily cash reports

## Phase 6 — Inpatient

- I1 Wards, rooms, beds
- I2 Admission, transfer, discharge
- I3 Nursing charting and medication administration record (MAR)
- I4 Discharge summary

## Phase 7 — Supporting modules

- Imaging/radiology reports, general inventory and procurement, staff scheduling, reports and analytics dashboards

## Phase 8 — Delivery hardening (before selling to a real hospital)

- D1 Packaging and installer (Docker Compose bundle, install script, supported server spec)
- D2 Backup and restore tooling (automated, encrypted, restore test), UPS/power-loss guidance
- D3 Update mechanism (signed update package, automatic pre-update backup, rollback)
- D4 Offline license file validation
- D5 Diagnostics bundle (no patient data) and support tooling
- D6 Audit-log tamper evidence (hash chain)
- D7 Security review, performance testing, load with realistic data volume
- D8 Documentation: install guide, admin guide, user guides, data dictionary
- D9 Demo dataset (synthetic) and demo deployment
