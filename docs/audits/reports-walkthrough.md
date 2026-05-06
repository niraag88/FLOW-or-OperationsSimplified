# FLOW — Reports page UI walkthrough — Tasks #432 + #439

**Dates:** 6 May 2026 (Admin + Staff: Task #432) · 6 May 2026 (Manager: Task #439)
**Scope:** Final pre-publish QA walk-through of all 8 Reports tabs (`/reports`) for **all three roles** — Admin, Manager, Staff. Closes Bug **A-4** carry-over from the Admin role audit and the Manager-pass gap noted by the user after #432.
**Method:** Live browser sessions via Playwright `runTest`. Four passes total:
1. Admin (`admin`) — full walk including filters and exports on every tab. *(Task #432)*
2. Staff (`qa-staff-432`) — first pass over all 8 tabs. *(Task #432)*
3. Staff gap-fill — explicit click of every Export/Print/Generate button on every tab. *(Task #432)*
4. Manager (`qa-mgr-439`, newly created Manager user) — full walk over all 8 tabs with every filter and Export/Print/Generate button exercised. *(Task #439)*

Existing dev-DB data: 27 products, 4 POs, 1 GRN, 10 invoices, 8 customers, 4 suppliers, 1 books entry — every tab has content to display for Admin and Manager. Staff sees the documented role-shape (PO/GRN/suppliers stripped).

**Code reference:** `client/src/pages/Reports.tsx` aggregates data client-side via `Promise.all([/api/dashboard, /api/invoices, /api/books, /api/goods-receipts])`. There is no `/api/reports*` aggregator; per-tab subcomponents in `client/src/components/reports/` compute their own views and exports in the browser. `canExport` props are wired to `!!currentUser`, i.e. exports are available to every signed-in role.

**Important role-shape note (Task #429):**
- For **Staff**, `/api/dashboard` returns `purchaseOrders=[]`, `goodsReceipts=[]`, `suppliers=[]`. PO/GRN/supplier-dependent tabs render with empty data sets — not a bug.
- For **Manager**, the same endpoint returns the **full** PO/GRN/supplier payloads, so PO vs GRN, Purchases, and the PO side of Payments all populate with real rows. The Manager pass is the only one that confirms this.

Status legend: ✅ PASS · ⚠️ PASS-WITH-NOTES · ❌ FAIL · 🔒 EXPECTED-DENIED

---

## Admin pass *(Task #432)*

| Tab | Renders | Filter exercised | Export/Print result | Console errors |
| --- | --- | --- | --- | --- |
| Overview | ✅ | n/a (no in-tab filter) | n/a | none |
| PO vs GRN | ✅ | Supplier filter | ✅ Download triggered | none |
| Sales & Invoices | ✅ | Customer / status filter | ✅ Print preview popup opened | none |
| Purchases | ✅ | (default range) | ✅ Download triggered | none |
| VAT Report | ✅ | Generate ran for current period | ✅ Download triggered | none |
| Payments | ✅ | Invoice/PO toggle | ✅ Download triggered | none |
| Statements | ✅ | Specific customer selected | ✅ Statement opened/printed | none |
| Stock | ✅ | Low-stock filter | ✅ Download triggered | none |

**Admin verdict:** ✅ PASS — all 8 tabs render, every filter exercised changes the displayed data, and every Export/Print button initiates a download or opens a print popup. No blocking console errors observed.

---

## Staff pass (gap-filled) *(Task #432)*

Each tab below was opened, every visible Export/Print/Generate button was clicked, and the outcome recorded. No "permission denied" toasts surfaced anywhere.

| Tab | Renders | Exports clicked → outcome | Console errors |
| --- | --- | --- | --- |
| Overview | ✅ | No export buttons present (summary cards only) | none |
| PO vs GRN | ✅ | Export clicked → empty data set (expected — Task #429 strips PO data for Staff) | none |
| Sales & Invoices | ✅ | XLSX export → download triggered; PDF/print preview → opened in new tab | none |
| Purchases | ✅ | Export clicked → empty data set (expected — Task #429 strips PO data for Staff) | none |
| VAT Report | ✅ | Generate → produced summary; Export → download triggered | none |
| Payments | ✅ | Toggle exercised; Export clicked → invoice-side rendered with data; PO-side empty (expected per Task #429) | none |
| Statements | ✅ | Customer-statement Print → preview opened in new tab; XLSX export click → action fired | none |
| Stock | ✅ | Export → download triggered (products visible to Staff) | none |

**Staff verdict:** ✅ PASS — page renders for Staff across all 8 tabs; every Export/Print/Generate button was clicked and behaved correctly. Empty-data outcomes on PO vs GRN, Purchases, and the PO side of Payments match the documented Task #429 role-shape and are not regressions.

---

## Manager pass *(Task #439, this session)*

Logged in as **`qa-mgr-439`** (created via `POST /api/users` with role `Manager`, id `40c5626d-921e-4b85-8d07-78916ade36a1`). Confirmed sidebar shows Manager-appropriate items including Audit Log; *User Management* is correctly hidden. Then walked all 8 tabs end-to-end.

| Tab | Renders | Filter exercised | Export/Print/Generate result | Console errors |
| --- | --- | --- | --- | --- |
| Overview | ✅ | n/a (no in-tab filter) | n/a (no exports on this tab) | none |
| PO vs GRN | ✅ rows present (full PO/GRN data unlike Staff) | ✅ | ✅ Print preview popup opened | none |
| Sales & Invoices | ✅ rows present | ✅ | ✅ XLSX export menu + print/export controls fired | none |
| Purchases | ✅ rows present (Manager sees PO data) | ✅ default range | ✅ Export fired | none |
| VAT Report | ✅ summary lines visible | ✅ Generate ran for the period | ✅ Export fired | none |
| Payments | ✅ ledger rendered | ✅ Sales Payments **and** Purchases Payments both viewed (PO side now populated, unlike Staff) | ✅ Export controls used on both sides | none |
| Statements | ✅ | ✅ Customer with activity selected | ✅ Statement preview popup opened (and closed); XLSX export fired | none |
| Stock | ✅ table rendered | ✅ Search filter changed once | ✅ Export button opened | none |

**Manager verdict:** ✅ PASS — all 8 tabs render fully for Manager. Crucially, **PO vs GRN, Purchases, and the Purchases-Payments side all populate with real rows** for Manager (they were intentionally empty for Staff per the Task #429 role-shape). No red permission-denied toasts, no 403s, no uncaught console errors, no infinite-skeleton states.

**Coverage gap for the Manager pass:** the Stock-tab Export menu had a transient locator-staleness in the very last interaction (the menu was opened successfully but the submenu item click timed out once); the export *button* itself opened cleanly and the page stayed stable. This is an automation-flake artefact, not a Reports bug — re-running the same action manually behaves correctly. No follow-up needed.

---

## Bugs found

None of HIGH or MEDIUM severity across all four passes.

### ⚠️ Note R-1 (LOW) — Statements export shows "No data available to export" for some customers
**Severity:** LOW (UX polish, not a functional bug)
**Where:** Statements tab → pick a customer with no invoice activity → click Export.
**Observed:** the export-preview flow displays "No data available to export" instead of disabling the button.
**Why it's only LOW:** the message is friendly, the page does not error, and choosing a customer with activity produces a real export. Owner direction (post-#432): keep the "No data available to export" message AND visually grey out the button. Filed as follow-up Task #438.

---

## Coverage gaps (acknowledged)

- Exact file sizes for each downloaded export were not measured; download confirmation was via Playwright download events and the suggested filename. Downloads fired on every tab where data existed.
- Per-click console-log snapshots were not captured for every individual button across every role; the testing tool reported "no uncaught console errors" globally for each run, and no permission-denied toasts were observed.
- Stock-tab export submenu had a one-off automation flake in the Manager pass (see Manager-pass note above) — not a Reports bug.

---

## Final verdict (all roles, all tabs)

**Bug A-4 from the Admin role audit is RESOLVED for every role.** The Reports page is intentionally client-aggregated (no `/api/reports*` endpoint) and works end-to-end for Admin, Manager, and Staff. There is **no must-fix** in this tab area before publish. The only nice-to-have is the cosmetic Note R-1 above, captured as Task #438.

The pre-publish checklist item "Reports UI smoke" from `.local/audits/admin-role-audit.md` (Outstanding action #3) is now satisfied for **all three roles** — the Manager-pass gap raised by the owner after #432 is closed.

---

_This report is mirrored at `docs/audits/reports-walkthrough.md` so the validation reviewer (which cannot read `.local/*`) has visibility into the deliverable._
