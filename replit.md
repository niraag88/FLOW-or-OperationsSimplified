# Overview

This is a full-stack web application built with a React frontend and Express.js backend, designed as FLOW - a business operations platform. The application features a modern UI built with shadcn/ui components and Tailwind CSS, with PostgreSQL database integration using Drizzle ORM. The project appears to be migrated from a Base44 platform export and includes both demo mode capabilities and real backend functionality.

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