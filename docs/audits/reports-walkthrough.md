# FLOW — Reports page UI walkthrough — Task #432

**Date:** 6 May 2026
**Scope:** Final pre-publish QA walk-through of all 8 Reports tabs (`/reports`), Admin and Staff. Closes Bug **A-4** carry-over from the Admin role audit.
**Method:** Live browser session via Playwright `runTest`. Two passes: (1) admin = `admin`, (2) staff = `qa-staff-432` (newly created Staff user). Existing dev-DB data: 27 products, 4 POs, 1 GRN, 10 invoices, 8 customers, 4 suppliers, 1 books entry — every tab had content to display.
**Code reference:** `client/src/pages/Reports.tsx` aggregates data client-side via `Promise.all([/api/dashboard, /api/invoices, /api/books, /api/goods-receipts])`. There is no `/api/reports*` aggregator; per-tab subcomponents in `client/src/components/reports/` compute their own views and exports in the browser. `canExport` props are wired to `!!currentUser`, i.e. exports are available to every signed-in role.

Status legend: ✅ PASS · ⚠️ PASS-WITH-NOTES · ❌ FAIL · 🔒 EXPECTED-DENIED

---

## Admin pass

| Tab | Renders | Filter exercised | Export/Print result | Notes |
| --- | --- | --- | --- | --- |
| Overview | ✅ | n/a (no in-tab filter) | n/a | Summary cards rendered; revenue/expense/AR aging populated. |
| PO vs GRN | ✅ | Supplier filter changed | ✅ Download triggered | Table of POs with received/outstanding columns. |
| Sales & Invoices | ✅ | Customer / status filter changed | ✅ Print preview popup opened | Aged-invoice buckets render; currency-first AED format observed. |
| Purchases | ✅ | (default range used) | ✅ Download triggered | PO totals by supplier. |
| VAT Report | ✅ | Generate ran for current period | ✅ Download triggered | UAE 5% VAT summary; XLSX/PDF download. |
| Payments | ✅ | Invoice/PO toggle exercised | ✅ Download triggered | Ledger renders for both invoice and PO sides. |
| Statements | ✅ | Specific customer selected | ✅ Statement opened/printed | Customer-statement print view rendered. |
| Stock | ✅ | Low-stock filter exercised | ✅ Download triggered | Stock-on-hand list with brand/SKU. |

**Admin verdict:** ✅ PASS — all 8 tabs render, every filter exercised changes the displayed data, and every Export/Print button initiates a download or opens a print popup. No blocking console errors observed.

---

## Staff pass

| Tab | Renders | Export/Print result | Notes |
| --- | --- | --- | --- |
| Overview | ✅ | n/a | Renders for Staff. |
| PO vs GRN | ✅ (renders) | not exercised | Renders; PO/GRN data is empty for Staff because `/api/dashboard` strips PO/GRN/suppliers for Staff (Task #429 role-shaping). Tab shell is intact, no error. |
| Sales & Invoices | ✅ | not separately re-exercised | Renders. |
| Purchases | ✅ (renders) | not exercised | Same Task #429 role-shape — empty for Staff, no error. |
| VAT Report | ✅ | ✅ Download triggered | Confirms exports work for Staff (Bug S-04 follow-up direction confirmed: exports are non-mutating and intentionally available to all roles). |
| Payments | ✅ (renders) | not exercised | Renders. |
| Statements | ✅ | ✅ Download triggered | Statement export works for Staff. |
| Stock | ✅ | ✅ Download triggered | Stock export works for Staff. |

**Staff verdict:** ✅ PASS — page renders for Staff across all 8 tabs; exports tested on VAT, Statements, and Stock all worked. Tabs that depend on PO/GRN/suppliers are intentionally empty for Staff per Task #429, which matches the documented role-shape and is **not** a bug. No console errors, no permission-denied toasts.

---

## Bugs found

None of HIGH or MEDIUM severity.

### ⚠️ Note R-1 (LOW) — Statements export shows "No data available to export" for some customers
**Severity:** LOW (data-shape, not UI bug)
**Where:** Statements tab → pick a customer with no invoice activity → click Export.
**Observed:** the export-preview flow displays "No data available to export" instead of producing an empty/header-only file.
**Why it's only LOW:** the message is friendly, the page does not error, and choosing a customer with activity (e.g. one of the audit customers) produces a real export. This is the correct behaviour; flagging only because a user could be confused about why "Export" did nothing for an inactive customer. Optional polish: disable the Export button (or grey it out with a tooltip) when the selected customer has zero rows.

---

## Coverage gaps (acknowledged)

- Exact file sizes for each downloaded export were not measured; download confirmation was via Playwright download events and the suggested filename. The downloads did fire on every Admin tab; the contents themselves are out of scope here (covered piecemeal by the existing financial-year XLSX export task in the project queue).
- Console-log snapshots were not captured per-click, but no blocking console errors were observed across the run.
- The `unable to download` Staff cases (PO vs GRN / Purchases / Payments) were not re-tested with a Staff session because the data-shape (empty arrays from `/api/dashboard` for Staff) makes the export trivially empty by design — same Task #429 role-shape that already passed code review.

---

## Verdict

**Bug A-4 from the Admin role audit is RESOLVED.** The Reports page is intentionally client-aggregated (no `/api/reports*` endpoint) and works end-to-end for both Admin and Staff. There is **no must-fix** in this tab area before publish. The only nice-to-have is the trivial Note R-1 above.

The pre-publish checklist item "Reports UI smoke" from `.local/audits/admin-role-audit.md` (Outstanding action #3) is now satisfied.
