import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, CreditCard, TrendingUp, TrendingDown, Search } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { getRateToAed } from "@/utils/currency";

const fmt = (v: any) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function fmtDate(val: any) {
  if (!val) return "—";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return format(d, 'dd/MM/yy');
  } catch {
    return "—";
  }
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === "paid") {
    return <Badge className="bg-green-100 text-green-800 border-green-300 font-medium text-xs">Paid</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-medium text-xs">Outstanding</Badge>;
}

function SummaryTiles({ records, label }: { records: any[]; label: string }) {
  const totals = useMemo(() => {
    const byCurrency: Record<string, any> = {};
    let totalAed = 0;
    let paidCount = 0;
    let paidAed = 0;
    let outstandingCount = 0;
    let outstandingAed = 0;

    records.forEach((r: any) => {
      const amt = r._aed;
      const cur = r._currency || "AED";
      const origAmt = r._origAmount;
      const ps = r._paymentStatus;

      totalAed += amt;
      if (ps === "paid") {
        paidCount++;
        paidAed += amt;
      } else {
        outstandingCount++;
        outstandingAed += amt;
        if (!byCurrency[cur]) byCurrency[cur] = 0;
        byCurrency[cur] += origAmt;
      }
    });

    return { totalCount: records.length, totalAed, paidCount, paidAed, outstandingCount, outstandingAed, byCurrency };
  }, [records]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-700">{totals.totalCount}</p>
            <p className="text-sm text-gray-500">Total {label}</p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">AED {fmt(totals.totalAed)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <TrendingDown className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-700">{totals.outstandingCount}</p>
            <p className="text-sm text-gray-500">Outstanding</p>
            <p className="text-xs text-amber-600 font-medium mt-0.5">AED {fmt(totals.outstandingAed)}</p>
            {Object.keys(totals.byCurrency).length > 0 && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(totals.byCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-xs text-gray-500">{cur} {fmt(amt)}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-green-700">{totals.paidCount}</p>
            <p className="text-sm text-gray-500">Paid</p>
            <p className="text-xs text-green-600 font-medium mt-0.5">AED {fmt(totals.paidAed)}</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, iconColor, children, defaultOpen = false }: { title: string; icon: React.ElementType; iconColor: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

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
        {open ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {open && (
        <CardContent className="pt-0 pb-6 px-5">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function LedgerFilters({ paymentFilter, setPaymentFilter, dateFrom, setDateFrom, dateTo, setDateTo, search, setSearch, searchPlaceholder }: { paymentFilter: string; setPaymentFilter: (v: string) => void; dateFrom: string; setDateFrom: (v: string) => void; dateTo: string; setDateTo: (v: string) => void; search: string; setSearch: (v: string) => void; searchPlaceholder: string }) {
  return (
    <div className="flex flex-wrap gap-3 flex-1">
      <Select value={paymentFilter} onValueChange={setPaymentFilter}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Payment Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="outstanding">Outstanding</SelectItem>
          <SelectItem value="paid">Paid</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500 whitespace-nowrap">From</label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-500 whitespace-nowrap">To</label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40"
        />
      </div>

      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      {(paymentFilter !== "all" || dateFrom || dateTo || search) && (
        <Button
          variant="ghost"
                    size="sm"
          onClick={() => { setPaymentFilter("all"); setDateFrom(""); setDateTo(""); setSearch(""); }}
          className="text-gray-500"
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}

function SalesPaymentsSection({ invoices, companySettings, canExport }: { invoices: Record<string, any>[]; companySettings: Record<string, any> | null; canExport: boolean }) {
  const [paymentFilter, setPaymentFilter] = useState<any>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const enriched = useMemo(() => {
    return invoices.map((inv: any) => {
      const origAmount = parseFloat(inv.total_amount || inv.totalAmount || inv.amount || 0);
      const currency = (inv.currency || "AED").toUpperCase();
      const rate = getRateToAed(currency, companySettings);
      const aed = currency === "AED" ? origAmount : origAmount * rate;
      const ps = (inv.paymentStatus || inv.payment_status || "outstanding").toLowerCase();
      return {
        ...inv,
        _origAmount: origAmount,
        _currency: currency,
        _aed: aed,
        _paymentStatus: ps,
        _ref: inv.invoice_number || inv.invoiceNumber || "",
        _customer: inv.customer_name || inv.customerName || "",
        _date: inv.invoice_date || inv.invoiceDate || "",
        _paymentDate: inv.paymentReceivedDate || inv.payment_received_date || "",
        _remarks: inv.paymentRemarks || inv.payment_remarks || "",
      };
    });
  }, [invoices, companySettings]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r: any) => {
      if (paymentFilter !== "all" && r._paymentStatus !== paymentFilter) return false;
      if (r._date && (fromTs || toTs)) {
        const ts = new Date(r._date).getTime();
        if (!isNaN(ts)) {
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        if (!r._ref.toLowerCase().includes(q) && !r._customer.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [enriched, paymentFilter, dateFrom, dateTo, search]);

  const exportData = filtered.map((r: any) => ({
    invoice_number: r._ref,
    customer: r._customer,
    invoice_date: fmtDate(r._date),
    amount_aed: `AED ${fmt(r._aed)}`,
    payment_status: r._paymentStatus === "paid" ? "Paid" : "Outstanding",
    payment_received_date: fmtDate(r._paymentDate),
    payment_remarks: r._remarks,
  }));

  return (
    <>
      <SummaryTiles records={filtered} label="Invoices" />
      <div className="flex items-start justify-between gap-3 mb-5">
        <LedgerFilters
          paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          search={search} setSearch={setSearch}
          searchPlaceholder="Search by invoice # or customer…"
        />
        {canExport && (
          <div className="shrink-0 pt-0.5">
            <ExportDropdown
              data={exportData}
              type="Sales Payments Ledger"
              filename="sales_payments_ledger"
              columns={{
                invoice_number: "Invoice #",
                customer: "Customer",
                invoice_date: "Invoice Date",
                amount_aed: "Amount (AED)",
                payment_status: "Payment Status",
                payment_received_date: "Payment Received Date",
                payment_remarks: "Remarks",
              }}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">Invoice #</TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold">Invoice Date</TableHead>
              <TableHead className="font-semibold text-right">Amount (AED)</TableHead>
              <TableHead className="font-semibold">Payment Status</TableHead>
              <TableHead className="font-semibold">Received Date</TableHead>
              <TableHead className="font-semibold">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-gray-400">
                  No invoices match the current filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-blue-700">{r._ref}</TableCell>
                  <TableCell>{r._customer}</TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._date)}</TableCell>
                  <TableCell className="text-right font-medium">AED {fmt(r._aed)}</TableCell>
                  <TableCell><PaymentStatusBadge status={r._paymentStatus} /></TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._paymentDate)}</TableCell>
                  <TableCell className="text-gray-500 max-w-48 truncate" title={r._remarks}>{r._remarks || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
    </>
  );
}

function PurchasesPaymentsSection({ purchaseOrders, goodsReceipts, suppliers, companySettings, canExport }: { purchaseOrders: Record<string, any>[]; goodsReceipts: Record<string, any>[]; suppliers: Record<string, any>[]; companySettings: Record<string, any> | null; canExport: boolean }) {
  const [paymentFilter, setPaymentFilter] = useState<any>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const getSupplierName = (supplierId: any) => {
    const s = (suppliers || []).find((s: any) => s.id === supplierId || s.id === Number(supplierId));
    return s?.name || "";
  };

  const getFxRate = (po: any) => {
    const stored = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
    if (!isNaN(stored) && stored > 0) return stored;
    return getRateToAed(po.currency || "GBP", companySettings);
  };

  const poMap = useMemo(() => {
    const m: Record<number, any> = {};
    (purchaseOrders || []).forEach((po: any) => { m[po.id] = po; });
    return m;
  }, [purchaseOrders]);

  const enriched = useMemo(() => {
    const grns = goodsReceipts && goodsReceipts.length > 0 ? goodsReceipts : [];
    return grns
      .filter((grn: any) => grn.status !== 'cancelled')
      .map((grn: any) => {
        const poId = grn.poId || grn.po_id;
        const po = poMap[poId];
        const currency = po?.currency || "GBP";
        const rate = po ? getFxRate(po) : 1;
        const refAmt = parseFloat(grn.referenceAmount || 0);
        const refAed = currency === "AED" ? refAmt : refAmt * rate;
        const ps = (po?.paymentStatus || po?.payment_status || "outstanding").toLowerCase();
        const supplierName = po?.supplierName || getSupplierName(po?.supplierId || po?.supplier_id || grn.supplierId || grn.supplier_id);
        return {
          ...grn,
          _poNumber: po?.poNumber || po?.po_number || `PO-${poId}`,
          _currency: currency,
          _origAmount: refAmt,
          _aed: refAed,
          _paymentStatus: ps,
          _supplier: supplierName,
          _date: grn.receivedDate || grn.received_date || "",
          _refNumber: grn.referenceNumber || grn.reference_number || "",
          _refDate: grn.referenceDate || grn.reference_date || "",
          _paymentDate: po?.paymentMadeDate || po?.payment_made_date || "",
          _remarks: po?.paymentRemarks || po?.payment_remarks || "",
        };
      });
  }, [goodsReceipts, poMap, suppliers, companySettings]);

  const filtered = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return enriched.filter((r: any) => {
      if (paymentFilter !== "all" && r._paymentStatus !== paymentFilter) return false;
      if (r._date && (fromTs || toTs)) {
        const ts = new Date(r._date).getTime();
        if (!isNaN(ts)) {
          if (fromTs && ts < fromTs) return false;
          if (toTs && ts > toTs) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        const grnNum = (r.receiptNumber || r.receipt_number || "").toLowerCase();
        if (!grnNum.includes(q) && !r._poNumber.toLowerCase().includes(q) && !r._supplier.toLowerCase().includes(q) && !r._refNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [enriched, paymentFilter, dateFrom, dateTo, search]);

  const exportData = filtered.map((r: any) => ({
    grn_number: r.receiptNumber || r.receipt_number || "",
    po_number: r._poNumber,
    supplier: r._supplier,
    received_date: fmtDate(r._date),
    ref_number: r._refNumber,
    ref_date: fmtDate(r._refDate),
    currency: r._currency,
    ref_amount_orig: r._origAmount > 0 ? fmt(r._origAmount) : "",
    ref_amount_aed: r._aed > 0 ? `AED ${fmt(r._aed)}` : "",
    payment_status: r._paymentStatus === "paid" ? "Paid" : "Outstanding",
    payment_made_date: fmtDate(r._paymentDate),
    payment_remarks: r._remarks,
  }));

  return (
    <>
      <SummaryTiles records={filtered} label="GRNs" />
      <div className="flex items-start justify-between gap-3 mb-5">
        <LedgerFilters
          paymentFilter={paymentFilter} setPaymentFilter={setPaymentFilter}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          search={search} setSearch={setSearch}
          searchPlaceholder="Search by GRN #, PO #, supplier or ref…"
        />
        {canExport && (
          <div className="shrink-0 pt-0.5">
            <ExportDropdown
              data={exportData}
              type="Purchases Payments Ledger"
              filename="purchases_payments_ledger"
              columns={{
                grn_number: "GRN #",
                po_number: "PO #",
                supplier: "Supplier",
                received_date: "Received Date",
                ref_number: "Ref No.",
                ref_date: "Ref Date",
                currency: "Currency",
                ref_amount_orig: "Ref Amount (Original)",
                ref_amount_aed: "Ref Amount (AED)",
                payment_status: "Payment Status",
                payment_made_date: "Payment Made Date",
                payment_remarks: "Remarks",
              }}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">GRN #</TableHead>
              <TableHead className="font-semibold">PO #</TableHead>
              <TableHead className="font-semibold">Supplier</TableHead>
              <TableHead className="font-semibold">Received Date</TableHead>
              <TableHead className="font-semibold">Ref No.</TableHead>
              <TableHead className="font-semibold">Ref Date</TableHead>
              <TableHead className="font-semibold text-right">Ref Amount</TableHead>
              <TableHead className="font-semibold">Payment Status</TableHead>
              <TableHead className="font-semibold">Payment Date</TableHead>
              <TableHead className="font-semibold">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10 text-gray-400">
                  No goods receipts match the current filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r: any) => (
                <TableRow key={r.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-purple-700">{r.receiptNumber || r.receipt_number || `GRN-${r.id}`}</TableCell>
                  <TableCell className="text-gray-600">{r._poNumber}</TableCell>
                  <TableCell>{r._supplier}</TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._date)}</TableCell>
                  <TableCell className="text-gray-700">{r._refNumber || "—"}</TableCell>
                  <TableCell className="text-gray-600">{r._refDate ? fmtDate(r._refDate) : "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {r._origAmount > 0 ? (
                      <span title={`${r._currency} ${fmt(r._origAmount)}`}>AED {fmt(r._aed)}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell><PaymentStatusBadge status={r._paymentStatus} /></TableCell>
                  <TableCell className="text-gray-600">{fmtDate(r._paymentDate)}</TableCell>
                  <TableCell className="text-gray-500 max-w-48 truncate" title={r._remarks}>{r._remarks || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-gray-400 mt-2">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
    </>
  );
}

interface PaymentsLedgerProps {
  invoices: any[];
  purchaseOrders: any[];
  goodsReceipts: any[];
  suppliers: any[];
  companySettings: Record<string, any> | null;
  canExport: boolean;
}

export default function PaymentsLedger({ invoices, purchaseOrders, goodsReceipts, suppliers, companySettings, canExport }: PaymentsLedgerProps) {
  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Sales Payments"
        icon={TrendingUp}
        iconColor="bg-blue-50 text-blue-600"
      >
        <SalesPaymentsSection
          invoices={invoices || []}
          companySettings={companySettings}
          canExport={canExport}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Purchases Payments"
        icon={TrendingDown}
        iconColor="bg-purple-50 text-purple-600"
      >
        <PurchasesPaymentsSection
          purchaseOrders={purchaseOrders || []}
          goodsReceipts={goodsReceipts || []}
          suppliers={suppliers || []}
          companySettings={companySettings}
          canExport={canExport}
        />
      </CollapsibleSection>
    </div>
  );
}
