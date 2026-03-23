# Overview

This is a full-stack web application built with a React frontend and Express.js backend, designed as FLOW - a UAE business operations platform (AED currency, 5% VAT). The application features a modern UI built with shadcn/ui components and Tailwind CSS, with PostgreSQL database integration using Drizzle ORM.

## Schema Changes (Task #46)
- **purchase_orders** table: Added `currency` (text, default 'GBP') and `fxRateToAed` (decimal 10,4, default 4.8500) columns via direct SQL (`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS ...`). All 307+ existing POs default to GBP/4.85. Schema updated in `shared/schema.ts`. `getPurchaseOrders()` in `server/businessStorage.ts` now includes these fields in its explicit SELECT and joins `suppliers` table (not `brands`) for `supplierName`.

## Current Database State (as of Task #45)
- **Products**: 545+ active products across all 12 categories (Essential Oils, Carrier Oils, Bath Salts, Body Butters, Massage Blends, Diffuser Blends, Roll-ons, Balms & Salves, Hydrosols, Supplements, Electronics, Stationery)
- **Customers**: 190 customers (hotels, spas, retail chains, corporate, export clients across UAE, Oman, Kuwait, KSA, Jordan, Qatar, Egypt and internationally)
- **Suppliers**: 77 suppliers (UK, India, USA, France, Germany, Australia, Italy, UAE-based)
- **Brands**: 26 brands (Absolute Aromas, Mystic Moments, Tisserand, Nikura + others)
- **Purchase Orders**: 307+ records; **Quotations**: 259+; **Invoices**: 511+; **Delivery Orders**: 202
- **Admin credentials**: Stored securely in ADMIN_PASSWORD env var — NEVER change the admin username or password

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
- **API Population Scripts**: `scripts/populate-customers-api.ts` (105 entries), `scripts/populate-suppliers-api.ts`, `scripts/populate-products-api.ts` — use authenticated POST endpoints (no direct SQL)

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
- **Migrations**: Drizzle Kit for database migrations stored in `/migrations`
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