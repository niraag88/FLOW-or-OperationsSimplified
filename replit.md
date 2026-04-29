# Overview
FLOW is a comprehensive full-stack web platform designed for UAE-based companies. It manages core business operations such as product, customer, supplier, purchasing, sales (Quotations, Invoices, Delivery Orders), and inventory management, all while supporting AED currency and 5% VAT. The platform aims to enhance operational efficiency, streamline financial oversight, and provide a robust, scalable, and user-friendly experience.

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
- **Destructive Admin Actions Guard**: Generalised pattern requiring typed confirmation phrases for irreversible admin actions (e.g., factory reset, permanent delete, user delete, purge old data, emergency restore). This applies advisory locks for destructive database operations to prevent concurrent execution.
- **Strict PO Numeric Validation (Task #369, RF-3B)**: All numeric fields on Purchase Order POST/PUT are strictly parsed at `server/lib/purchaseOrderTotals.ts`. Quantity, unit price, product ID, and FX rate reject partially-numeric strings (`"12abc"`, `"4.5abc"`, `"0x10"`), special-value strings (`"Infinity"`, `"NaN"`, `"abc"`), and exponent notation. `fxRateToAed` must be strictly positive when supplied; only genuinely blank values fall back to the default 4.85. Header-only PUT validates `fxRateToAed` via `parseFxRateOrDefault` BEFORE writing the header row, so a malformed fx can never partially save the header. Single source of truth for PO numeric coercion is the helper — routes import `parseFxRateOrDefault` instead of re-implementing `parseFloat(...) || default`.
- **CSRF Protection (Task #374)**: Every state-changing API route (POST/PUT/PATCH/DELETE under `/api/`) is protected by the `csrf-csrf` double-submit cookie pattern wired up in `server/csrf.ts`. Setup details:
  - `cookie-parser` middleware is installed in `server/bootstrap.ts` (must run before the CSRF middleware reads `req.cookies`).
  - `doubleCsrfProtection` is mounted at the app root in `server/routes.ts` (NOT under the `/api` prefix — Express strips the mount path from `req.path`, which would break the skip-list checks).
  - Skipped paths: anything outside `/api/`, `/api/auth/login` (chicken-and-egg), `/api/auth/logout` (idempotent), and signed-token uploads matching `/^\/api\/storage\/upload\/[A-Za-z0-9]+$/` (those have their own token-based auth and may be hit by external upload scripts without a session).
  - Token endpoint: `GET /api/auth/csrf-token` (auth-required) returns `{ csrfToken }` and sets the paired `flow.x-csrf-token` HTTP-only cookie.
  - The `getSessionIdentifier` for csrf-csrf is `req.sessionID` (falls back to `'anonymous'` for unauth requests; those will fail validation anyway).
  - **Frontend**: `client/src/lib/csrf.ts` patches `window.fetch` once at app boot (imported from `client/src/main.tsx` BEFORE React renders). Every mutating same-origin `/api/*` request lazily fetches a token, caches it, and attaches `X-CSRF-Token`. On a 403 with a CSRF-error body it clears the cache, refetches once, and retries. This single interceptor covers `apiRequest`, the Base44 SDK shim in `client/src/api/entities.ts`, and the ~88 raw `fetch()` mutating calls scattered across components — no per-callsite changes needed.
  - **E2E tests**: `tests/e2e/helpers.ts` does the same trick on the Node side: it installs a global `fetch` interceptor (idempotent via `Symbol.for('flow.csrf.patched')`) that auto-attaches CSRF to mutating `${BASE_URL}/api/*` requests carrying a `connect.sid` session cookie. The `apiPost`/`apiPut`/`apiDelete` helpers explicitly handle CSRF themselves; the interceptor is a safety net for the ~99 raw fetch mutations across spec files. Tests that need the un-intercepted fetch (e.g. the regression spec at `tests/e2e/04d-csrf-protection.spec.ts`) import `rawFetch` from helpers.
  - Adding a new public mutating route does NOT require declaring CSRF — the middleware covers everything by default. Skipping the check requires a deliberate addition to `SKIP_PATHS` in `server/csrf.ts`.
- **Durable Audit Logging for Sensitive Actions (Task #375)**: Audit-log writes were previously fire-and-forget — `db.insert(auditLog).values(...).catch(console.error)` — which silently dropped rows during a brief Neon hiccup. Two complementary write paths now live in `server/middleware.ts`:
  - **`writeAuditLogSync(tx, data)`** — REQUIRED for sensitive admin actions. Inserts inside the caller's transaction and throws on failure so the surrounding `db.transaction(...)` rolls back. Used at: invoice cancel (`server/routes/invoices.ts` PATCH `/api/invoices/:id/cancel`), DO cancel (`server/routes/delivery-orders.ts` PATCH `/api/delivery-orders/:id/cancel`), GRN cancel both itemless and reversal paths (`server/routes/goods-receipts.ts` PATCH `/api/goods-receipts/:id/cancel`), recycle-bin permanent delete (`server/routes/system.ts` DELETE `/api/recycle-bin/:id` — the route now wraps delete + audit in a `db.transaction`), and Admin user delete (`server/routes/settings.ts` DELETE `/api/users/:id` — same wrapping). Factory reset (`server/factoryReset.ts`) was already durable: its raw-pg transaction inserts the audit row directly and never swallows the error.
  - **`writeAuditLog(data)`** — fire-and-forget for ordinary CRUD bookkeeping. Now retries 3 times with exponential backoff between attempts (sleeps of 100ms then 200ms; no sleep after the final attempt) and, on retry exhaustion, appends to an on-disk JSONL spool (`audit-spool.jsonl` by default, override via `AUDIT_SPOOL_PATH`). A periodic worker (`startAuditSpoolReplayTimer` from `server/bootstrap.ts`) drains the spool back into the DB once it recovers — initial 30s grace, then every 60s. Replay snapshots the spool with an atomic rename, processes it without holding the lock, then re-appends still-failing rows under the lock so concurrent appends are never clobbered. The request itself is never failed by audit retries — same surface contract as before, just dramatically less likely to drop a row.
  - **Adding a new destructive route MUST use `writeAuditLogSync` inside its transaction.** A bare `writeAuditLog(...)` on a new write route that touches stock or status is a regression — see the comment block above `writeAuditLogSync` in `server/middleware.ts`.
  - Coverage: `tests/unit/auditLogDurability.test.ts` exercises a real Drizzle transaction, asserts a failed audit insert rolls the surrounding tx back (sentinel row never lands), and confirms the happy-path commit + the async retry path both still work.
- **TypeScript Top-Level Await Constraint (Task #378)**: `server/index.ts` and `server/bootstrap.ts` use top-level `await` intentionally — the entrypoint validates env vars synchronously, then `await import("./bootstrap")` so `db.ts`'s side-effect import never runs before validation. For `tsc --noEmit` to accept this, **`tsconfig.json` MUST keep `module` set to one of `es2022` / `esnext` / `node16` / `nodenext` / `preserve` AND `target` set to `es2017` or higher**. Current settings: `module: "ESNext"`, `target: "ES2022"`. Lowering either (e.g. dropping `target` so it defaults back to `ES3`) re-introduces four `TS1378` errors and silently breaks the type-check gate, letting unrelated type bugs land. If a future task needs to change either field, run `npx tsc --noEmit` and confirm exit 0 before merging.
- **Explicit Staff Role Matrix (Task #370, RF-7B)**: Write routes carry an explicit role list at the `requireAuth([...])` site instead of relying on the default `requireAuth()` (which silently allowed Staff). Source of truth for the matrix:
  - **Admin / Manager only**: Brands POST/PUT/DELETE; Suppliers POST/PUT/DELETE; Products POST/PUT/DELETE/`/bulk`/`/:id/adjust-stock`; Inventory `POST /api/stock-movements/bulk`; Stock-counts POST + DELETE; Customers DELETE; Delivery Orders DELETE; Invoices DELETE + `POST /:id/process-sale`; Quotations PUT + DELETE.
  - **Admin / Manager / Staff (operational)**: Customers POST + PUT (so Staff can capture walk-in customers from the invoice/DO/quotation forms); Invoices POST + PUT + `from-quotation` + `PATCH /:id/cancel` + `PATCH /:id/scan-key` + `DELETE /:id/scan-key` + `PATCH /:id/payment`; Delivery Orders POST + PUT + `PATCH /:id/cancel` + `PATCH /:id/scan-key` + `DELETE /:id/scan-key`; Quotations POST + `PATCH /:id/convert`.
  Tests in `tests/e2e/04c-staff-role-matrix.spec.ts` self-provision a Staff fixture user and assert each forbidden route returns exactly 403 and each allowed route is not blocked at the auth gate. Adding a new write route must declare its role list explicitly — bare `requireAuth()` on a write handler is a regression.

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