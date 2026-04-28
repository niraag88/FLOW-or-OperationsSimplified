# Overview

This project is a full-stack web application, FLOW, designed as a comprehensive business operations platform for UAE-based companies, handling AED currency and 5% VAT. It provides a robust, scalable, and user-friendly solution for managing core business processes such as product management, customer relations, supplier interactions, purchasing (POs), sales (Quotations, Invoices, Delivery Orders), and inventory management. The platform aims to improve efficiency and provide clear financial oversight.

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
The frontend is built with React and TypeScript, utilizing Vite for development and bundling. UI components are developed using shadcn/ui and Radix UI primitives, styled with Tailwind CSS. Navigation is handled by React Router, server state by TanStack Query, and form management with React Hook Form and Zod.

## Backend Architecture
The backend is an Express.js application in TypeScript, interacting with a PostgreSQL database via Drizzle ORM. Session management uses PostgreSQL-based storage, and the server is bundled with ESBuild for production. Routes are modularized into domain-specific files (e.g., `auth.ts`, `products.ts`, `purchase-orders.ts`) for better organization and maintainability.

## Database Layer
PostgreSQL is the chosen database, managed by Drizzle ORM for type-safe operations. Schema definitions are centralized, and versioned Drizzle migrations are used for schema evolution, with an automated post-merge script ensuring migrations run. The connection utilizes Neon Database. A `data_source` column is used in key tables (`products`, `customers`, `suppliers`, `brands`) to track data provenance (user, seed, e2e_test).

## Authentication & Authorization
The system uses session-based authentication with a PostgreSQL session store. User management is standard username/password. A demo mode is available via the Base44 SDK shim.

## Project Structure
The project uses a monorepo layout with distinct directories for client, server, and shared code, employing TypeScript path aliases for clean imports.

## Document Format Standards
- **Internal Documents**: Simple bordered data tables with header, footer, and generation timestamp, primarily for reports.
- **External Documents**: Professional, A4-portrait optimized documents (POs, Quotations, Invoices, DOs) with company branding and detailed line items, using a `POTemplate` pattern.

## Key Features & Implementations
- **Enhanced Document Management**: Purchase Orders include `supplier_scan_key` for attaching invoices. Delivery reconciliation and tracking of received quantities for POs.
- **Financial Features**: Product `cost_price_currency` and PO `currency` with `fxRateToAed` fields, defaulting PO currency based on selected products.
- **API Improvements**: Server-side recycle-bin row creation runs inside each entity's DELETE transaction (e.g. `DELETE /api/products/:id`), and invoice creation validation is enforced server-side.
- **E2E Test Suite**: Comprehensive Playwright test suite covering core functionalities and system resilience.
- **Backup and Restore System**: Robust backup system with timestamped filenames, `backup_runs` table, and API endpoints for running, listing, and downloading backups. Full restore capability from stored backups or uploaded files, tracked in a `restore_runs` table, including factory reset functionality.
- **Goods Receipt Enhancements (GRN)**: `reference_number`, `reference_date`, `payment_status`, `payment_made_date`, `payment_remarks` added to `goods_receipts` table. APIs for managing and tracking GRN references and payments. Payments ledger restructured to GRN-level tracking.
- **GRN Cancellation Workflow (Audit-Preserving)**: Goods Receipts are append-only for audit, mirroring the policy used for cancelled invoices and cancelled delivery orders. `DELETE /api/goods-receipts/:id` is now refused in **both** states: confirmed GRNs return 400 `grn_not_cancelled` ("cancel first to reverse stock"), and cancelled GRNs return 400 `grn_retained_for_audit` ("retained for audit, cannot be permanently deleted"). The endpoint never deletes `goods_receipts`, `goods_receipt_items`, or `stock_movements` rows. The `PATCH /api/goods-receipts/:id/cancel` endpoint posts compensating reversal stock movements (`movement_type='goods_receipt_reversal'`) via `updateProductStock`, preserving the original `goods_receipt` movement rows for audit. Cancellation also reverses `purchase_order_items.received_quantity` and recomputes PO status (closed/submitted) and PO `paymentStatus` (cancelled GRNs are excluded from the calculation). Two override flags handle edge cases: `confirmNegativeStock` (returns 409 `negative_stock` with a per-product preview if reversal would push stock below zero) and `acknowledgePaidGrn` (returns 409 `paid_grn_requires_ack` for GRNs already paid to the supplier — debit-note workflow recommended). All work is performed in a single transaction with `SELECT FOR UPDATE` on the GRN row, products, and PO items. `POST /api/goods-receipts` rejects payloads with no positive received quantities (`no_received_quantity`). The frontend `GoodsReceipts` page exposes status filter chips, a multi-step Cancel dialog (initial preview → paidAck → negativeStock-with-explicit-phrase branches), and a Cancel button gated to confirmed receipts; cancelled receipts have no UI delete affordance and remain visible with a cancelled badge.
- **PO Payment Status Derived from GRNs**: PO `paymentStatus` is now automatically derived from linked confirmed GRNs. Three states: `outstanding` (no GRNs paid), `partially_paid` (some GRNs paid), `paid` (all GRNs paid). The `PATCH /api/purchase-orders/:id/payment` endpoint returns 405. Status is recalculated when a GRN is created or its payment status is updated. Frontend removed "Mark as Paid" from PO actions; payment badge shows three colour-coded states (grey/orange/green).
- **Code Hygiene**: Streamlined codebase by removing duplicate files, legacy scripts, and unnecessary `db:push` command from `package.json`.
- **Delivery Order Cancellation Workflow**: Delivered DOs cannot be deleted directly (API returns 400 with clear message). `PATCH /api/delivery-orders/:id/cancel` sets status to `cancelled` and reverses stock movements. Cancelled DOs are **retained for audit and cannot be deleted** (DELETE returns 400 `"Cancelled orders cannot be deleted. The document is retained for audit purposes."`), mirroring the append-only policy used for cancelled invoices and goods receipts. Stock is deducted when a DO transitions to `delivered`, and reconciled when a delivered DO's quantities are edited. Frontend shows Cancel action (instead of Delete) for delivered DOs, with a cancelled status badge and filter option; cancelled DOs have no UI delete affordance.
- **All-or-Nothing Cancellation Contract (Invoices & Delivery Orders)**: Both `PATCH /api/invoices/:id/cancel` and `PATCH /api/delivery-orders/:id/cancel` reject any payload that contains a `productIdsToReverse` field (even an empty array) with `400 partial_stock_reversal_not_allowed` before any DB work — partial reversal is no longer reachable through the API. Cancelling a delivered invoice (`stockDeducted=true`) reverses the *full* stock effect: line items are aggregated by `productId`, one `updateProductStock` call per product with `movementType='invoice_cancellation'`. Cancelling a delivered DO sums the existing `stock_movements` rows (reference type `delivery_order`) by product and posts one compensating movement per product with `movementType='delivery_order_cancellation'`, naturally accounting for any mid-flight edits. All work runs in a single transaction with `SELECT ... FOR UPDATE` on the invoice/DO row, so two concurrent cancels can't double-reverse. Already-cancelled returns `409` on both endpoints; draft DOs still return `400` ("delete, don't cancel"). Frontend `CancelWithStockDialog` is a read-only preview ("Items that will be returned to stock") with a single "Confirm Full Cancellation" button — no checkboxes, no "keep" wording, no goodwill copy. Both action dropdowns send an empty body. Customers keeping items must be handled with a separate sale or write-off.
- **Quotation Status Enforcement**: `PUT /api/quotations/:id` enforces a one-way status machine. Terminal states (`cancelled`, `converted`) block all updates. Non-terminal transitions are validated against an explicit allowed-transitions map.
- **Invoice Stock Reconciliation on Edit**: Editing an already-delivered invoice (`stockDeducted=true`) now reconciles inventory inside a single transaction. Quantities are aggregated per `productId`; for each product the delta `oldQty - newQty` is applied via `updateProductStock` with `movementType='adjustment'` (positive returns stock, negative deducts more). Header-only edits leave inventory untouched. `PUT /api/invoices/:id` rejects `status='cancelled'` (must use `PATCH /api/invoices/:id/cancel`) and rejects reverting a delivered invoice back to `draft`/`submitted` with explicit 400 errors.
- **Server Route Reorganisation**: Customer routes moved to `server/routes/customers.ts`, brand routes to `server/routes/brands.ts`, and document export routes (`/api/export/*`) to `server/routes/exports.ts`. Each file has its own `registerXxxRoutes(app)` function registered in `server/routes.ts`.
- **Audit-Log & Recycle-Bin Write Hardening**: `POST /api/audit-logs` and `POST /api/recycle-bin` are no longer exposed (return JSON 404 from the `/api/*` catch-all). Audit log records are written server-side from action handlers via the internal `writeAuditLog()` helper; recycle-bin rows are written by each entity's DELETE handler. All backup/restore/factory-reset routes (`/api/ops/*`) and sensitive storage routes (`/api/storage/list-prefix`, `DELETE /api/storage/object`) are Admin-only with e2e proof in `tests/e2e/11-admin-route-gates.spec.ts` (401 anon, 403 Staff, 200 Admin for safe GETs; 401/403 only for destructive POSTs).

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Drizzle ORM**: Type-safe database toolkit for PostgreSQL.

## UI & Styling
- **shadcn/ui**: Pre-built accessible React components.
- **Radix UI**: Headless UI primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.

## Development Tools
- **Vite**: Fast build tool and development server.
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