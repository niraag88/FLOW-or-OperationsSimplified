# Overview

This project is a full-stack web application, FLOW, designed as a comprehensive business operations platform for UAE-based companies, handling AED currency and 5% VAT. It features a modern user interface built with React, shadcn/ui, and Tailwind CSS, backed by an Express.js server and a PostgreSQL database using Drizzle ORM. The platform aims to streamline operations such as product management, customer relations, supplier interactions, purchasing (POs), sales (Quotations, Invoices, Delivery Orders), and inventory management.

The platform's ambition is to provide a robust, scalable, and user-friendly solution for managing core business processes, improving efficiency, and providing clear financial oversight for businesses operating in the UAE.

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
The frontend is built with React and TypeScript, using Vite for fast development and bundling. UI components leverage shadcn/ui and Radix UI primitives, styled with Tailwind CSS. React Router handles client-side navigation, while TanStack Query manages server state, and React Hook Form with Zod is used for form handling and validation.

## Backend Architecture
The backend is an Express.js application written in TypeScript. It interacts with a PostgreSQL database via Drizzle ORM for type-safe operations. Session management uses PostgreSQL-based storage. The server is bundled with ESBuild for production.

### Route Modularization (Task #178)
`server/routes.ts` was refactored from a monolithic 5000-line file into a thin orchestrator that delegates to domain modules under `server/routes/`:
- `auth.ts` — login, logout, session, user management
- `products.ts` — products, brands, bulk import/export
- `suppliers.ts` — suppliers, customers
- `purchase-orders.ts` — POs, PO items, payment, scan keys
- `quotations.ts` — quotations and items
- `invoices.ts` — invoices, line items, scan keys, payment
- `delivery-orders.ts` — DOs, line items, scan keys
- `goods-receipts.ts` — GRNs, stock counts
- `inventory.ts` — dashboard, stock movements, exports (invoice/DO/PO/quotation PDF)
- `settings.ts` — company settings, retention settings
- `system.ts` — health check, storage (upload/download), audit logs, recycle bin, backups, financial years (books)

## Database Layer
PostgreSQL is the chosen database, managed by Drizzle ORM. Schema definitions are centralized in `/shared/schema.ts`. Versioned Drizzle migrations are used for schema evolution, with an automated post-merge script ensuring `npm install && npm run db:migrate` runs on every task merge. The connection utilizes Neon Database for serverless PostgreSQL.

### Migration Infrastructure (Task #89)
- **Versioned migrations adopted**: `migrations/0000_baseline.sql` created from full current schema. `drizzle.__drizzle_migrations` table seeded — baseline marked applied, live data untouched.
- **Scripts**: `npm run db:generate` (create migration file), `npm run db:migrate` (apply pending migrations). **`db:push` hangs in this project — do not use it.**
- **Post-merge automation**: `scripts/post-merge.sh` runs `npm install && npm run db:migrate` on every task merge.
- **Workflow for schema changes**: Edit `shared/schema.ts` → `npm run db:generate` → commit the SQL file → `npm run db:migrate`.

### Data Provenance Convention (Task #171)
A `data_source` text column (default `'user'`) is present on four entity tables: `products`, `customers`, `suppliers`, `brands`.

| Value | Meaning | Set by |
|-------|---------|--------|
| `user` | Real data entered via the app UI | Column default — set automatically |
| `seed` | Demo/population data from seed scripts | `seed-foundation.ts`, `populate-customers-api.ts` |
| `e2e_test` | Temporary Playwright test data | E2E spec `beforeAll` hooks |

**Cleanup script** (always check `--dry-run` first):
```bash
npx tsx scripts/delete-dummy-data.ts --dry-run   # preview only
npx tsx scripts/delete-dummy-data.ts              # live delete
```
The script deletes in child-before-parent order and never touches `data_source = 'user'` records.

**Rule**: seed scripts must include `dataSource: 'seed'` in POST bodies; E2E `beforeAll` hooks must include `dataSource: 'e2e_test'`. The app UI never needs to set this field.

## Authentication & Authorization
The system employs session-based authentication with a PostgreSQL session store. User management is standard username/password. A demo mode is available via the Base44 SDK shim for UI-only operation.

## Project Structure
The project follows a monorepo layout with separate directories for client, server, and shared code. TypeScript path aliases are configured for clean imports.

## Document Format Standards
- **Internal Documents**: Used for inventory reports, PO listings, etc., featuring a simple bordered data table, header, and footer with generation timestamp. Export functionality is provided via `ExportDropdown`.
- **External Documents**: Used for customer-facing documents like Purchase Orders, Quotations, Invoices, and Delivery Orders. These feature a professional header with company branding, formal titles, detailed line items, and are optimized for A4 portrait printing. `POTemplate` pattern is used for rendering.

## Key Features & Implementations
- **Purchase Order Enhancements**: Added `supplier_scan_key` for attaching supplier invoices, new API routes for scan key management, and UI actions. POs display icons for attached invoices and short delivery. Delivery reconciliation panels appear for closed POs, and received quantities are tracked.
- **Product & PO Currency Management**: `cost_price_currency` added to products. `purchase_orders` now include `currency` and `fxRateToAed` fields. PO currency defaults to the first selected product's `costPriceCurrency`.
- **API Improvements**: `POST /api/recycle-bin` endpoint added with server-side `deleted_by` and `deleted_date` derivation. Invoice creation now validates `customer_id`.
- **E2E Test Suite**: Comprehensive Playwright test suite covering authentication, CRUD operations, lifecycle flows (PO, Invoice, DO), stock counts, dashboard summaries, performance, and security.
- **DO Bug Fixes (comprehensive review)**: Fixed 8 issues across all DO files: customer dropdown now shows `c.name` (was using wrong field `c.customer_name`); "Create from Existing" now correctly maps quotation item fields (camelCase→snake_case) and includes brandId; `show_remarks` column added to `delivery_orders` table and is now persisted, returned, and respected by DOPrintView; `isEditable` in DOForm now tracks live form status; Edit action hidden for delivered/cancelled DOs; dead imports/state/code removed from DeliveryOrders.jsx.

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
- **ESBuild**: Fast JavaScript bundler for production.
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
- **tsx**: TypeScript execution for development.

## Platform Integration
- **Base44 SDK**: Business operations platform (shimmed for demo mode).