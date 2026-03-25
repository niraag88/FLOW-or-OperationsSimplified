# Overview

This is a full-stack web application built with a React frontend and Express.js backend, designed as FLOW - a UAE business operations platform (AED currency, 5% VAT). The application features a modern UI built with shadcn/ui components and Tailwind CSS, with PostgreSQL database integration using Drizzle ORM.

## Migration Infrastructure (Task #89)
- **Versioned migrations adopted**: `migrations/0000_baseline.sql` created from full current schema. `drizzle.__drizzle_migrations` table seeded — baseline marked applied, live data untouched.
- **New scripts**: `npm run db:generate` (create migration file), `npm run db:migrate` (apply). `db:push` kept for reference.
- **Post-merge automation**: `scripts/post-merge.sh` registered — runs `npm install && npm run db:migrate` on every future task merge.
- **Workflow for future schema changes**: Edit `shared/schema.ts` → `npm run db:generate` → commit the SQL file → `npm run db:migrate`.

## Schema Changes (Task #83)
- **purchase_orders** table: Added `supplier_scan_key` (text) column via direct SQL. Schema updated in `shared/schema.ts` with `supplierScanKey` field. `getPurchaseOrders()` in `server/businessStorage.ts` now includes this field in explicit SELECT.
- **API routes**: Added `PATCH /api/purchase-orders/:id/scan-key` and `DELETE /api/purchase-orders/:id/scan-key` routes for attaching/removing supplier invoice documents.
- **POActionsDropdown.jsx**: Added "Attach Supplier Invoice", "View Supplier Invoice", "Remove Supplier Invoice" actions. Upload uses `UploadFileDialog` with `maxSizeMB=2` (2 MB limit).
- **UploadFileDialog.jsx**: Parameterized `maxSizeMB` prop (default 25). Previously hardcoded to 25MB.
- **POList.jsx**: PO Number column now shows blue paperclip icon when supplier invoice is attached, and amber triangle icon when closed PO has short delivery (received < ordered). Uses `Tooltip` for both icons.
- **POForm.jsx**: When viewing a closed PO, a "Delivery Reconciliation" panel appears below totals showing Ordered / Received / Difference amounts per item. Panel is green for full delivery, amber for short delivery. Items now include `receivedQuantity` when loaded.
- **MarkPOPaidDialog.jsx**: Fetches PO items on open and shows a reconciliation summary (ordered vs reconciled payable amount) when the PO has GRN receipts. Shows "Short Delivery" warning when applicable.
- **GoodsReceiptsTab.jsx**: "Partial" badge (amber with ⚠ icon) now appears in the Received column for closed POs where received < ordered in both the render helper and the inline closed POs table.

## Schema Changes (Task #49)
- **products** table: Added `cost_price_currency` (text, default 'GBP') column via direct SQL. Schema updated in `shared/schema.ts` with `costPriceCurrency` field. `insertProductSchema` includes `costPriceCurrency`. `getProducts()` and `getProductById()` in `server/businessStorage.ts` include this field.
- **AddProduct.jsx** and **EditProduct.jsx**: Currency selector for purchase price now supports AED/GBP/USD/INR (all `SUPPORTED_CURRENCIES`). `costPriceCurrency` is saved to DB and loaded back when editing. Profitability check only runs when both prices share the same currency.
- **ProductsTab.jsx**: Cost price column now displays `formatCurrency(costPrice, costPriceCurrency)` instead of hardcoded `£`.
- **POForm.jsx**: When first product is selected on a new PO, the PO currency automatically defaults to that product's `costPriceCurrency`.

## Schema Changes (Task #46)
- **purchase_orders** table: Added `currency` (text, default 'GBP') and `fxRateToAed` (decimal 10,4, default 4.8500) columns via direct SQL (`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ...`). All 307+ existing POs default to GBP/4.85. Schema updated in `shared/schema.ts`. `getPurchaseOrders()` in `server/businessStorage.ts` now includes these fields in its explicit SELECT and joins `suppliers` table (not `brands`) for `supplierName`.

## Current Database State (as of Task #73)
- **Products**: 600 active products across all 12 categories (Essential Oils, Carrier Oils, Bath Salts, Body Butters, Massage Blends, Diffuser Blends, Roll-ons, Balms & Salves, Hydrosols, Supplements, Electronics, Stationery)
- **Customers**: 191 customers (hotels, spas, retail chains, corporate, export clients across UAE, Oman, Kuwait, KSA, Jordan, Qatar, Egypt and internationally); script in `scripts/populate-customers-api.ts`
- **Suppliers**: 80 suppliers (UK, India, USA, France, Germany, Australia, Italy, UAE-based)
- **Brands**: 31 brands
- **Users**: 15 users (1 Admin, 5 Managers, 9 Staff); password = Pass@1234
- **Purchase Orders**: 300 records [SEED-55 tagged]; **Quotations**: 300 [SEED-56 tagged: Draft=50, Sent=100, Converted=100, Expired=50]; **Invoices**: 400 [SEED-56: Draft=50, Submitted=200, Delivered=150 — 100 converted from quotations + 300 direct; statuses+references fixed Task #73]; **Delivery Orders**: 300 [SEED-56 tagged]
- **Valid invoice statuses**: `draft` | `submitted` | `delivered` (sent/paid/overdue are NOT valid)
- **Financial Years**: 2025 (Closed), 2026 (Open), 2027 (Open)
- **Company**: Aroma Essence Trading LLC, PO prefix "PO", DO prefix "DO"
- **Admin credentials**: Stored securely in ADMIN_PASSWORD env var — NEVER change the admin username or password

## Seed Scripts (DB Repopulation)
- `scripts/seed-foundation.ts` — 15 users, 31 brands, 80 suppliers, 600 products
- `scripts/seed-purchasing.ts` — financial years, company settings, 300 POs, 100+ GRNs
- `scripts/populate-customers-api.ts` — 180 customers via REST API (idempotent by name)
- `scripts/populate-sales-api.ts` — 300 quotations, 400 invoices (100 converted + 300 direct; Draft=50, Submitted=200, Delivered=150), 300 DOs [SEED-56 tagged for idempotency; API-only, no pg pool or execSync]

## Bug Fixes (Task #45)
- Fixed: Product deletion failed because `POST /api/recycle-bin` endpoint was missing — added in `server/routes.ts`
- Fixed: `POST /api/recycle-bin` now derives `deleted_by` and `deleted_date` server-side (from `req.user` and `new Date()`) — client-supplied values for these fields are ignored to prevent audit spoofing
- Fixed: One product had incorrect category "massage" → corrected to "Massage Blends"
- Fixed: `POST /api/invoices` now requires and validates `customer_id` — returns 400 on missing or invalid customer (BUG-004)
- Fixed: `purchase_orders.supplier_id` FK was incorrectly referencing `brands` table — migrated all 340 POs to use real supplier IDs, FK now correctly points to `suppliers` table (BUG-005)
- Fixed: Dev rate limiters were too strict for E2E runs — login limit raised to 200/15min, general API limit to 2000/min (production limits unchanged)

## E2E Test Suite (Task #45)
- **Location**: `tests/e2e/` — 8 spec files, 64 tests, all passing
- **Runner**: Playwright (`npx playwright test`) with system Chromium
- **Specs**: 01-auth (4), 02-products (12), 03-quotations (6), 04-purchase-orders (9), 05-invoices (10), 06-delivery-orders (5), 07-stock-count-and-reports (8), 08-ui-flows (10)
- **Covers**: Auth, products CRUD+edit+perf, quotation create/convert-to-invoice, PO lifecycle (draft→submitted→GRN receive→auto-close), invoice create/filters/validation/date-range, delivery orders, DO-from-invoice end-to-end, stock count create/load, dashboard summary, 50-line stress tests, SQL injection safety, performance benchmarks, browser UI flows (page loads, dialogs, page-level perf at full data scale)
- **Credentials**: Reads from `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD` env vars; falls back to dev defaults with a console warning
- **API Population Scripts**: `scripts/populate-customers-api.ts` (191 entries), `scripts/populate-sales-api.ts` — use authenticated POST endpoints (no direct SQL)

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
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Routing**: React Router v6 (react-router-dom) for client-side routing
- **State Management**: TanStack Query for server state management
- **Forms**: React Hook Form with Zod validation

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple
- **Development**: Hot module replacement via Vite middleware in development mode
- **Build System**: ESBuild for production server bundling

## Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Management**: Centralized schema definitions in `/shared/schema.ts`
- **Migrations**: Versioned Drizzle migrations in `/migrations/` (Task #89). Workflow:
  1. Edit `shared/schema.ts`
  2. `npm run db:generate` — creates a new numbered SQL file in `migrations/`
  3. Commit the SQL file alongside the code that depends on it
  4. `npm run db:migrate` — applies unapplied migrations to the database
- **Migration tracking**: Drizzle stores applied migrations in `drizzle.__drizzle_migrations` table
- **Baseline**: `migrations/0000_baseline.sql` captures the full schema as of Task #89 — already marked applied; do NOT run it against the DB
- **Post-merge automation**: `scripts/post-merge.sh` runs `npm install && npm run db:migrate` on every task merge, so schema changes are applied automatically
- **Legacy note**: Past tasks (46, 49, 83) used direct `ALTER TABLE` SQL for columns because `db:push` hung. Now use `db:generate` + `db:migrate` instead.
- **Connection**: Neon Database serverless PostgreSQL adapter
- **Storage Interface**: Abstract storage interface with in-memory implementation for development

## Authentication & Authorization
- **Session-based Authentication**: PostgreSQL session store integration
- **User Management**: User schema with username/password authentication
- **Demo Mode**: Base44 SDK shim for UI-only mode when running off-platform

## Project Structure
- **Monorepo Layout**: Client, server, and shared code in separate directories
- **Shared Types**: Common schemas and types in `/shared` directory
- **Path Aliases**: TypeScript path mapping for clean imports (@/, @shared/)
- **Asset Management**: Dedicated assets directory with Vite alias support

## Development Environment
- **Hot Reload**: Vite development server with HMR
- **Error Handling**: Runtime error overlay for development
- **Logging**: Structured request/response logging for API endpoints
- **TypeScript**: Strict type checking across the entire codebase

# Document Format Standards

## Internal Documents Format
- **Usage**: Inventory reports, Purchase Orders listing, internal reports, goods receipts listing
- **When to use**: When user says "internal document" or for listing/reporting multiple items
- **Implementation**: Uses ExportDropdown component's View & Print functionality (`client/src/components/common/ExportDropdown.jsx`)
- **Format Structure**:
  - Header: "Business Operations" + document type
  - Simple bordered data table with consistent styling
  - Footer with generation timestamp and record count
- **Styling**: Clean, minimal table format optimized for internal use
- **Example**: Export function on Purchase Orders page that lists all POs

## External Documents Format  
- **Usage**: Individual Purchase Orders, Quotations, Invoices, Delivery Orders (customer-facing documents)
- **When to use**: When user says "external document" or for individual professional documents
- **Implementation**: Uses POTemplate component pattern (`attached_assets/src/components/print/POTemplate.jsx`)
- **Format Structure**:
  - Professional header with company branding/logo
  - Formal document title (e.g., "PURCHASE ORDER", "INVOICE")
  - Company details and contact information section
  - Supplier/customer information in grid layout
  - Detailed line items table with totals
  - Professional styling with proper spacing and print optimization
- **Print Styles**: A4 portrait format with proper margins and print-specific CSS
- **Example**: Individual Purchase Order View & Print functionality

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting
- **Drizzle ORM**: Type-safe database toolkit and migration system

## UI & Styling
- **shadcn/ui**: Pre-built accessible React components
- **Radix UI**: Headless UI primitives for complex components
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide React**: Icon library for consistent iconography

## Development Tools
- **Vite**: Fast build tool and development server
- **ESBuild**: Fast JavaScript bundler for production
- **TypeScript**: Static type checking and enhanced IDE support
- **PostCSS**: CSS processing with Tailwind and Autoprefixer

## Frontend Libraries
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form handling and validation
- **Wouter**: Lightweight client-side routing
- **Zod**: Schema validation for forms and API data
- **date-fns**: Date manipulation utilities

## Backend Libraries
- **Express.js**: Web application framework
- **connect-pg-simple**: PostgreSQL session store
- **nanoid**: Unique ID generation
- **tsx**: TypeScript execution for development

## Platform Integration
- **Base44 SDK**: Business operations platform (shimmed for demo mode)
- **Replit Integration**: Development environment plugins and tools