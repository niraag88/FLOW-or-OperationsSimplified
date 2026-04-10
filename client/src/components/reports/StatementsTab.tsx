import React, { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, FileText, TrendingUp, TrendingDown, Printer, Check, ChevronsUpDown, X, Download } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { getRateToAed } from "@/utils/currency";
import { exportStatementToXLSX } from "../utils/export";

/* ── formatting helpers ─────────────────────────────────────────────────── */

function fmt(v) {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}

function fmtDate(val, full = false) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return format(d, "dd/MM/yy");
  } catch {
    return "—";
  }
}

/* ── small shared components ────────────────────────────────────────────── */

function StatusBadge({ status }) {
  if (status === "paid")
    return <Badge className="bg-green-100 text-green-800 border-green-300 text-xs font-medium">Paid</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs font-medium">Outstanding</Badge>;
}

function SummaryTiles({ records }) {
  const totals = useMemo(() => {
    let totalAed = 0, paidCount = 0, paidAed = 0, outCount = 0, outAed = 0;
    let totalOrig = 0, paidOrig = 0, outOrig = 0;
    let origCurrency = null;
    records.forEach((r) => {
      totalAed  += r._aed || 0;
      totalOrig += r._origAmount || r._aed || 0;
      if (!origCurrency && r._currency && r._currency !== "AED") origCurrency = r._currency;
      if (r._paymentStatus === "paid") {
        paidCount++; paidAed += r._aed || 0; paidOrig += r._origAmount || r._aed || 0;
      } else {
        outCount++; outAed += r._aed || 0; outOrig += r._origAmount || r._aed || 0;
      }
    });
    const showOrig = Boolean(origCurrency);
    return { total: records.length, totalAed, paidCount, paidAed, outCount, outAed, totalOrig, paidOrig, outOrig, origCurrency, showOrig };
  }, [records]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
      <Card className="p-4">
        <p className="text-2xl font-bold text-blue-700">{totals.total}</p>
        <p className="text-sm text-gray-500">Total Records</p>
        {totals.showOrig && <p className="text-xs text-blue-600 font-semibold mt-0.5">{totals.origCurrency} {fmt(totals.totalOrig)}</p>}
        <p className="text-xs text-blue-500 mt-0.5">AED {fmt(totals.totalAed)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-2xl font-bold text-amber-700">{totals.outCount}</p>
        <p className="text-sm text-gray-500">Outstanding</p>
        {totals.showOrig && <p className="text-xs text-amber-600 font-semibold mt-0.5">{totals.origCurrency} {fmt(totals.outOrig)}</p>}
        <p className="text-xs text-amber-500 mt-0.5">AED {fmt(totals.outAed)}</p>
      </Card>
      <Card className="p-4">
        <p className="text-2xl font-bold text-green-700">{totals.paidCount}</p>
        <p className="text-sm text-gray-500">Paid</p>
        {totals.showOrig && <p className="text-xs text-green-600 font-semibold mt-0.5">{totals.origCurrency} {fmt(totals.paidOrig)}</p>}
        <p className="text-xs text-green-500 mt-0.5">AED {fmt(totals.paidAed)}</p>
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

/* ── searchable combobox ────────────────────────────────────────────────── */

function EntityCombobox({ items, value, onValueChange, placeholder = "Select…", allLabel = "All" }) {
  const [popOpen, setPopOpen] = useState(false);
  const selected = items.find((i) => String(i.id) === value) || null;
  return (
    <Popover open={popOpen} onOpenChange={setPopOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={popOpen}
          className="w-56 justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0">
        <Command>
          <CommandInput placeholder={`Search ${allLabel.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value=""
                onSelect={() => { onValueChange(""); setPopOpen(false); }}
              >
                <Check className={`mr-2 h-4 w-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                {allLabel}
              </CommandItem>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.name}
                  onSelect={() => { onValueChange(String(item.id)); setPopOpen(false); }}
                >
                  <Check className={`mr-2 h-4 w-4 ${String(item.id) === value ? "opacity-100" : "opacity-0"}`} />
                  {item.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ── HTML escape helper for print window ────────────────────────────────── */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── buildStatementHtml — plain HTML string for window.open print ────────── */

function buildStatementHtml({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter }) {
  const totalAed = records.reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const paidAed  = records.filter((r) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const outAed   = records.filter((r) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);

  const origCurrency = records.find((r) => r._currency && r._currency !== "AED")?._currency || null;
  const showDual = Boolean(origCurrency);
  const totalOrig = showDual ? records.reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const paidOrig  = showDual ? records.filter((r) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const outOrig   = showDual ? records.filter((r) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;

  const entityName    = entity?.name || "—";
  const entityAddress = type === "invoices" ? (entity?.billingAddress || entity?.address || "") : (entity?.description || "");
  const entityTrn     = type === "invoices" ? (entity?.vatNumber || "") : "";
  const entityPhone   = type === "invoices" ? (entity?.phone || "") : (entity?.contactPhone || "");
  const entityEmail   = type === "invoices" ? (entity?.email || "") : (entity?.contactEmail || "");
  const entityContact = entity?.contactPerson || "";
  const entityWebsite = type === "pos" ? (entity?.website || "") : "";

  const periodFrom  = dateFrom ? fmtDate(dateFrom, true) : null;
  const periodTo    = dateTo   ? fmtDate(dateTo, true)   : null;
  const period      = periodFrom || periodTo ? `${periodFrom || "start"} – ${periodTo || "present"}` : "All time";
  const statusLabel = statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Outstanding";
  const today       = format(new Date(), "dd/MM/yy");

  const logoHtml = companySettings?.logo
    ? `<img src="${esc(companySettings.logo)}" style="max-height:56px;max-width:150px;object-fit:contain" alt="Logo">`
    : "<div></div>";

  const thStyle  = "padding:6px 8px;font-weight:bold;color:#064e3b;text-align:left;";
  const thR      = "padding:6px 8px;font-weight:bold;color:#064e3b;text-align:right;";
  const thC      = "padding:6px 8px;font-weight:bold;color:#064e3b;text-align:center;";
  const tdStyle  = "padding:5px 8px;border-bottom:1px solid #f3f4f6;";
  const tdR      = "padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:right;";
  const tdC      = "padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;";

  const headerRow = type === "invoices"
    ? `<th style="${thStyle}">Invoice #</th><th style="${thC}">Date</th><th style="${thR}">Subtotal</th><th style="${thR}">VAT</th><th style="${thR}">Total (AED)</th><th style="${thC}">Status</th><th style="${thC}">Received</th>`
    : `<th style="${thStyle}">PO #</th><th style="${thC}">Date</th><th style="${thR}">Amount</th><th style="${thR}">Amount (AED)</th><th style="${thC}">Status</th><th style="${thC}">Payment Date</th>`;

  const dataRows = records.length === 0
    ? `<tr><td colspan="${type === "invoices" ? 8 : 7}" style="text-align:center;padding:16px;color:#9ca3af">No records</td></tr>`
    : records.map((r, i) => {
        const statusBg    = r._paymentStatus === "paid" ? "#dcfce7" : "#fef3c7";
        const statusColor = r._paymentStatus === "paid" ? "#166534" : "#92400e";
        const statusText  = r._paymentStatus === "paid" ? "Paid" : "Outstanding";
        const badge       = `<span style="background:${statusBg};color:${statusColor};padding:2px 7px;border-radius:4px;font-size:9px;font-weight:600">${statusText}</span>`;
        if (type === "invoices") {
          return `<tr>
            <td style="${tdC}">${i + 1}</td>
            <td style="${tdStyle}color:#1d4ed8;font-weight:500">${esc(r._ref)}</td>
            <td style="${tdC}">${esc(fmtDate(r._date))}</td>
            <td style="${tdR}">AED ${esc(fmt(r._subtotal))}</td>
            <td style="${tdR}">AED ${esc(fmt(r._vat))}</td>
            <td style="${tdR}font-weight:600">AED ${esc(fmt(r._aed))}</td>
            <td style="${tdC}">${badge}</td>
            <td style="${tdC}">${esc(fmtDate(r._paymentDate))}</td>
          </tr>`;
        }
        return `<tr>
          <td style="${tdC}">${i + 1}</td>
          <td style="${tdStyle}color:#7e22ce;font-weight:500">${esc(r._ref)}</td>
          <td style="${tdC}">${esc(fmtDate(r._date))}</td>
          <td style="${tdR}">${esc(r._currency)} ${esc(fmt(r._origAmount))}</td>
          <td style="${tdR}font-weight:600">AED ${esc(fmt(r._aed))}</td>
          <td style="${tdC}">${badge}</td>
          <td style="${tdC}">${esc(fmtDate(r._paymentDate))}</td>
        </tr>`;
      }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Statement of Account</title>
<style>
  @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #064e3b; padding-bottom:12px; margin-bottom:16px; }
  .header h1 { font-size:20px; font-weight:bold; color:#064e3b; letter-spacing:1px; }
  .parties { display:flex; justify-content:space-between; gap:32px; border-bottom:1px solid #e5e7eb; padding-bottom:12px; margin-bottom:12px; }
  .party-right { text-align:right; }
  .lbl { font-size:8px; text-transform:uppercase; letter-spacing:2px; color:#9ca3af; margin-bottom:4px; }
  .cname { font-weight:bold; font-size:12px; }
  .det { font-size:10px; color:#4b5563; margin-top:2px; }
  .meta { display:flex; justify-content:space-between; background:#f9fafb; padding:6px 10px; border-radius:4px; font-size:10px; color:#6b7280; margin-bottom:14px; }
  .meta-lbl { font-weight:600; color:#065f46; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  thead tr { background:#f9fafb; border-top:2px solid #064e3b; border-bottom:2px solid #064e3b; }
  .totals { margin-top:14px; border-top:2px solid #064e3b; padding-top:8px; display:flex; flex-direction:column; align-items:flex-end; gap:4px; }
  .tr { display:flex; gap:40px; font-size:10px; }
  .tr.grand { font-size:12px; font-weight:bold; border-top:1px solid #e5e7eb; padding-top:5px; margin-top:2px; }
  .tl { width:110px; text-align:right; color:#6b7280; }
  .tl.grand { color:#000; }
  .tv { width:110px; text-align:right; }
  .footer { border-top:1px solid #e5e7eb; padding:8px 15mm; text-align:center; font-size:9px; color:#9ca3af; background:#fff; }
  @media print {
    .footer { position:fixed; bottom:0; left:0; right:0; padding:4px 15mm; }
  }
  @media screen {
    html { background:#e8e8e8; }
    body { max-width:900px; min-height:297mm; margin:30px auto; padding:40px 50px 0; box-shadow:0 2px 12px rgba(0,0,0,0.15); display:flex; flex-direction:column; }
    .footer { margin-top:auto; }
  }
</style>
</head>
<body>
<div class="header">
  ${logoHtml}
  <h1>STATEMENT OF ACCOUNT</h1>
</div>
<div class="parties">
  <div>
    <div class="lbl">From</div>
    <div class="cname">${esc(companySettings?.companyName || "")}</div>
    ${companySettings?.address ? `<div class="det">${esc(companySettings.address).replace(/\n/g, "<br>")}</div>` : ""}
    ${companySettings?.phone    ? `<div class="det">Tel: ${esc(companySettings.phone)}</div>` : ""}
    ${companySettings?.email    ? `<div class="det">Email: ${esc(companySettings.email)}</div>` : ""}
    ${companySettings?.taxNumber ? `<div class="det">TRN: ${esc(companySettings.taxNumber)}</div>` : ""}
  </div>
  <div class="party-right">
    <div class="lbl">${type === "invoices" ? "Bill To" : "Brand"}</div>
    <div class="cname">${esc(entityName)}</div>
    ${entityAddress ? `<div class="det">${esc(entityAddress).replace(/\n/g, "<br>")}</div>` : ""}
    ${entityContact ? `<div class="det">Attn: ${esc(entityContact)}</div>` : ""}
    ${entityPhone   ? `<div class="det">Tel: ${esc(entityPhone)}</div>` : ""}
    ${entityEmail   ? `<div class="det">Email: ${esc(entityEmail)}</div>` : ""}
    ${entityTrn     ? `<div class="det">TRN: ${esc(entityTrn)}</div>` : ""}
    ${entityWebsite ? `<div class="det">Web: ${esc(entityWebsite)}</div>` : ""}
  </div>
</div>
<div class="meta">
  <span><span class="meta-lbl">Period:</span> ${esc(period)}</span>
  <span><span class="meta-lbl">Status:</span> ${esc(statusLabel)}</span>
  <span><span class="meta-lbl">Records:</span> ${records.length}</span>
</div>
<table>
  <thead><tr><th style="${thC}">#</th>${headerRow}</tr></thead>
  <tbody>${dataRows}</tbody>
</table>
<div class="totals">
  <div class="tr">
    <span class="tl">Outstanding</span>
    <span class="tv">
      ${showDual ? `<div style="font-weight:600">${esc(origCurrency)} ${esc(fmt(outOrig))}</div>` : ""}
      <div style="${showDual ? "color:#6b7280;font-weight:normal" : ""}">AED ${esc(fmt(outAed))}</div>
    </span>
  </div>
  <div class="tr">
    <span class="tl">Paid</span>
    <span class="tv">
      ${showDual ? `<div style="font-weight:600">${esc(origCurrency)} ${esc(fmt(paidOrig))}</div>` : ""}
      <div style="${showDual ? "color:#6b7280;font-weight:normal" : ""}">AED ${esc(fmt(paidAed))}</div>
    </span>
  </div>
  <div class="tr grand">
    <span class="tl grand">Grand Total</span>
    <span class="tv">
      ${showDual ? `<div>${esc(origCurrency)} ${esc(fmt(totalOrig))}</div>` : ""}
      <div style="${showDual ? "color:#6b7280;font-size:9px;font-weight:normal" : ""}">AED ${esc(fmt(totalAed))}</div>
    </span>
  </div>
</div>
<div class="footer">Generated on ${esc(today)}</div>
</body>
</html>`;
}

/* ── statement layout (shared between modal preview and print portal) ───── */

function StatementLayout({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter }) {
  const totalAed = records.reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const paidAed  = records.filter((r) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);
  const outAed   = records.filter((r) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._aed || 0), 0);

  const origCurrency = records.find((r) => r._currency && r._currency !== "AED")?._currency || null;
  const showDual = Boolean(origCurrency);
  const totalOrig = showDual ? records.reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const paidOrig  = showDual ? records.filter((r) => r._paymentStatus === "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;
  const outOrig   = showDual ? records.filter((r) => r._paymentStatus !== "paid").reduce((s: any, r: any) => s + (r._origAmount || r._aed || 0), 0) : 0;

  const entityName    = entity?.name || "—";
  const entityAddress = type === "invoices" ? (entity?.billingAddress || entity?.address || "") : (entity?.description || "");
  const entityTrn     = type === "invoices" ? (entity?.vatNumber || "") : "";
  const entityPhone   = type === "invoices" ? (entity?.phone || "") : (entity?.contactPhone || "");
  const entityEmail   = type === "invoices" ? (entity?.email || "") : (entity?.contactEmail || "");
  const entityContact = entity?.contactPerson || "";
  const entityWebsite = type === "pos" ? (entity?.website || "") : "";

  const periodFrom  = dateFrom ? fmtDate(dateFrom, true) : null;
  const periodTo    = dateTo   ? fmtDate(dateTo, true)   : null;
  const period      = periodFrom || periodTo ? `${periodFrom || "start"} – ${periodTo || "present"}` : "All time";
  const statusLabel = statusFilter === "all" ? "All" : statusFilter === "paid" ? "Paid" : "Outstanding";

  return (
    <div className="text-sm font-[system-ui] flex flex-col" style={{ minHeight: "260mm" }}>
      <div className="flex-1">
        {/* Header */}
        <div className="flex justify-between items-start border-b-4 border-emerald-900 pb-4 mb-5">
          {companySettings?.logo ? (
            <img src={companySettings.logo} alt="Company Logo" className="max-h-16 max-w-44 object-contain" />
          ) : <div />}
          <h2 className="text-2xl font-bold text-emerald-900 tracking-wide">STATEMENT OF ACCOUNT</h2>
        </div>

        {/* Parties */}
        <div className="flex justify-between gap-8 border-b border-gray-200 pb-4 mb-4">
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">From</p>
            <p className="font-bold text-sm text-gray-900">{companySettings?.companyName || ""}</p>
            {companySettings?.address && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{companySettings.address}</p>}
            {companySettings?.phone && <p className="text-xs text-gray-600">Tel: {companySettings.phone}</p>}
            {companySettings?.email && <p className="text-xs text-gray-600">Email: {companySettings.email}</p>}
            {companySettings?.taxNumber && <p className="text-xs text-gray-600">TRN: {companySettings.taxNumber}</p>}
          </div>
          <div className="flex-1 text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
              {type === "invoices" ? "Bill To" : "Brand"}
            </p>
            <p className="font-bold text-sm text-gray-900">{entityName}</p>
            {entityAddress && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{entityAddress}</p>}
            {entityContact && <p className="text-xs text-gray-600">Attn: {entityContact}</p>}
            {entityPhone && <p className="text-xs text-gray-600">Tel: {entityPhone}</p>}
            {entityEmail && <p className="text-xs text-gray-600">Email: {entityEmail}</p>}
            {entityTrn && <p className="text-xs text-gray-600">TRN: {entityTrn}</p>}
            {entityWebsite && <p className="text-xs text-gray-600">Web: {entityWebsite}</p>}
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
                    <th className="text-right p-2 font-bold text-emerald-900">Amount</th>
                    <th className="text-right p-2 font-bold text-emerald-900">Amount (AED)</th>
                    <th className="text-center p-2 font-bold text-emerald-900">Status</th>
                    <th className="text-center p-2 font-bold text-emerald-900">Payment Date</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={type === "invoices" ? 8 : 7} className="text-center py-6 text-gray-400">No records</td></tr>
              ) : records.map((r, i) => (
                <tr key={r.id || i} className="border-b border-gray-100">
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
            <span className="w-36 text-right">
              {showDual && <p className="font-semibold">{origCurrency} {fmt(outOrig)}</p>}
              <p className={showDual ? "text-gray-400" : "font-medium"}>AED {fmt(outAed)}</p>
            </span>
          </div>
          <div className="flex gap-10 text-xs">
            <span className="text-gray-500 w-28 text-right">Paid</span>
            <span className="w-36 text-right">
              {showDual && <p className="font-semibold">{origCurrency} {fmt(paidOrig)}</p>}
              <p className={showDual ? "text-gray-400" : "font-medium"}>AED {fmt(paidAed)}</p>
            </span>
          </div>
          <div className="flex gap-10 text-sm font-bold border-t border-gray-200 pt-1.5 mt-1">
            <span className="w-28 text-right">Grand Total</span>
            <span className="w-36 text-right">
              {showDual && <p>{origCurrency} {fmt(totalOrig)}</p>}
              <p className={showDual ? "text-gray-500 text-xs font-normal" : ""}>AED {fmt(totalAed)}</p>
            </span>
          </div>
        </div>
      </div>

      {/* Footer — pushed to bottom via flex */}
      <div className="mt-auto pt-6 border-t border-gray-200 text-center text-[10px] text-gray-400">
        Generated on {format(new Date(), "dd/MM/yy")}
      </div>
    </div>
  );
}

/* ── statement preview modal ────────────────────────────────────────────── */

function StatementPreviewModal({ open, onClose, type, entity, companySettings, records, dateFrom, dateTo, statusFilter }) {
  const handlePrint = useCallback(() => {
    const html = buildStatementHtml({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const pw = window.open(url, "_blank");
    if (!pw) {
      alert("Please allow popups in your browser to use Print / Save PDF.");
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, [type, entity, companySettings, records, dateFrom, dateTo, statusFilter]);

  const handleExportXlsx = useCallback(() => {
    exportStatementToXLSX({ type, entity, companySettings, records, dateFrom, dateTo, statusFilter });
  }, [type, entity, companySettings, records, dateFrom, dateTo, statusFilter]);

  const statementProps = { type, entity, companySettings, records, dateFrom, dateTo, statusFilter };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-2">
            <span>Statement of Account Preview</span>
            <div className="flex gap-2">
              <Button  onClick={handlePrint} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                <Printer className="w-4 h-4 mr-1.5" />
                Print / Save PDF
              </Button>
              <Button  variant="outline" onClick={handleExportXlsx}>
                <Download className="w-4 h-4 mr-1.5" />
                Export to XLSX
              </Button>
              <Button  variant="outline" onClick={onClose}>
                <X className="w-4 h-4 mr-1.5" />
                Close
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="border rounded-lg p-6 bg-white">
          <StatementLayout {...statementProps} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Invoices section ───────────────────────────────────────────────────── */

function InvoicesSection({ invoices, customers, companySettings }) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [statusFilter, setStatusFilter] = useState<any>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showStatement, setShowStatement] = useState(false);

  const eligibleCustomers = useMemo(() => {
    const ids = new Set(
      invoices.map((inv) => inv.customer_id ?? inv.customerId).filter(Boolean).map(String)
    );
    return (customers || [])
      .filter((c) => ids.has(String(c.id)))
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
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
    if (!selectedCustomerId) return [];
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r) => {
      if (r._customerId !== selectedCustomerId) return false;
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
    setSelectedCustomerId(val);
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
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
    ? `SOA_${(selectedCustomer.name || "customer").replace(/\s+/g, "_")}`
    : "SOA";

  const hasActiveFilters = selectedCustomerId || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Customer</label>
          <EntityCombobox
            items={eligibleCustomers}
            value={selectedCustomerId}
            onValueChange={handleCustomerChange}
            placeholder="Search customer…"
            allLabel="All Customers"
          />
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
          <Button variant="ghost"  className="text-gray-500 self-end"
            onClick={() => { setSelectedCustomerId(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-end gap-2">
          <Button
            
            disabled={!selectedCustomerId}
            onClick={() => setShowStatement(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
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
                  {selectedCustomerId
                    ? "No invoices match the current filters"
                    : "Search and select a customer to view their invoices"}
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
      />
    </>
  );
}

/* ── Purchase Orders section ────────────────────────────────────────────── */

function PurchaseOrdersSection({ purchaseOrders, companySettings }) {
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [statusFilter, setStatusFilter] = useState<any>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showStatement, setShowStatement] = useState(false);

  const { data: allBrands = [] } = useQuery<any[]>({
    queryKey: ["/api/brands"],
    staleTime: 5 * 60 * 1000,
  });

  const eligibleBrands = useMemo(() => {
    const brandMap = new Map();
    purchaseOrders.forEach((po) => {
      const id = po.brandId || po.brand_id;
      const name = po.brandName || po.brand_name;
      if (id && name) brandMap.set(String(id), { id: String(id), name });
    });
    return Array.from(brandMap.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [purchaseOrders]);

  const selectedBrand = useMemo(() => {
    const base = eligibleBrands.find((b) => b.id === selectedBrandId) || null;
    if (!base) return null;
    const full = allBrands.find((b) => String(b.id) === base.id);
    return full ? { ...base, ...full } : base;
  }, [eligibleBrands, selectedBrandId, allBrands]);

  const enriched = useMemo(() => {
    return purchaseOrders.map((po) => {
      const origAmt = parseFloat(po.totalAmount || po.total_amount || 0);
      const currency = po.currency || "AED";
      const storedRate = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
      const rate = !isNaN(storedRate) && storedRate > 0 ? storedRate : getRateToAed(currency, companySettings);
      const aed = currency === "AED" ? origAmt : origAmt * rate;
      const ps = (po.paymentStatus || po.payment_status || "outstanding").toLowerCase();
      return {
        ...po,
        _origAmount: origAmt,
        _currency: currency,
        _aed: aed,
        _paymentStatus: ps,
        _ref: po.poNumber || po.po_number || "",
        _brand: po.brandName || po.brand_name || "",
        _brandId: String(po.brandId || po.brand_id || ""),
        _date: po.orderDate || po.order_date || "",
        _paymentDate: po.paymentMadeDate || po.payment_made_date || "",
        _remarks: po.paymentRemarks || po.payment_remarks || "",
      };
    });
  }, [purchaseOrders, companySettings]);

  const filtered = useMemo(() => {
    if (!selectedBrandId) return [];
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r) => {
      if (r._brandId !== selectedBrandId) return false;
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
  }, [enriched, selectedBrandId, statusFilter, dateFrom, dateTo]);

  const handleBrandChange = (val) => {
    setSelectedBrandId(val);
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const exportData = filtered.map((r) => ({
    po_number: r._ref,
    brand: r._brand,
    order_date: fmtDate(r._date),
    amount_orig: `${r._currency} ${fmt(r._origAmount)}`,
    amount_aed: `AED ${fmt(r._aed)}`,
    payment_status: r._paymentStatus === "paid" ? "Paid" : "Outstanding",
    payment_date: fmtDate(r._paymentDate),
    remarks: r._remarks,
  }));

  const exportFilename = selectedBrand
    ? `SOA_${(selectedBrand.name || "brand").replace(/\s+/g, "_")}`
    : "SOA";

  const hasActiveFilters = selectedBrandId || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Brand</label>
          <EntityCombobox
            items={eligibleBrands}
            value={selectedBrandId}
            onValueChange={handleBrandChange}
            placeholder="Search brand…"
            allLabel="All Brands"
          />
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
          <Button variant="ghost"  className="text-gray-500 self-end"
            onClick={() => { setSelectedBrandId(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-end gap-2">
          <Button
            
            disabled={!selectedBrandId}
            onClick={() => setShowStatement(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
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
              brand: "Brand",
              order_date: "Order Date",
              amount_orig: "Amount",
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
              <TableHead className="font-semibold">Brand</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Currency</TableHead>
              <TableHead className="font-semibold text-right">Amount</TableHead>
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
                  {selectedBrandId
                    ? "No purchase orders match the current filters"
                    : eligibleBrands.length === 0
                      ? "No brands with purchase orders found"
                      : "Search and select a brand to view their purchase orders"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-purple-700">{r._ref}</TableCell>
                  <TableCell>{r._brand}</TableCell>
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
        entity={selectedBrand}
        companySettings={companySettings}
        records={filtered}
        dateFrom={dateFrom}
        dateTo={dateTo}
        statusFilter={statusFilter}
      />
    </>
  );
}

/* ── main export ────────────────────────────────────────────────────────── */

export default function StatementsTab({ invoices, purchaseOrders, customers, companySettings, suppliers, books }: any) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Generate statements of account for customers (invoices) and brands (purchase orders).
        Search and select an entity, apply filters, then click{" "}
        <strong>Generate Statement</strong> to preview and print.
      </p>

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
          companySettings={companySettings}
        />
      </CollapsibleSection>
    </div>
  );
}
