import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ExternalLink, Paperclip, Eye, Edit2, Download } from "lucide-react";
import { formatDate } from "@/utils/dateUtils";
import { formatCurrency } from "@/utils/currency";
import { useToast } from "@/hooks/use-toast";
import { exportInvoiceToXLSX } from "../utils/export";

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  sent: "bg-blue-100 text-blue-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const PAYMENT_COLORS = {
  paid: "bg-green-100 text-green-800 border-green-200",
  outstanding: "bg-amber-100 text-amber-800 border-amber-200",
};

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

function DocLink({ label, scanKey, onView }) {
  return (
    <button
      onClick={() => onView(scanKey)}
      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline transition-colors"
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span>{label}</span>
      <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
    </button>
  );
}

export default function InvoiceQuickViewModal({ invoiceId, open, onClose, canEdit, canOverride, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !invoiceId) return;
    setDetail(null);
    setLoading(true);
    fetch(`/api/invoices/${invoiceId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch(() => toast({ title: "Error", description: "Could not load invoice details.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, invoiceId]);

  const handleViewDoc = async (scanKey) => {
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get link");
      window.open(data.url, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not retrieve the document.", variant: "destructive" });
    }
  };

  const handleViewPrint = () => {
    if (!invoiceId) return;
    window.open(`/invoices/${invoiceId}/print`, "_blank");
  };

  const handleExportXLSX = async () => {
    if (!detail) return;
    try {
      await exportInvoiceToXLSX(detail);
      toast({ title: "Export Successful", description: `Invoice ${detail.invoice_number} exported to Excel.` });
    } catch {
      toast({ title: "Export Failed", description: "Failed to export invoice to Excel.", variant: "destructive" });
    }
  };

  const handleEdit = () => {
    if (onEdit && detail) {
      onEdit(detail);
      onClose();
    }
  };

  const isCancelled = detail?.status === 'cancelled';
  const ps = detail?.payment_status || 'outstanding';
  const canActOnInvoice = canEdit && !isCancelled && (canOverride || ['draft', 'submitted'].includes(detail?.status || ''));
  const subtotal = detail?.subtotal ?? 0;
  const vatAmount = detail?.tax_amount ?? 0;
  const totalAmount = detail?.total_amount ?? 0;

  const getDocFilename = (scanKey) => {
    if (!scanKey) return 'Attachment';
    const last = scanKey.split('/').pop() || '';
    const stripped = last.replace(/^\d{10,}-/, '');
    return (stripped && stripped.includes('.')) ? stripped : 'Attachment';
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <>
                <span className="font-bold text-lg">{detail?.invoice_number || '—'}</span>
                {detail?.status && (
                  <Badge className={`${STATUS_COLORS[detail.status] || STATUS_COLORS.draft} border text-xs`}>
                    {detail.status.toUpperCase()}
                  </Badge>
                )}
                {!isCancelled && (
                  <Badge className={`${PAYMENT_COLORS[ps] || PAYMENT_COLORS.outstanding} border text-xs`}>
                    {ps.toUpperCase()}
                  </Badge>
                )}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-4 py-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
          </div>
        )}

        {!loading && detail && (
          <div className="space-y-6 pt-1">

            {/* ── Invoice Details ── */}
            <Section title="Invoice Details">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Customer</span>
                  <span className="font-medium">{detail.customer_name || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Invoice Date</span>
                  <span className="font-medium">{formatDate(detail.invoice_date) || '—'}</span>
                </div>
                {detail.customer?.trn_number && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Customer TRN</span>
                    <span className="font-medium">{detail.customer.trn_number}</span>
                  </div>
                )}
                {detail.customer?.address && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Address</span>
                    <span className="text-gray-700">{detail.customer.address}</span>
                  </div>
                )}
                {detail.reference && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Reference</span>
                    <span className="font-medium">{detail.reference}</span>
                  </div>
                )}
                {detail.reference_date && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Ref Date</span>
                    <span className="font-medium">{formatDate(detail.reference_date)}</span>
                  </div>
                )}
              </div>
            </Section>

            <Separator />

            {/* ── Line Items ── */}
            <Section title="Line Items">
              {detail.items && detail.items.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-28">Brand</TableHead>
                        <TableHead className="w-24">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-20">Size</TableHead>
                        <TableHead className="w-14 text-right">Qty</TableHead>
                        <TableHead className="w-28 text-right">Unit Price (AED)</TableHead>
                        <TableHead className="w-28 text-right">Line Total (AED)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((item, idx) => (
                        <TableRow key={item.id || idx}>
                          <TableCell className="text-sm text-gray-600">{item.brand_name || '—'}</TableCell>
                          <TableCell className="text-sm font-mono text-gray-600">{item.product_code || '—'}</TableCell>
                          <TableCell className="text-sm font-medium">{item.product_name || item.description || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.size || '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">
                            {parseFloat(item.unit_price || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {parseFloat(item.line_total || 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Totals */}
                  <div className="px-4 py-3 bg-gray-50 border-t space-y-1.5">
                    <div className="flex justify-end gap-6 text-sm text-gray-600">
                      <span>Subtotal</span>
                      <span className="w-28 text-right">{formatCurrency(subtotal, 'AED')}</span>
                    </div>
                    <div className="flex justify-end gap-6 text-sm text-gray-600">
                      <span>VAT ({detail.tax_rate != null ? `${(detail.tax_rate * 100).toFixed(0)}%` : vatAmount > 0 && subtotal > 0 ? `${(vatAmount / subtotal * 100).toFixed(0)}%` : '0%'})</span>
                      <span className="w-28 text-right">{formatCurrency(vatAmount, 'AED')}</span>
                    </div>
                    <div className="flex justify-end gap-6 text-sm font-bold border-t border-gray-200 pt-1.5 mt-1">
                      <span>Grand Total</span>
                      <span className="w-28 text-right">{formatCurrency(totalAmount, 'AED')}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No line items recorded.</p>
              )}
            </Section>

            {/* ── Payment Details (if paid) ── */}
            {!isCancelled && ps === 'paid' && (
              <>
                <Separator />
                <Section title="Payment Details">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="text-gray-500 w-32 shrink-0">Payment Date</span>
                      <span className="font-medium">
                        {formatDate(detail.paymentReceivedDate || detail.payment_received_date) || '—'}
                      </span>
                    </div>
                    {(detail.paymentRemarks || detail.payment_remarks) && (
                      <div className="flex gap-2">
                        <span className="text-gray-500 w-32 shrink-0">Remarks</span>
                        <span className="text-gray-700">
                          {detail.paymentRemarks || detail.payment_remarks}
                        </span>
                      </div>
                    )}
                  </div>
                </Section>
              </>
            )}

            {/* ── Remarks ── */}
            {detail.remarks && (
              <>
                <Separator />
                <Section title="Remarks">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{detail.remarks}</p>
                </Section>
              </>
            )}

            {/* ── Attachment ── */}
            <Separator />
            <Section title="Attachment">
              {detail.scan_key ? (
                <div className="flex items-center gap-2 p-2.5 rounded-md border bg-gray-50 hover:bg-gray-100 transition-colors">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <DocLink
                    label={getDocFilename(detail.scan_key)}
                    scanKey={detail.scan_key}
                    onView={handleViewDoc}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No attachment on this invoice.</p>
              )}
            </Section>

          </div>
        )}

        {/* ── Footer Actions ── */}
        {!loading && detail && (
          <div className="flex items-center justify-end gap-2 pt-4 border-t mt-2">
            {canActOnInvoice && (
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExportXLSX}>
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export XLSX
            </Button>
            <Button size="sm" onClick={handleViewPrint} className="bg-purple-600 hover:bg-purple-700 text-white">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              View & Print
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
