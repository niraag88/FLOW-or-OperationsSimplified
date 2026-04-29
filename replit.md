# Overview
FLOW is a full-stack web platform for UAE companies, managing product, customer, supplier, purchasing, sales (Quotations, Invoices, Delivery Orders), and inventory with AED currency and 5% VAT support. It aims to boost operational efficiency, financial oversight, and provide a scalable, user-friendly experience.

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
PostgreSQL, hosted on Neon Database, is managed via Drizzle ORM for type-safe database interactions, with schema evolution handled through versioned Drizzle migrations.

## Authentication & Authorization
The system employs session-based authentication with a PostgreSQL session store and a standard username/password system, with a demo mode enabled via the Base44 SDK shim. Write routes carry an explicit role list for authentication, distinguishing between Admin/Manager and Staff roles for various operations.

## Project Structure
The project uses a monorepo structure, separating client, server, and shared code, with TypeScript path aliases for organized imports. Backend files are split into per-concern directories to improve maintainability and keep file sizes manageable.

## Document Format Standards
Internal documents use simple bordered data tables. External documents (POs, Quotations, Invoices, DOs) are professional, A4-portrait optimized with company branding, utilizing a `POTemplate` pattern.

## Key Features & Implementations
- **Enhanced Document Management**: Includes detailed delivery reconciliation and `supplier_scan_key` for Purchase Orders.
- **Financial Features**: Supports multi-currency handling with `fxRateToAed` and derived PO payment statuses.
- **API Improvements**: Server-side recycle-bin creation and robust invoice validation.
- **Backup and Restore System**: Provides scheduled backups, full restore capabilities, and factory reset functionality with multi-layered protection.
- **Goods Receipt (GRN) Management**: Detailed tracking, payment status, and an audit-preserving cancellation workflow.
- **Cancellation Workflows**: Implements all-or-nothing cancellation contracts for Invoices and Delivery Orders, ensuring full stock reversal for delivered items.
- **Quotation Status Enforcement**: Features a one-way status machine with strict transition validation.
- **Invoice Stock Reconciliation**: Ensures accurate stock levels through inventory reconciliation on invoice edits.
- **Security Hardening**: Audit-Log and Recycle-Bin writes are exclusively server-side, with Admin-only access to sensitive operations and storage routes.
- **Destructive Admin Actions Guard**: A generalized pattern requiring typed confirmation phrases for irreversible admin actions, applying advisory locks for destructive database operations.
- **Strict PO Numeric Validation**: All numeric fields on Purchase Order POST/PUT are strictly parsed and validated server-side.
- **CSRF Protection**: Every state-changing API route is protected by the `csrf-csrf` double-submit cookie pattern. The frontend is patched to automatically attach CSRF tokens to mutating requests.
- **Durable Audit Logging**: Sensitive admin actions utilize `writeAuditLogSync` which inserts within a transaction and rolls back on failure. Ordinary CRUD uses `writeAuditLog` with retries and a spooling mechanism for reliability during database outages.
- **TypeScript Configuration**: The `tsconfig.json` module and target settings are specifically configured to support top-level `await` in the server entry points, crucial for synchronous environment variable validation.
- **Backend File Layout (Task #380)**: Six previously-oversized backend files were split into per-concern directories so no `server/*.ts` file exceeds ~500 lines (hard cap 600). Public import surface is preserved verbatim — `server/routes.ts` and the 13 callers of `businessStorage` are unchanged. Each split target is a directory whose `index.ts` re-exports the original symbol so Node directory resolution keeps working:
  - `server/routes/system/` (re-exports `registerSystemRoutes`) — `health.ts`, `storage-uploads.ts`, `storage-downloads.ts`, `audit-recycle.ts`, `backups.ts`, `restore.ts`, `factory-reset.ts`, `books.ts`. `restore.ts` resolves `restoreBackup.js` via `../../../scripts/restoreBackup.js` (one extra `..` because the file moved a directory deeper).
  - `server/routes/invoices/` (re-exports `registerInvoiceRoutes`) — `list.ts`, `create.ts`, `update.ts`, `scan-key.ts`, `payment.ts`, `cancel-delete.ts`.
  - `server/routes/goods-receipts/` (re-exports `registerGoodsReceiptRoutes`) — `helpers.ts` (re-exports `NegativeStockEntry`, `GrnCancelNegativeStockError`, `PoReceivedQtyUnderflowError`, `OverReceiveError`, `recalculatePOPaymentStatus`), `stock-counts.ts`, `list.ts`, `scan-key.ts`, `cancel.ts`, `delete.ts`, `mutations.ts`.
  - `server/routes/delivery-orders/` (re-exports `registerDeliveryOrderRoutes`) — `list.ts`, `create.ts`, `update.ts`, `cancel.ts`, `scan-key.ts`, `delete.ts`.
  - `server/routes/purchase-orders/` (re-exports `registerPurchaseOrderRoutes`) — `list.ts`, `create-update.ts` (holds the local `stripClientTotals` helper), `delete.ts`, `detail.ts`, `scan-key.ts`, `status.ts`.
  - `server/businessStorage/` (re-exports the `businessStorage` singleton via `index.ts`) — composes per-domain modules `brands.ts`, `suppliers.ts`, `customers.ts`, `products.ts`, `purchase-orders.ts`, `quotations.ts`, `company-settings.ts`, `dashboard.ts`, `numbering.ts`, `stock-counts.ts`, `invoices.ts`, `delivery-orders.ts`. The `BusinessStorage` type is exported from the composer for type consumers. The original class was converted to a plain singleton and `this.X()` cross-method calls were rewritten as direct named-function imports (e.g. `numbering.ts` and `products.ts` import `getCompanySettings` / `updateCompanySettings`; `dashboard.ts` imports the read-side methods it composes; `quotations.ts::createInvoiceFromQuotation` calls the local `getQuotationWithItems` and `updateQuotation` directly). Adding a new business-storage method: add it to the appropriate per-domain file (or a new file) and append a namespace import to the spread in `server/businessStorage/index.ts`.
  - **Audit-log durability contract (Task #375) preserved**: every `writeAuditLogSync` call inside a `db.transaction(...)` was moved as a single intact unit — invoice cancel (`server/routes/invoices/cancel-delete.ts`), GRN cancel both itemless and reversal paths (`server/routes/goods-receipts/cancel.ts`), DO cancel (`server/routes/delivery-orders/cancel.ts`), and recycle-bin permanent delete (`server/routes/system/audit-recycle.ts`). Adding a new destructive route MUST keep the audit insert inside the same transaction.
- **Frontend File Layout (Task #381)**: Three previously-oversized client React components were split into per-concern sibling directories so no client file exceeds 500 lines (hard cap). Public import surface preserved verbatim — no caller imports were touched. Each top-level file remains the single owner of `useState`/`useEffect`/data-loading and delegates rendering to extracted sub-components via explicit props (no state lifted, no fetch URLs / query keys / request bodies changed):
  - `client/src/components/inventory/StockTab.tsx` (shell, 339 lines, default export `StockTab` preserved) + `client/src/components/inventory/stock/` — `types.ts` (`StockProduct`, `StockMovement`, `StockData`, `CompanySettings`), `filterUtils.ts` (`applyAdvancedStockFilters`, `applyAdvancedMovementFilters`, `paginateData`), `PaginationControls.tsx`, `StockSummaryCards.tsx`, `CurrentStockTab.tsx`, `MovementsTab.tsx` (movement-row helpers co-located here), `LowStockTab.tsx`, `OutOfStockTab.tsx`. The `useEffect` that fires `onStockSubTabChange` stays in the shell with its original dependency array.
  - `client/src/components/purchase-orders/GoodsReceiptsTab.tsx` (shell, 452 lines, default export `GoodsReceiptsTab` preserved) + `client/src/components/purchase-orders/grn/` — `types.ts` (`POItem`, `PORow`, `POStats`, `GoodsReceiptsTabProps`), `StatusBadges.tsx`, `POTable.tsx`, `useGrnDocs.ts` (document-attachment hook), `exportColumns.ts`, `filterUtils.ts`, `poActions.ts`, `OpenPOsSection.tsx`, `ClosedPOsSection.tsx`, `ReceiveDialog.tsx`, `CloseConfirmDialog.tsx`, `DeleteConfirmDialog.tsx`. **Critical re-export:** `GoodsReceiptsTab.tsx` keeps `export type { PORow } from "./grn/types";` because `client/src/pages/PurchaseOrders.tsx` imports `PORow` from this path.
  - `client/src/components/utils/export/` (replaces the deleted `client/src/components/utils/export.tsx`; resolves automatically via `index.ts`) — `shared.ts` (`downloadXLSX`, `fmtShort`), `generic.ts` (`exportToCsv`, `exportToXLSX`, `exportToPDF`), `quotation.ts`, `invoice.ts`, `delivery-order.ts`, `purchase-order-pdf.ts` (`exportPurchaseOrderToPDF`, jsPDF/autoTable usage left untouched per Task #01 ownership), `purchase-order-grn-print.ts` (`printPOGRNSummary`), `purchase-order-xlsx.ts` (`exportPODetailToXLSX`), `statement.ts`, `index.ts` re-exports all 10 public functions. All 14 `import { ... } from "../utils/export"` (or `@/components/utils/export`) call sites continue working without edits.

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