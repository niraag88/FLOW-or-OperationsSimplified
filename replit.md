# Overview

This project, FLOW, is a comprehensive full-stack web platform designed for UAE-based companies. It manages core business operations such as product, customer, supplier, purchasing, sales (Quotations, Invoices, Delivery Orders), and inventory management, all while supporting AED currency and 5% VAT. The platform aims to enhance operational efficiency, streamline financial oversight, and provide a robust, scalable, and user-friendly experience.

# User Preferences

Preferred communication style: Simple, everyday language.

## Critical Currency Format Standard
**ALWAYS use "AED 2220.00" format - Currency FIRST, then value**
**NEVER use "2220.00 AED" format - This is incorrect**
- Headers show currency: "Unit Price (AED)" & "Line Total (AED)"
- Line items show numbers only: "620" & "1860.00"
- Totals sections show: "AED 2220.00" format

# System Architecture

## Frontend Architecture
The frontend is built with React and TypeScript, using Vite, shadcn/ui, Radix UI, Tailwind CSS, React Router, TanStack Query, React Hook Form, and Zod for a modern, type-safe, and performant user interface.

## Backend Architecture
The backend is an Express.js application in TypeScript, leveraging PostgreSQL with Drizzle ORM for data persistence. It uses session-based authentication with a PostgreSQL store and features modularized routes for maintainability. ESBuild is used for production bundling.

## Database Layer
PostgreSQL, hosted on Neon Database, is managed via Drizzle ORM for type-safe database interactions. The schema evolution is handled through versioned Drizzle migrations. Key tables include a `data_source` column for tracking data provenance.

## Authentication & Authorization
The system employs session-based authentication with a PostgreSQL session store. A standard username/password system is in place, with a demo mode enabled via the Base44 SDK shim.

## Project Structure
The project uses a monorepo structure, separating client, server, and shared code, with TypeScript path aliases for organized imports.

## Document Format Standards
Internal documents use simple bordered data tables, while external documents (POs, Quotations, Invoices, DOs) are professional, A4-portrait optimized with company branding, utilizing a `POTemplate` pattern.

## Key Features & Implementations
- **Enhanced Document Management**: Purchase Orders include `supplier_scan_key` and detailed delivery reconciliation.
- **Financial Features**: Supports multi-currency handling with `fxRateToAed` and derived PO payment statuses.
- **API Improvements**: Server-side recycle-bin creation and robust invoice validation.
- **E2E Test Suite**: Comprehensive Playwright tests for core functionalities.
- **Backup and Restore System**: Robust system for scheduled backups, full restore capabilities, and factory reset functionality with multi-layered protection.
- **Goods Receipt (GRN) Management**: Detailed tracking, payment status, and an audit-preserving cancellation workflow.
- **Cancellation Workflows**: All-or-nothing cancellation contracts for Invoices and Delivery Orders, ensuring full stock reversal for delivered items.
- **Quotation Status Enforcement**: One-way status machine with strict transition validation.
- **Invoice Stock Reconciliation**: Inventory reconciliation on invoice edits, ensuring accurate stock levels.
- **Server Route Reorganisation**: Modularized API routes for improved maintainability.
- **Security Hardening**: Audit-Log and Recycle-Bin writes are exclusively server-side, with Admin-only access to sensitive operations and storage routes.
- **Factory Reset Four-Wall Defence (Task #331)**: `POST /api/ops/factory-reset` now requires the literal phrase `"FACTORY RESET — I UNDERSTAND THIS DELETES EVERYTHING"` (exported from `shared/factoryResetPhrase.ts`) to be present in the JSON body. Four independent walls catch the mistake of an automated test or careless click wiping live business data: (1) `executeFactoryReset()` throws `FactoryResetConfirmationError` BEFORE opening the transaction; (2) the route returns `400 factory_reset_confirmation_required` (no phrase echoed back) and `409 factory_reset_in_progress` if a `pg_try_advisory_lock` is already held by a concurrent reset; (3) the `UserManagement` dialog disables the destructive button until the typed text matches the phrase exactly; (4) `tests/e2e/factory-reset-gate.ts` skips destructive specs unless `ALLOW_FACTORY_RESET_TESTS=true` AND the parsed `DATABASE_URL` database name contains a disposable token (`test`, `disposable`, `ephemeral`) at a word boundary; CLI `scripts/delete-dummy-data.ts --all-user-data` requires `--confirm-phrase="..."` plus a 5-second host-printing countdown. The audit-log row records the typed phrase and parsed DB host. The always-on `tests/e2e/11-admin-route-gates.spec.ts` factory-reset test (anon→401, staff→403) is unaffected.
- **Restore Round-Trip Proof (Task #335)**: `tests/e2e/14-restore-roundtrip.spec.ts` exercises the full seed → backup → factory-reset → restore loop in one automated run so a future schema change, storage refactor, or migration that silently breaks restoration is caught immediately. The spec seeds fixtures across the major business tables (brand, supplier, customer, product, invoice with line items), snapshots row counts for every table in `FACTORY_RESET_TABLES` plus the invoice payload, runs `POST /api/ops/run-backups`, downloads the resulting `.sql.gz` to a local temp file (so the file survives the wipe — `backup_runs` is wiped by the reset), runs `POST /api/ops/factory-reset` with the typed phrase, replays the saved file via `POST /api/ops/restore-upload`, then asserts every row count matches the snapshot (audit_log is allowed to grow by the one "restore succeeded" entry the route writes after replay; every other table is strict-equality) and the invoice round-trips with intact line items. The spec is gated by the same Wall 4 used by `10-factory-reset.spec.ts` — skipped unless `ALLOW_FACTORY_RESET_TESTS=true` AND `DATABASE_URL` contains a disposable-marker token. Run locally with `ALLOW_FACTORY_RESET_TESTS=true DATABASE_URL="postgres://.../my_test_db" npx playwright test tests/e2e/14-restore-roundtrip.spec.ts`. To opt into CI, set both env vars on the destructive-tests job; on the normal job leave them unset and the spec self-skips with a single console line explaining why.

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database toolkit.

## UI & Styling
- **shadcn/ui**: Pre-built accessible React components.
- **Radix UI**: Headless UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.

## Development Tools
- **Vite**: Fast build tool.
- **ESBuild**: Fast JavaScript bundler.
- **TypeScript**: Static type checking.
- **PostCSS**: CSS processing.

## Frontend Libraries
- **TanStack Query**: Server state management.
- **React Hook Form**: Form handling and validation.
- **Wouter**: Lightweight client-side routing.
- **Zod**: Schema validation.
- **date-fns**: Date manipulation utilities.

## Backend Libraries
- **Express.js**: Web application framework.
- **connect-pg-simple**: PostgreSQL session store.
- **nanoid**: Unique ID generation.
- **busboy**: Multipart form parser.
- **tsx**: TypeScript execution for development.

## Platform Integration
- **Base44 SDK**: Business operations platform (shimmed for demo mode).