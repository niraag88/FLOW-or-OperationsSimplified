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