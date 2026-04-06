# FLOW — Business Operations Platform

FLOW is a full-stack web application for UAE-based companies, built for **Aroma Essence Trading LLC**. It handles AED currency and 5% VAT throughout all documents and reports.

## Modules

- **Purchase Orders (POs)** — create, send, and track supplier purchase orders with GRN reconciliation
- **Goods Receipts (GRNs)** — record and reconcile received stock against open POs
- **Sales Quotations** — draft, send, and convert quotations to invoices
- **Invoices** — create and manage customer invoices with full lifecycle tracking
- **Delivery Orders (DOs)** — manage outbound customer deliveries
- **Inventory** — real-time stock levels, low-stock alerts, and stock-count workflows
- **Customers & Suppliers** — contact and transaction management
- **Reports** — inventory, financial, and operational reports with export to PDF/XLSX

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript, Vite, shadcn/ui, Tailwind CSS, TanStack Query |
| Backend | Express.js + TypeScript |
| Database | PostgreSQL via Drizzle ORM (Neon serverless) |
| Auth | Session-based with PostgreSQL session store |

## Development

```bash
# Install dependencies
npm install

# Start dev server (frontend + backend on port 5000)
npm run dev

# Push schema changes to DB
npm run db:generate   # create migration file
npm run db:migrate    # apply pending migrations
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ADMIN_USERNAME` | Username for the auto-created admin user |
| `ADMIN_PASSWORD` | Password for the auto-created admin user |
| `SESSION_SECRET` | Secret key for signing session cookies |
| `SESSION_MAX_AGE` | Session timeout in milliseconds (default: 8 hours) |
| `NODE_ENV` | `production` enables secure cookies and CSP headers |

## Currency & Tax

All monetary values are stored and displayed in **AED**. VAT is fixed at **5%**. The standard display format is `AED 1,234.56` (currency code first).
