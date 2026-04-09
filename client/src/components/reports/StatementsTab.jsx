import React, { useState, useMemo, useRef } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight, FileText, TrendingUp, TrendingDown, Printer, X } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { getRateToAed } from "@/utils/currency";

const fmt = (v) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);

function fmtDate(val, full = false) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d)) return "—";
    return full ? format(d, "dd/MM/yyyy") : format(d, "dd/MM/yy");
  } catch {
    return "—";
  }
}

function StatusBadge({ status }) {
  if (status === "paid")
    return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs font-medium">Paid</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-medium">Outstanding</Badge>;
}

function SummaryTiles({ records }) {
  const totals = useMemo(() => {
    let totalAed = 0, paidCount = 0, paidAed = 0, outCount = 0, outAed = 0;
    records.forEach((r) => {
      totalAed += r._aed;
      if (r._paymentStatus === "paid") { paidCount++; paidAed += r._aed; }
      else { outCount++; outAed += r._aed; }
    });
    return { total: records.length, totalAed, paidCount, paidAed, outCount, outAed };
  }, [records]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <Card className="p-4">
        <p className="text-2xl font-bold text-blue-700">{totals.total}</p>
        <p className="text-sm text-gray-500">Total Records</p>
        <p className="text-xs text-blue-600 font-medium mt-0.5">AED {fmt(totals.totalAed)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-2xl font-bold text-amber-700">{totals.outCount}</p>
        <p className="text-sm text-gray-500">Outstanding</p>
        <p className="text-xs text-amber-600 font-medium mt-0.5">AED {fmt(totals.outAed)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-2xl font-bold text-green-700">{totals.paidCount}</p>
        <p className="text-sm text-gray-500">Paid</p>
        <p className="text-xs text-green-600 font-medium mt-0.5">AED {fmt(totals.paidAed)}</p>
      </Card>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, iconColor, children }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        </div>
        {open ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <CardContent className="pt-0 pb-6 px-5">{children}</CardContent>}
    </Card>
  );
}

const STATEMENT_PRINT_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; line-height: 1.4; color: #000; background: #fff; margin: 0; padding: 20px 30px; }
  .stmt-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a472a; padding-bottom: 15px; margin-bottom: 20px; }
  .stmt-logo img { max-height: 70px; max-width: 200px; object-fit: contain; }
  .stmt-title { font-size: 22px; font-weight: bold; color: #1a472a; text-align: right; letter-spacing: 1px; margin: 0; }
  .stmt-parties { display: flex; justify-content: space-between; gap: 30px; border-bottom: 1px solid #ddd; padding: 15px 0; margin-bottom: 15px; }
  .stmt-party { flex: 1; }
  .stmt-party-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; }
  .stmt-party-name { font-weight: bold; font-size: 13px; color: #1a1a1a; margin-bottom: 3px; }
  .stmt-party-detail { font-size: 10px; color: #333; margin-bottom: 2px; }
  .stmt-meta { display: flex; justify-content: space-between; align-items: center; background: #f8f9fa; padding: 8px 12px; border-radius: 4px; margin-bottom: 15px; font-size: 10px; color: #555; }
  .stmt-meta strong { color: #1a472a; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead tr { border-top: 2px solid #1a472a; border-bottom: 2px solid #1a472a; background: #f8f9fa; }
  th { padding: 8px 6px; text-align: left; font-weight: bold; color: #1a472a; white-space: nowrap; }
  th.text-right, td.text-right { text-align: right; }
  th.text-center, td.text-center { text-align: center; }
  td { padding: 7px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  .badge-outstanding { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
  .badge-paid { background: #d1fae5; color: #065f46; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
  .stmt-totals { margin-top: 15px; border-top: 2px solid #1a472a; padding-top: 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .stmt-total-row { display: flex; gap: 40px; font-size: 11px; }
  .stmt-total-row.grand { font-weight: bold; font-size: 13px; border-top: 1px solid #ddd; padding-top: 6px; margin-top: 2px; }
  .stmt-total-label { color: #555; min-width: 120px; text-align: right; }
  .stmt-total-value { font-weight: 600; min-width: 110px; text-align: right; color: #1a1a1a; }
  .stmt-footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #888; text-align: center; }
  @media print { @page { size: A4; margin: 0.75in; } body { padding: 0; } }
`;

function buildStatementHtml({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter }) {
  const periodFrom = dateFrom ? fmtDate(dateFrom, true) : "All time";
  const periodTo = dateTo ? fmtDate(dateTo, true) : "present";
  const period = dateFrom || dateTo ? `${periodFrom} – ${periodTo}` : "All time";
  const statusLabel = statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Outstanding";
  const generatedOn = format(new Date(), "dd/MM/yyyy HH:mm");

  const totalAed = records.reduce((s, r) => s + r._aed, 0);
  const paidAed = records.filter((r) => r._paymentStatus === "paid").reduce((s, r) => s + r._aed, 0);
  const outAed = records.filter((r) => r._paymentStatus !== "paid").reduce((s, r) => s + r._aed, 0);

  const logoHtml = companySettings?.logo
    ? `<div class="stmt-logo"><img src="${companySettings.logo}" alt="Logo"/></div>`
    : `<div></div>`;

  const entityName = entity?.name || "—";
  const entityAddress = type === "invoices"
    ? (entity?.billingAddress || entity?.address || "")
    : (entity?.address || "");
  const entityTrn = entity?.vatNumber || "";
  const entityPhone = entity?.phone || "";
  const entityEmail = entity?.email || "";
  const entityContact = type === "invoices" ? (entity?.contactPerson || "") : "";

  const rowsHtml = type === "invoices"
    ? records.map((r, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${r._ref}</td>
          <td class="text-center">${fmtDate(r._date)}</td>
          <td class="text-right">${fmt(r._subtotal)}</td>
          <td class="text-right">${fmt(r._vat)}</td>
          <td class="text-right">AED ${fmt(r._aed)}</td>
          <td class="text-center"><span class="${r._paymentStatus === 'paid' ? 'badge-paid' : 'badge-outstanding'}">${r._paymentStatus === 'paid' ? 'PAID' : 'OUTSTANDING'}</span></td>
          <td class="text-center">${fmtDate(r._paymentDate)}</td>
        </tr>`).join("")
    : records.map((r, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${r._ref}</td>
          <td class="text-center">${fmtDate(r._date)}</td>
          <td class="text-center">${r._currency}</td>
          <td class="text-right">${r._currency} ${fmt(r._origAmount)}</td>
          <td class="text-right">AED ${fmt(r._aed)}</td>
          <td class="text-center"><span class="${r._paymentStatus === 'paid' ? 'badge-paid' : 'badge-outstanding'}">${r._paymentStatus === 'paid' ? 'PAID' : 'OUTSTANDING'}</span></td>
          <td class="text-center">${fmtDate(r._paymentDate)}</td>
        </tr>`).join("");

  const headersHtml = type === "invoices"
    ? `<th class="text-center">#</th><th>Invoice #</th><th class="text-center">Date</th><th class="text-right">Subtotal</th><th class="text-right">VAT</th><th class="text-right">Total (AED)</th><th class="text-center">Status</th><th class="text-center">Received Date</th>`
    : `<th class="text-center">#</th><th>PO #</th><th class="text-center">Date</th><th class="text-center">Currency</th><th class="text-right">Amount (Orig)</th><th class="text-right">Amount (AED)</th><th class="text-center">Status</th><th class="text-center">Payment Date</th>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Statement of Account — ${entityName}</title><style>${STATEMENT_PRINT_CSS}</style></head><body>
<div class="stmt-header">
  ${logoHtml}
  <h1 class="stmt-title">STATEMENT OF ACCOUNT</h1>
</div>
<div class="stmt-parties">
  <div class="stmt-party">
    <div class="stmt-party-label">FROM</div>
    <div class="stmt-party-name">${companySettings?.companyName || ""}</div>
    ${companySettings?.address ? `<div class="stmt-party-detail">${companySettings.address}</div>` : ""}
    ${companySettings?.phone ? `<div class="stmt-party-detail">Tel: ${companySettings.phone}</div>` : ""}
    ${companySettings?.email ? `<div class="stmt-party-detail">Email: ${companySettings.email}</div>` : ""}
    ${companySettings?.taxNumber ? `<div class="stmt-party-detail">TRN: ${companySettings.taxNumber}</div>` : ""}
  </div>
  <div class="stmt-party" style="text-align:right;">
    <div class="stmt-party-label">${type === "invoices" ? "BILL TO" : "VENDOR"}</div>
    <div class="stmt-party-name">${entityName}</div>
    ${entityAddress ? `<div class="stmt-party-detail">${entityAddress}</div>` : ""}
    ${entityContact ? `<div class="stmt-party-detail">Attn: ${entityContact}</div>` : ""}
    ${entityPhone ? `<div class="stmt-party-detail">Tel: ${entityPhone}</div>` : ""}
    ${entityEmail ? `<div class="stmt-party-detail">Email: ${entityEmail}</div>` : ""}
    ${entityTrn ? `<div class="stmt-party-detail">TRN: ${entityTrn}</div>` : ""}
  </div>
</div>
<div class="stmt-meta">
  <span><strong>Period:</strong> ${period}</span>
  <span><strong>Status:</strong> ${statusLabel}</span>
  <span><strong>Records:</strong> ${records.length}</span>
</div>
<table>
  <thead><tr>${headersHtml}</tr></thead>
  <tbody>${rowsHtml || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#999;">No records found</td></tr>`}</tbody>
</table>
<div class="stmt-totals">
  <div class="stmt-total-row">
    <span class="stmt-total-label">Outstanding</span>
    <span class="stmt-total-value">AED ${fmt(outAed)}</span>
  </div>
  <div class="stmt-total-row">
    <span class="stmt-total-label">Paid</span>
    <span class="stmt-total-value">AED ${fmt(paidAed)}</span>
  </div>
  <div class="stmt-total-row grand">
    <span class="stmt-total-label">Grand Total</span>
    <span class="stmt-total-value">AED ${fmt(totalAed)}</span>
  </div>
</div>
<div class="stmt-footer">Generated on ${generatedOn} · FLOW Business Platform</div>
</body></html>`;
}

function InvoicesSection({ invoices, customers, companySettings }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showStatement, setShowStatement] = useState(false);

  const eligibleCustomers = useMemo(() => {
    const ids = new Set(invoices.map((inv) => inv.customer_id ?? inv.customerId).filter(Boolean).map(String));
    return (customers || [])
      .filter((c) => ids.has(String(c.id)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [invoices, customers]);

  const selectedCustomer = useMemo(
    () => eligibleCustomers.find((c) => String(c.id) === selectedCustomerId) || null,
    [eligibleCustomers, selectedCustomerId]
  );

  const enriched = useMemo(() => {
    return invoices.map((inv) => {
      const origAmount = parseFloat(inv.total_amount || inv.totalAmount || inv.amount || 0);
      const subtotal = parseFloat(inv.subtotal || 0);
      const vat = parseFloat(inv.tax_amount || inv.vatAmount || 0);
      const ps = (inv.paymentStatus || inv.payment_status || "outstanding").toLowerCase();
      return {
        ...inv,
        _aed: origAmount,
        _subtotal: subtotal,
        _vat: vat,
        _paymentStatus: ps,
        _ref: inv.invoice_number || inv.invoiceNumber || "",
        _customer: inv.customer_name || inv.customerName || "",
        _customerId: String(inv.customer_id ?? inv.customerId ?? ""),
        _date: inv.invoice_date || inv.invoiceDate || "",
        _paymentDate: inv.paymentReceivedDate || inv.payment_received_date || "",
        _remarks: inv.paymentRemarks || inv.payment_remarks || "",
      };
    });
  }, [invoices]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r) => {
      if (selectedCustomerId && r._customerId !== selectedCustomerId) return false;
      if (statusFilter !== "all" && r._paymentStatus !== statusFilter) return false;
      if (r._date && (fromTs || toTs)) {
        const ts = new Date(r._date).getTime();
        if (!isNaN(ts)) {
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
      }
      return true;
    });
  }, [enriched, selectedCustomerId, statusFilter, dateFrom, dateTo]);

  const handleCustomerChange = (val) => {
    setSelectedCustomerId(val === "all" ? "" : val);
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const handlePrint = () => {
    const html = buildStatementHtml({
      type: "invoices",
      entity: selectedCustomer,
      companySettings,
      records: filtered,
      dateFrom,
      dateTo,
      statusFilter,
    });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const exportData = filtered.map((r) => ({
    invoice_number: r._ref,
    customer: r._customer,
    invoice_date: fmtDate(r._date),
    subtotal_aed: `AED ${fmt(r._subtotal)}`,
    vat_aed: `AED ${fmt(r._vat)}`,
    total_aed: `AED ${fmt(r._aed)}`,
    payment_status: r._paymentStatus === "paid" ? "Paid" : "Outstanding",
    received_date: fmtDate(r._paymentDate),
    remarks: r._remarks,
  }));

  const exportFilename = selectedCustomer
    ? `statement_invoices_${(selectedCustomer.name || "customer").replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}`
    : "statement_invoices";

  const hasActiveFilters = selectedCustomerId || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <>
      {/* Entity + Filters row */}
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Customer</label>
          <Select value={selectedCustomerId || "all"} onValueChange={handleCustomerChange}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {eligibleCustomers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-38" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-38" />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="text-gray-500 self-end"
            onClick={() => { setSelectedCustomerId(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-end gap-2">
          <Button
            size="sm"
            disabled={!selectedCustomerId}
            onClick={() => setShowStatement(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Generate Statement
          </Button>
          <ExportDropdown
            data={exportData}
            type="Invoices Statement"
            filename={exportFilename}
            columns={{
              invoice_number: "Invoice #",
              customer: "Customer",
              invoice_date: "Invoice Date",
              subtotal_aed: "Subtotal (AED)",
              vat_aed: "VAT (AED)",
              total_aed: "Total (AED)",
              payment_status: "Payment Status",
              received_date: "Received Date",
              remarks: "Remarks",
            }}
          />
        </div>
      </div>

      <SummaryTiles records={filtered} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Invoice #</TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold text-right">Subtotal (AED)</TableHead>
              <TableHead className="font-semibold text-right">VAT (AED)</TableHead>
              <TableHead className="font-semibold text-right">Total (AED)</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Received Date</TableHead>
              <TableHead className="font-semibold">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-gray-400">
                  {selectedCustomerId ? "No invoices match the current filters" : "Select a customer to view their invoices"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-blue-700">{r._ref}</TableCell>
                  <TableCell>{r._customer}</TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._date)}</TableCell>
                  <TableCell className="text-right">AED {fmt(r._subtotal)}</TableCell>
                  <TableCell className="text-right">AED {fmt(r._vat)}</TableCell>
                  <TableCell className="text-right font-medium">AED {fmt(r._aed)}</TableCell>
                  <TableCell><StatusBadge status={r._paymentStatus} /></TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._paymentDate)}</TableCell>
                  <TableCell className="text-gray-500 max-w-40 truncate" title={r._remarks}>{r._remarks || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>

      {/* Statement Preview Modal */}
      <StatementPreviewModal
        open={showStatement}
        onClose={() => setShowStatement(false)}
        type="invoices"
        entity={selectedCustomer}
        companySettings={companySettings}
        records={filtered}
        dateFrom={dateFrom}
        dateTo={dateTo}
        statusFilter={statusFilter}
        onPrint={handlePrint}
      />
    </>
  );
}

function PurchaseOrdersSection({ purchaseOrders, suppliers, companySettings }) {
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showStatement, setShowStatement] = useState(false);

  const getSupplierName = (po) => {
    if (po.supplierName || po.supplier_name) return po.supplierName || po.supplier_name;
    const id = po.supplierId || po.supplier_id;
    const s = (suppliers || []).find((s) => s.id === id || s.id === Number(id));
    return s?.name || "";
  };

  const eligibleSuppliers = useMemo(() => {
    const ids = new Set(purchaseOrders.map((po) => po.supplierId || po.supplier_id).filter(Boolean).map(String));
    return (suppliers || [])
      .filter((s) => ids.has(String(s.id)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [purchaseOrders, suppliers]);

  const selectedSupplier = useMemo(
    () => eligibleSuppliers.find((s) => String(s.id) === selectedSupplierId) || null,
    [eligibleSuppliers, selectedSupplierId]
  );

  const enriched = useMemo(() => {
    return purchaseOrders.map((po) => {
      const origAmt = parseFloat(po.totalAmount || po.total_amount || 0);
      const currency = po.currency || "GBP";
      const storedRate = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
      const rate = !isNaN(storedRate) && storedRate > 0 ? storedRate : getRateToAed(currency, companySettings);
      const aed = currency === "AED" ? origAmt : origAmt * rate;
      const ps = (po.paymentStatus || po.payment_status || "outstanding").toLowerCase();
      const suppName = getSupplierName(po);
      const suppId = String(po.supplierId || po.supplier_id || "");
      return {
        ...po,
        _origAmount: origAmt,
        _currency: currency,
        _aed: aed,
        _paymentStatus: ps,
        _ref: po.poNumber || po.po_number || "",
        _supplier: suppName,
        _supplierId: suppId,
        _date: po.orderDate || po.order_date || "",
        _paymentDate: po.paymentMadeDate || po.payment_made_date || "",
        _remarks: po.paymentRemarks || po.payment_remarks || "",
      };
    });
  }, [purchaseOrders, suppliers, companySettings]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r) => {
      if (selectedSupplierId && r._supplierId !== selectedSupplierId) return false;
      if (statusFilter !== "all" && r._paymentStatus !== statusFilter) return false;
      if (r._date && (fromTs || toTs)) {
        const ts = new Date(r._date).getTime();
        if (!isNaN(ts)) {
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
      }
      return true;
    });
  }, [enriched, selectedSupplierId, statusFilter, dateFrom, dateTo]);

  const handleSupplierChange = (val) => {
    setSelectedSupplierId(val === "all" ? "" : val);
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const handlePrint = () => {
    const html = buildStatementHtml({
      type: "pos",
      entity: selectedSupplier,
      companySettings,
      records: filtered,
      dateFrom,
      dateTo,
      statusFilter,
    });
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  const exportData = filtered.map((r) => ({
    po_number: r._ref,
    supplier: r._supplier,
    order_date: fmtDate(r._date),
    currency: r._currency,
    amount_orig: `${r._currency} ${fmt(r._origAmount)}`,
    amount_aed: `AED ${fmt(r._aed)}`,
    payment_status: r._paymentStatus === "paid" ? "Paid" : "Outstanding",
    payment_date: fmtDate(r._paymentDate),
    remarks: r._remarks,
  }));

  const exportFilename = selectedSupplier
    ? `statement_pos_${(selectedSupplier.name || "supplier").replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}`
    : "statement_pos";

  const hasActiveFilters = selectedSupplierId || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Supplier</label>
          <Select value={selectedSupplierId || "all"} onValueChange={handleSupplierChange}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {eligibleSuppliers.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="outstanding">Outstanding</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-38" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-38" />
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="text-gray-500 self-end"
            onClick={() => { setSelectedSupplierId(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-end gap-2">
          <Button
            size="sm"
            disabled={!selectedSupplierId}
            onClick={() => setShowStatement(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <FileText className="w-4 h-4 mr-1.5" />
            Generate Statement
          </Button>
          <ExportDropdown
            data={exportData}
            type="PO Statement"
            filename={exportFilename}
            columns={{
              po_number: "PO #",
              supplier: "Supplier",
              order_date: "Order Date",
              currency: "Currency",
              amount_orig: "Amount (Original)",
              amount_aed: "Amount (AED)",
              payment_status: "Payment Status",
              payment_date: "Payment Date",
              remarks: "Remarks",
            }}
          />
        </div>
      </div>

      <SummaryTiles records={filtered} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">PO #</TableHead>
              <TableHead className="font-semibold">Supplier</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Currency</TableHead>
              <TableHead className="font-semibold text-right">Amount (Orig)</TableHead>
              <TableHead className="font-semibold text-right">Amount (AED)</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Payment Date</TableHead>
              <TableHead className="font-semibold">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-gray-400">
                  {selectedSupplierId ? "No purchase orders match the current filters" : "Select a supplier to view their purchase orders"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-purple-700">{r._ref}</TableCell>
                  <TableCell>{r._supplier}</TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._date)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{r._currency}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{r._currency} {fmt(r._origAmount)}</TableCell>
                  <TableCell className="text-right font-medium">AED {fmt(r._aed)}</TableCell>
                  <TableCell><StatusBadge status={r._paymentStatus} /></TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._paymentDate)}</TableCell>
                  <TableCell className="text-gray-500 max-w-40 truncate" title={r._remarks}>{r._remarks || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>

      <StatementPreviewModal
        open={showStatement}
        onClose={() => setShowStatement(false)}
        type="pos"
        entity={selectedSupplier}
        companySettings={companySettings}
        records={filtered}
        dateFrom={dateFrom}
        dateTo={dateTo}
        statusFilter={statusFilter}
        onPrint={handlePrint}
      />
    </>
  );
}

function StatementPreviewModal({ open, onClose, type, entity, companySettings, records, dateFrom, dateTo, statusFilter, onPrint }) {
  const totalAed = records.reduce((s, r) => s + r._aed, 0);
  const paidAed = records.filter((r) => r._paymentStatus === "paid").reduce((s, r) => s + r._aed, 0);
  const outAed = records.filter((r) => r._paymentStatus !== "paid").reduce((s, r) => s + r._aed, 0);

  const entityName = entity?.name || "—";
  const entityAddress = type === "invoices" ? (entity?.billingAddress || entity?.address || "") : (entity?.address || "");
  const entityTrn = entity?.vatNumber || "";
  const entityPhone = entity?.phone || "";
  const entityEmail = entity?.email || "";
  const entityContact = type === "invoices" ? (entity?.contactPerson || "") : "";

  const periodFrom = dateFrom ? fmtDate(dateFrom, true) : null;
  const periodTo = dateTo ? fmtDate(dateTo, true) : null;
  const period = periodFrom || periodTo
    ? `${periodFrom || "start"} – ${periodTo || "present"}`
    : "All time";
  const statusLabel = statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Outstanding";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Statement of Account Preview</span>
            <div className="flex gap-2 mr-6">
              <Button size="sm" onClick={onPrint} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                <Printer className="w-4 h-4 mr-1.5" />
                Print / Save PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Statement Content Preview */}
        <div className="border rounded-lg p-6 bg-white text-sm font-[system-ui]">

          {/* Header */}
          <div className="flex justify-between items-start border-b-4 border-emerald-900 pb-4 mb-5">
            {companySettings?.logo ? (
              <img src={companySettings.logo} alt="Logo" className="max-h-16 max-w-44 object-contain" />
            ) : <div />}
            <h2 className="text-2xl font-bold text-emerald-900 tracking-wide">STATEMENT OF ACCOUNT</h2>
          </div>

          {/* Parties */}
          <div className="flex justify-between gap-8 border-b border-gray-200 pb-4 mb-4">
            <div className="flex-1">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">From</p>
              <p className="font-bold text-sm text-gray-900">{companySettings?.companyName || ""}</p>
              {companySettings?.address && <p className="text-xs text-gray-600 mt-0.5">{companySettings.address}</p>}
              {companySettings?.phone && <p className="text-xs text-gray-600">Tel: {companySettings.phone}</p>}
              {companySettings?.email && <p className="text-xs text-gray-600">Email: {companySettings.email}</p>}
              {companySettings?.taxNumber && <p className="text-xs text-gray-600">TRN: {companySettings.taxNumber}</p>}
            </div>
            <div className="flex-1 text-right">
              <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
                {type === "invoices" ? "Bill To" : "Vendor"}
              </p>
              <p className="font-bold text-sm text-gray-900">{entityName}</p>
              {entityAddress && <p className="text-xs text-gray-600 mt-0.5">{entityAddress}</p>}
              {entityContact && <p className="text-xs text-gray-600">Attn: {entityContact}</p>}
              {entityPhone && <p className="text-xs text-gray-600">Tel: {entityPhone}</p>}
              {entityEmail && <p className="text-xs text-gray-600">Email: {entityEmail}</p>}
              {entityTrn && <p className="text-xs text-gray-600">TRN: {entityTrn}</p>}
            </div>
          </div>

          {/* Meta row */}
          <div className="flex justify-between text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 mb-4">
            <span><span className="font-semibold text-emerald-800">Period:</span> {period}</span>
            <span><span className="font-semibold text-emerald-800">Status:</span> {statusLabel}</span>
            <span><span className="font-semibold text-emerald-800">Records:</span> {records.length}</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-t-2 border-b-2 border-emerald-900">
                  <th className="text-center p-2 font-bold text-emerald-900">#</th>
                  {type === "invoices" ? (
                    <>
                      <th className="p-2 font-bold text-emerald-900 text-left">Invoice #</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Date</th>
                      <th className="text-right p-2 font-bold text-emerald-900">Subtotal</th>
                      <th className="text-right p-2 font-bold text-emerald-900">VAT</th>
                      <th className="text-right p-2 font-bold text-emerald-900">Total (AED)</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Status</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Received</th>
                    </>
                  ) : (
                    <>
                      <th className="p-2 font-bold text-emerald-900 text-left">PO #</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Date</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Curr.</th>
                      <th className="text-right p-2 font-bold text-emerald-900">Amt (Orig)</th>
                      <th className="text-right p-2 font-bold text-emerald-900">Amt (AED)</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Status</th>
                      <th className="text-center p-2 font-bold text-emerald-900">Paid Date</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-6 text-gray-400">No records</td></tr>
                ) : records.map((r, i) => (
                  <tr key={r.id || i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="text-center p-2 text-gray-500">{i + 1}</td>
                    {type === "invoices" ? (
                      <>
                        <td className="p-2 font-medium text-blue-700">{r._ref}</td>
                        <td className="text-center p-2 text-gray-600">{fmtDate(r._date)}</td>
                        <td className="text-right p-2">AED {fmt(r._subtotal)}</td>
                        <td className="text-right p-2">AED {fmt(r._vat)}</td>
                        <td className="text-right p-2 font-semibold">AED {fmt(r._aed)}</td>
                        <td className="text-center p-2"><StatusBadge status={r._paymentStatus} /></td>
                        <td className="text-center p-2 text-gray-600">{fmtDate(r._paymentDate)}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 font-medium text-purple-700">{r._ref}</td>
                        <td className="text-center p-2 text-gray-600">{fmtDate(r._date)}</td>
                        <td className="text-center p-2"><Badge variant="outline" className="text-xs">{r._currency}</Badge></td>
                        <td className="text-right p-2">{r._currency} {fmt(r._origAmount)}</td>
                        <td className="text-right p-2 font-semibold">AED {fmt(r._aed)}</td>
                        <td className="text-center p-2"><StatusBadge status={r._paymentStatus} /></td>
                        <td className="text-center p-2 text-gray-600">{fmtDate(r._paymentDate)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 border-t-2 border-emerald-900 pt-3 flex flex-col items-end gap-1.5">
            <div className="flex gap-10 text-xs">
              <span className="text-gray-500 w-28 text-right">Outstanding</span>
              <span className="font-medium w-28 text-right">AED {fmt(outAed)}</span>
            </div>
            <div className="flex gap-10 text-xs">
              <span className="text-gray-500 w-28 text-right">Paid</span>
              <span className="font-medium w-28 text-right">AED {fmt(paidAed)}</span>
            </div>
            <div className="flex gap-10 text-sm font-bold border-t border-gray-200 pt-1.5 mt-1">
              <span className="w-28 text-right">Grand Total</span>
              <span className="w-28 text-right">AED {fmt(totalAed)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">
            Generated on {format(new Date(), "dd/MM/yyyy HH:mm")} · FLOW Business Platform
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StatementsTab({ invoices, purchaseOrders, customers, suppliers, companySettings }) {
  return (
    <div className="space-y-4">
      <div className="mb-2">
        <p className="text-sm text-gray-500">
          Generate statements of account for customers (invoices) and suppliers (purchase orders).
          Select an entity and apply filters, then click <strong>Generate Statement</strong> to preview and print.
        </p>
      </div>

      <CollapsibleSection title="Invoices" icon={TrendingUp} iconColor="bg-blue-50 text-blue-600">
        <InvoicesSection
          invoices={invoices || []}
          customers={customers || []}
          companySettings={companySettings}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Purchase Orders" icon={TrendingDown} iconColor="bg-purple-50 text-purple-600">
        <PurchaseOrdersSection
          purchaseOrders={purchaseOrders || []}
          suppliers={suppliers || []}
          companySettings={companySettings}
        />
      </CollapsibleSection>
    </div>
  );
}
