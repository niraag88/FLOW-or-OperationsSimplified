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
- **API Improvements**: Added `POST /api/recycle-bin` with server-side metadata and invoice creation validation.
- **E2E Test Suite**: Comprehensive Playwright test suite covering core functionalities and system resilience.
- **Backup and Restore System**: Robust backup system with timestamped filenames, `backup_runs` table, and API endpoints for running, listing, and downloading backups. Full restore capability from stored backups or uploaded files, tracked in a `restore_runs` table, including factory reset functionality.
- **Goods Receipt Enhancements (GRN)**: `reference_number`, `reference_date`, `payment_status`, `payment_made_date`, `payment_remarks` added to `goods_receipts` table. APIs for managing and tracking GRN references and payments. Payments ledger restructured to GRN-level tracking.
- **Code Hygiene**: Streamlined codebase by removing duplicate files, legacy scripts, and unnecessary `db:push` command from `package.json`.

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