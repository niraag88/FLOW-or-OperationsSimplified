# Overview
FLOW is a full-stack web platform designed for businesses in the UAE. It streamlines product, customer, supplier, purchasing, sales (Quotations, Invoices, Delivery Orders), and inventory management, incorporating AED currency and 5% VAT support. The platform aims to enhance operational efficiency, improve financial oversight, and offer a scalable, user-friendly solution.

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
The frontend is built with React and TypeScript, utilizing Vite, shadcn/ui, Radix UI, Tailwind CSS, React Router, TanStack Query, React Hook Form, and Zod for a modern, type-safe, and performant user experience. UI/UX design emphasizes professional, A4-portrait optimized external documents with company branding using a `POTemplate` pattern.

## Backend Architecture
The backend is an Express.js application in TypeScript, using PostgreSQL with Drizzle ORM. It features session-based authentication with a PostgreSQL store and modularized routes. ESBuild handles production bundling.

## Database Layer
PostgreSQL, hosted on Neon Database, is managed via Drizzle ORM for type-safe interactions and schema migrations.

## Authentication & Authorization
The system uses session-based authentication with a PostgreSQL store and standard username/password. A demo mode is available via the Base44 SDK shim. Role-based authorization (Admin/Manager and Staff) controls access to write operations. Destructive admin actions require typed confirmation and employ advisory locks.

**Role matrix (Task #429, refined by #440):** Staff can fully CRUD Quotations, Invoices, Delivery Orders, Customers, and Brands (including delete-to-recycle-bin). Purchase Orders, Goods Receipts, and Suppliers — including reads, scan-key uploads, and dashboard payload — are Admin/Manager-only. Recycle bin: anyone can read and delete-to-bin; only Admin/Manager can restore or permanently delete. Audit Log UI lives only inside User Management (Admin-only); Manager has no audit-log UI surface (server `/api/audit-logs` route is left as Admin/Manager but there is no Manager-facing client). Settings → Storage is Admin-only. UI hides controls and offers permission-aware 403 toasts; the server is the source of truth.

## Project Structure
A monorepo structure separates client, server, and shared code, using TypeScript path aliases. Backend files are organized into per-concern directories to maintain manageability and reduce file size, with public import surfaces preserved. Frontend components are similarly split into smaller, focused files, delegating rendering to sub-components while retaining top-level state management.

## Key Technical Implementations
- **Document Management**: Enhanced delivery reconciliation and `supplier_scan_key` for Purchase Orders. Professional A4-portrait optimized documents with company branding.
- **Financial Features**: Multi-currency support with `fxRateToAed` and derived PO payment statuses.
- **API Robustness**: Server-side recycle-bin, robust invoice validation, and strict server-side numeric validation for Purchase Orders.
- **Data Integrity & Security**: Comprehensive backup/restore and factory reset with multi-layered protection. Audit logging (both synchronous for critical actions and asynchronous with retries for CRUD) is exclusively server-side. CSRF protection is implemented for all state-changing API routes using the double-submit cookie pattern.
- **Post-Restore Schema Reconcile (Task #441)**: After every successful cloud or upload restore, the server automatically runs drizzle-kit's `pushSchema()` programmatically (`server/schemaReconcile.ts`) under the same destructive-DB lock to forward-port the just-restored data structure to whatever the running code expects. Additive changes (new columns/tables) are applied silently; data-loss changes (drops/renames) are skipped by default and surfaced as "completed with warnings" — admins can opt-in via an `acceptDataLoss` checkbox at restore time, or hit `POST /api/ops/restore-runs/:id/force-reconcile` (typed `I ACCEPT DATA LOSS` consent, only allowed on rows in `warnings_skipped`/`failed` state) afterwards. Outcome is persisted on `ops.restore_runs.reconcile_*` columns (added at boot via `server/ensureSchema.ts`, since `drizzle.config.ts` only covers the `public` schema and is forbidden to edit) and shown in the restore history UI. The restore endpoint returns `restoreRunId` so the Force Reconciliation button targets that exact row. Cross-upgrade restores no longer require a manual `npm run db:push`. **Operational note:** `drizzle-kit` lives in devDependencies; the Replit autoscale deployment (`build = npm run build`, `run = npm run start`) keeps `node_modules` intact so the dynamic `import("drizzle-kit/api")` resolves at runtime in production. If a future deploy strategy prunes dev deps, reconcile would degrade gracefully to `failed` (restore data is unaffected).
- **Goods Receipt (GRN) Management**: Detailed tracking, payment status, and an audit-preserving cancellation workflow. Supports closing POs without GRN insertion for all-zero item payloads under specific conditions.
- **Cancellation Workflows**: All-or-nothing cancellation for Invoices and Delivery Orders ensures full stock reversal.
- **Quotation Status Enforcement**: Strict one-way status machine with transition validation.
- **Invoice Stock Reconciliation**: Accurate inventory levels are maintained through reconciliation on invoice edits.
- **Structured Logging**: A server-side logger provides JSON-formatted logs in production and human-readable output in development, mirroring `console.*` methods.
- **TypeScript Configuration**: `tsconfig.json` supports top-level `await` for synchronous environment variable validation in server entry points.

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

## Platform Integration
- **Base44 SDK**: Business operations platform (shimmed for demo mode).