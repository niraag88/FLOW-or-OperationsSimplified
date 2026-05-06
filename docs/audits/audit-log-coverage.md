# Audit Log Coverage Matrix — Task #430

Generated: 2026-05-06.

Scope: every server-side write / state-change / destructive endpoint must call
`writeAuditLog` (async, with retry spool) or `writeAuditLogSync` (in-tx, for
critical actions) with `actor`, `actorName`, `targetType`, `targetId`,
`action`, and human-readable `details`. GET/read endpoints must not log.

The audit_log `action` column is plain text (not an enum), so it accepts
both the legacy values used by pre-existing calls
(`CREATE | UPDATE | DELETE | UPLOAD | REMOVE_FILE | DEACTIVATE | FACTORY_RESET`)
and the new `<entity>.<verb>` strings that this task introduces for newly
added or touched audit calls. Pre-existing calls keep their legacy verbs to
avoid invalidating historical filters/exports; new calls use dot-notation
directly in `action` (e.g. `goods_receipt.scan_attached`,
`purchase_order.scan_attached`, `storage_object.deleted`). The "Verb" column
below names what is actually written to the `action` column today.

Legend:
- ✅ logged — endpoint writes an audit row.
- ✅ tx — endpoint writes a synchronous in-tx audit row (writeAuditLogSync) so
  audit lives or dies with the business write.
- ⛔ N/A — read-only, pre-stage (token mint), or otherwise not a state change.
- ⚠️ optional — intentional non-coverage decision recorded below.

**Column key:** `targetType` and `action` are the literal values written to
the `audit_log` table by the route handler — verified against the source
files via `rg "writeAuditLog\|writeAuditLogSync" server/routes/`. The
"Logical event" column is a human-readable name for cross-referencing this
matrix; it is not stored anywhere.

## Core entities

| Route | Method | targetType | action (literal) | Logical event | sync/async | Logged | Notes |
|---|---|---|---|---|---|---|---|
| /api/brands | POST | brand | CREATE | brand.created | async | ✅ | |
| /api/brands/:id | PUT | brand | UPDATE | brand.updated | async | ✅ | |
| /api/brands/:id | DELETE | brand | DELETE | brand.deleted | async | ✅ | recycle-bin send |
| /api/customers | POST | customer | CREATE | customer.created | async | ✅ | |
| /api/customers/:id | PUT | customer | UPDATE | customer.updated | async | ✅ | |
| /api/customers/:id | DELETE | customer | DELETE | customer.deleted | async | ✅ | recycle-bin send |
| /api/suppliers | POST | supplier | CREATE | supplier.created | async | ✅ | |
| /api/suppliers/:id | PUT | supplier | UPDATE | supplier.updated | async | ✅ | |
| /api/suppliers/:id | DELETE | supplier | DELETE | supplier.deleted | async | ✅ | recycle-bin send |
| /api/products | POST | product | CREATE | product.created | async | ✅ | |
| /api/products/:id | PUT | product | UPDATE | product.updated | async | ✅ | |
| /api/products/:id | DELETE | product | DELETE | product.deleted | async | ✅ | |
| /api/products/bulk | POST | product | CREATE | product.bulk_created | async | ✅ | |
| /api/products/:id/adjust-stock | POST | product | UPDATE | product.stock_adjusted | async | ✅ | |
| /api/stock-movements | POST | stock_movement | CREATE | stock_movement.created | async | ✅ | |
| /api/stock-movements/bulk | POST | stock_movement | CREATE | stock_movement.bulk_created | async | ✅ | |

## Sales documents

| Route | Method | targetType | action (literal) | Logical event | sync/async | Logged | Notes |
|---|---|---|---|---|---|---|---|
| /api/quotations | POST | quotation | CREATE | quotation.created | async | ✅ | |
| /api/quotations/:id | PUT | quotation | UPDATE | quotation.updated | async | ✅ | |
| /api/quotations/:id | DELETE | quotation | DELETE | quotation.deleted | async | ✅ | |
| /api/quotations/:id/convert-to-invoice | POST | quotation | UPDATE | quotation.converted | async | ✅ | |
| /api/invoices | POST | invoice | CREATE | invoice.created | async | ✅ | |
| /api/invoices/from-quotation | POST | invoice | CREATE | invoice.created_from_quote | async | ✅ | |
| /api/invoices/:id | PUT | invoice | UPDATE | invoice.updated | async | ✅ | reconciles stock |
| /api/invoices/:id/payment | PATCH | invoice | UPDATE | invoice.payment_recorded | async | ✅ | |
| /api/invoices/process-sale | POST | invoice | UPDATE | invoice.sale_processed | async | ✅ | |
| /api/invoices/:id/cancel | PATCH | invoice | UPDATE | invoice.cancelled | sync (tx) | ✅ tx | reverses stock |
| /api/invoices/:id | DELETE | invoice | DELETE | invoice.deleted | async | ✅ | |
| /api/invoices/:id/scan-key | PATCH | invoice | UPLOAD | invoice.scan_attached | async | ✅ | |
| /api/invoices/:id/scan-key/:slot | DELETE | invoice | REMOVE_FILE | invoice.scan_removed | async | ✅ | |
| /api/delivery-orders | POST | delivery_order | CREATE | delivery_order.created | sync (tx) | ✅ tx | in-tx insert into auditLog |
| /api/delivery-orders/:id | PUT | delivery_order | UPDATE | delivery_order.updated | async | ✅ | |
| /api/delivery-orders/:id/cancel | PATCH | delivery_order | UPDATE | delivery_order.cancelled | sync (tx) | ✅ tx | reverses stock |
| /api/delivery-orders/:id | DELETE | delivery_order | DELETE | delivery_order.deleted | async | ✅ | |
| /api/delivery-orders/:id/scan-key | PATCH | delivery_order | UPLOAD | delivery_order.scan_attached | async | ✅ | |
| /api/delivery-orders/:id/scan-key/:slot | DELETE | delivery_order | REMOVE_FILE | delivery_order.scan_removed | async | ✅ | |

## Purchasing & receiving

| Route | Method | targetType | action (literal) | Logical event | sync/async | Logged | Notes |
|---|---|---|---|---|---|---|---|
| /api/purchase-orders | POST | purchase_order | CREATE | po.created | async | ✅ | via create-update.ts |
| /api/purchase-orders/:id | PUT | purchase_order | UPDATE | po.updated | async | ✅ | |
| /api/purchase-orders/:id/status | PATCH | purchase_order | UPDATE | po.status_changed | async | ✅ | |
| /api/purchase-orders/:id | DELETE | purchase_order | DELETE | po.deleted | async | ✅ | |
| /api/purchase-orders/:id/scan-key | PATCH | purchase_order | purchase_order.scan_attached | po.scan_attached | async | ✅ | dot-verb (added in #430) |
| /api/purchase-orders/:id/scan-key | DELETE | purchase_order | purchase_order.scan_removed | po.scan_removed | async | ✅ | normalized to dot-verb (touched in #430) |
| /api/goods-receipts | POST | goods_receipt | CREATE | grn.created | async | ✅ | mutations.ts |
| /api/goods-receipts/:id/reference | PATCH | goods_receipt | UPDATE | grn.reference_updated | async | ✅ | |
| /api/goods-receipts/:id/payment | PATCH | goods_receipt | UPDATE | grn.payment_recorded | async | ✅ | |
| /api/goods-receipts/:id/cancel | PATCH | goods_receipt | CANCEL | grn.cancelled | sync (tx) | ✅ tx | reverses stock |
| /api/goods-receipts/:id | DELETE | — | — | grn.delete_blocked | n/a | ⛔ | always 400 (append-only); no state change |
| /api/goods-receipts/:id/scan-key | PATCH | goods_receipt | goods_receipt.scan_attached | grn.scan_attached | async | ✅ | dot-verb (added in #430) |
| /api/goods-receipts/:id/scan-key/:slot | DELETE | goods_receipt | goods_receipt.scan_removed | grn.scan_removed | async | ✅ | dot-verb (added in #430) |
| /api/stock-counts | POST | stock_count | CREATE | stock_count.created | async | ✅ | |
| /api/stock-counts/:id | DELETE | stock_count | DELETE | stock_count.deleted | async | ✅ | |

## Settings, users, books

| Route | Method | targetType | action (literal) | Logical event | sync/async | Logged | Notes |
|---|---|---|---|---|---|---|---|
| /api/settings | PUT | settings | UPDATE | settings.updated | async | ✅ | |
| /api/settings/retention | PUT | settings | UPDATE | settings.retention_updated | async | ✅ | |
| /api/settings/retention-purge | POST | recycle_bin | DELETE | recycle_bin.purged | async | ✅ | |
| /api/users | POST | user | CREATE | user.created | async | ✅ | |
| /api/users/:id | PUT | user | UPDATE | user.updated | async | ✅ | |
| /api/users/:id | DELETE | user | DEACTIVATE | user.deleted | sync (tx) | ✅ tx | destructive |
| /api/users/:id/password | PUT | user | UPDATE | user.password_changed | async | ✅ | |
| /api/financial-years | POST | financial_year | CREATE | financial_year.created | async | ✅ | |
| /api/financial-years/:id | PATCH | financial_year | UPDATE | financial_year.updated | async | ✅ | |
| /api/books | POST | book | CREATE | book.created | async | ✅ | |
| /api/books/:id | PUT | book | UPDATE | book.updated | async | ✅ | |

## System / ops

| Route | Method | targetType | action (literal) | Logical event | sync/async | Logged | Notes |
|---|---|---|---|---|---|---|---|
| /api/recycle-bin/restore | POST | recycle_bin | UPDATE | recycle_bin.restored | async | ✅ | Admin/Manager |
| /api/recycle-bin/permanent-delete | POST | recycle_bin | DELETE | recycle_bin.permanently_deleted | sync (tx) | ✅ tx | destructive |
| /api/ops/factory-reset | POST | system | FACTORY_RESET | system.factory_reset | sync (raw SQL) | ✅ tx | written inside `executeFactoryReset` (server/factoryReset.ts) |
| /api/ops/run-backups | POST | system | UPDATE | system.backup_ran | async | ✅ | written inside `runBackup` |
| /api/ops/backup-schedule | PUT | system | UPDATE | system.backup_schedule_updated | async | ✅ | |
| /api/ops/backup-runs/:id/restore | POST | system | UPDATE | system.restore_ran | async + ops.restore_runs row | ✅ | best-effort audit_log + always-on ops.restore_runs |
| /api/ops/restore-upload | POST | system | UPDATE | system.restore_ran | async + ops.restore_runs row | ✅ | same path as above |
| /api/storage/object | DELETE | storage_object | storage_object.deleted | storage.object_deleted | async | ✅ | **added in #430** |

## Pre-stage / token-bound (not audited — by design)

| Route | Method | Why no audit |
|---|---|---|
| /api/storage/sign-upload | POST | Mints a 10-minute upload token; does not write any business object. The eventual scan attach is audited on the entity scan-key route. |
| /api/storage/upload/:token | PUT | Token-bound upload of bytes to object storage; no actor session and no business state change. The attach is audited when the entity scan-key PATCH is called. |
| /api/storage/upload-scan | POST | Same pattern: writes bytes to object storage under a doc-bound or anonymous-staging key. Attach is audited at entity scan-key. |
| /api/storage/signed-get | GET | Mints a 1h download token; read-only. |
| /api/storage/download/:token | GET | Streams bytes; read-only. |

## Auth (intentional optional non-coverage)

| Route | Method | Verb | Logged | Notes |
|---|---|---|---|---|
| /api/auth/login | POST | session.login | ⚠️ optional | Not audited. Task #430 brief says "meaningful business actions"; session lifecycle is intentionally out of scope and would dwarf the audit log on every page load. Flag for future task if SOC2-style session auditing is required. |
| /api/auth/logout | POST | session.logout | ⚠️ optional | Same rationale. |

## All GET endpoints — verified non-logging

`rg writeAuditLog server/routes/**/*.ts | rg "router\.get\|app\.get"` returns
zero hits. Manually re-verified the read-heavy modules: audit-recycle.ts
(`GET /api/audit-logs`, `/api/recycle-bin`, `/api/recycle-bin/counts`),
storage-downloads.ts, exports.ts, dashboards/lists in invoices/quotations/POs.
None call writeAuditLog.

## Test endpoints (skipped)

`/api/__test__/*` (audit-fault injection toggle, dev-only) — out of scope.

## Changes made in Task #430

1. `server/routes/goods-receipts/scan-key.ts` — added audit rows on PATCH
   and DELETE with dot-notation actions `goods_receipt.scan_attached` and
   `goods_receipt.scan_removed` (parity with PO/invoice/DO scan-key).
2. `server/routes/system/storage-downloads.ts` — added audit row on
   `DELETE /api/storage/object` with action `storage_object.deleted`
   (Admin-only direct storage deletion was previously unaudited; this is a
   destructive action affecting backups, restore artefacts, and document
   scans).
3. `server/routes/purchase-orders/scan-key.ts` — added audit row on PATCH
   with action `purchase_order.scan_attached` (PATCH was previously
   unaudited) and normalized the corresponding DELETE row from legacy
   `REMOVE_FILE` to `purchase_order.scan_removed` so both halves of the
   PO scan-key lifecycle now share the same `<entity>.<verb>` scheme.
4. `client/src/components/user-management/AuditLogTable.tsx` — extended
   `KNOWN_ACTIONS` and `ACTION_COLORS` with the four new dot-notation
   verbs and the previously-missing legacy `DEACTIVATE` / `FACTORY_RESET`
   so the Audit Log filter dropdown and badges render them correctly.

## Smoke test

Run live against `npm run dev` (admin login + `/api/auth/csrf-token` for the
double-submit header). Results captured 2026-05-06 by querying `audit_log`
ordered by `timestamp desc` after each call.

| # | Endpoint | HTTP | New audit_log row | Result |
|---|---|---|---|---|
| 1 | PATCH `/api/goods-receipts/470/scan-key` body `{scanKey,slot:3}` | 200 | `target_type=goods_receipt`, `action=goods_receipt.scan_attached`, details `"Scan attached to GRN #GRN-SMOKE-430 (slot 3)"` | ✅ |
| 2 | DELETE `/api/goods-receipts/470/scan-key/3` | 200 | `target_type=goods_receipt`, `action=goods_receipt.scan_removed`, details `"Scan removed from GRN #GRN-SMOKE-430 (slot 3)"` | ✅ |
| 3 | PATCH `/api/purchase-orders/1187/scan-key` body `{scanKey:"purchase-orders/2026/PO-SMOKE-430.pdf"}` | 200 | `target_type=purchase_order`, `action=purchase_order.scan_attached`, details `"Supplier scan attached to Purchase Order #PO-SMOKE-430"` | ✅ |
| 4 | POST `/api/storage/upload-scan` (real PNG to `goods-receipts/2026/GRN-SMOKE-430-doc1/<ts>-marker.png`) then DELETE `/api/storage/object?key=…` | 200 + 200 | `target_type=storage_object`, `action=storage_object.deleted`, details `"Storage object deleted: goods-receipts/2026/GRN-SMOKE-430-doc1/<ts>-marker.png"` | ✅ |
| 5 | Pre-existing CRUD writes (PO/supplier inserts during seed) | 200 | `target_type=purchase_order`, `action=CREATE` rows for PO-4..PO-6 visible in `audit_log` | ✅ regression check |

CSRF auth flow confirmed working end-to-end: `POST /api/auth/login` → 200,
`GET /api/auth/csrf-token` → 193-char token, mutating requests with
`x-csrf-token` header → 200/expected status. Earlier CSRF 403s were due to
hitting the wrong endpoint name.

The two new dot-notation verbs (`goods_receipt.scan_attached`,
`goods_receipt.scan_removed`) appear in the live `audit_log` table and are
also registered in the client-side `KNOWN_ACTIONS` / `ACTION_COLORS` maps in
`AuditLogTable.tsx`, so the Audit Log UI's filter dropdown and badge styling
render them without falling through to the unknown-action fallback.
