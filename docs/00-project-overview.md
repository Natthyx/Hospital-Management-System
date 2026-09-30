# 00 — Project Overview

## Vision

Build a complete, production-grade Hospital Management System (HMS) that a hospital can run its daily operations on: patient registration, clinical records, pharmacy, laboratory, billing, inpatient care, and reporting. It is a real product, built module by module with every part finished carefully, not a prototype.

## Business context

- Built by a solo software engineer who **fully owns the code** (proprietary, no copyleft dependencies, no code borrowed from other hospital systems).
- Purpose: (1) a serious portfolio product for the owner's Upwork profile, and (2) a sellable system for multiple hospitals.
- Sold as **isolated per-hospital installations**: each hospital has its own database and instance, all from one codebase and one automated release process.
- Must be easy for one person to maintain: one codebase, no per-customer forks, configuration instead of customization, automated migrations and tests.

## Deployment stance (current decision)

- Development runs against PostgreSQL in local Docker.
- The application is **deployment-agnostic**: it runs from environment variables against any PostgreSQL. It works on a hospital's own server or a cloud VM.
- No dependency on the internet at runtime (no CDNs or required external APIs), so an offline hospital LAN install stays possible.
- Installer, backup/restore tooling, update mechanism, and licensing are **Phase 8**. Do not build them earlier, but do not write code that prevents them.
- The owner cannot currently afford cloud hosting. Hosting is decided later per customer. A demo with synthetic data may be hosted on a free tier or a small VPS. **Never place real patient data on free tiers.**

## Users and roles (default roles; hospitals can adjust)

| Role                      | Main work                                                               |
| ------------------------- | ----------------------------------------------------------------------- |
| Administrator (IT/system) | Users, roles, settings, audit review. No clinical access by default     |
| Receptionist              | Register patients, issue patient cards, create visits, manage the queue |
| Nurse                     | Triage, vitals, nursing notes, ward care                                |
| Doctor                    | Consultations, diagnoses, orders, prescriptions                         |
| Pharmacist                | Prescription queue, dispensing, stock                                   |
| Lab technician            | Lab orders, samples, results                                            |
| Cashier                   | Invoices, payments, receipts                                            |

## Core patient journey (the backbone of the design)

1. **Reception** creates or finds the patient, issues the patient card (unique ID/MRN), registers a visit, issues a queue token.
2. **Nurse** takes vitals at triage.
3. **Doctor** examines the patient and logs the condition: complaints, history, findings, diagnosis.
4. Doctor orders **lab/imaging** tests, and writes **prescriptions**.
5. **Lab** processes the order and returns results to the doctor.
6. **Pharmacy** receives the prescription, checks stock, dispenses.
7. **Billing** collects charges from every department and takes payment.
8. Follow-up is scheduled, or the patient is admitted (inpatient phase) and later discharged.

Everything links to one patient record identified by the patient ID.

## Scope

**In scope (eventually):** registration and patient cards, visits and queues, triage and vitals, consultations and diagnoses, orders and prescriptions, pharmacy and stock, laboratory, billing and payments, inpatient wards and beds, discharge, radiology orders, inventory, staff records, reports and analytics, admin and audit.

**Out of scope until the owner says otherwise:** telemedicine, patient-facing portal or mobile app, insurance-claim electronic submission to external payers, integration with external devices (lab analyzers, PACS), HL7/FHIR network APIs, multi-hospital shared hosting (multi-tenancy), AI features.

## Open questions (do not assume; ask the owner when a phase needs them)

- Target country and regulations (data protection, medical record retention)
- Languages needed beyond English, and right-to-left support
- Currency and payment methods
- Drug interaction and allergy data source
- Patient card format (paper, plastic, printer model, barcode vs QR)
- Insurance and credit handling model
- Whether inpatient care is needed for the first sales

## Quality bar

- Correct before clever. Safe before fast.
- Every module ships with tests, audit coverage, permissions, and documentation.
- Each phase is finished (usable end to end) before the next starts.

## Glossary

| Term              | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| MRN               | Medical Record Number, the human-friendly patient identifier     |
| Visit / Encounter | One episode of care (outpatient visit or inpatient stay)         |
| EMR               | Electronic medical record                                        |
| RBAC              | Role-based access control (here, permission-based)               |
| PHI               | Protected health information, any patient-identifiable data      |
| FEFO              | First-expired, first-out stock dispensing                        |
| MAR               | Medication administration record (inpatient)                     |
| ICD-10            | Standard diagnosis code system                                   |
| LOINC             | Standard lab test code system                                    |
| ATC               | Standard drug classification system                              |
| FHIR              | HL7 standard for health data exchange (used as a modeling guide) |
| Break-glass       | Emergency access override, heavily audited (later phase)         |
