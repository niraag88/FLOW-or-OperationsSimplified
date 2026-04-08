import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Edit2, Download } from "lucide-react";
import { formatDate } from "@/utils/dateUtils";
import { formatCurrency } from "@/utils/currency";
import { useToast } from "@/hooks/use-toast";
import { exportQuotationToXLSX } from "../utils/export";

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  submitted: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  converted: "bg-purple-100 text-purple-800",
  invoiced: "bg-purple-100 text-purple-800",
  expired: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-800",
};

function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

const NON_EDITABLE_STATUSES = ['accepted', 'rejected', 'invoiced', 'converted'];

export default function QuotationQuickViewModal({ quotationId, open, onClose, canEdit, canOverride, onEdit }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !quotationId) return;
    setDetail(null);
    setLoading(true);
    fetch(`/api/quotations/${quotationId}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch(() => toast({ title: "Error", description: "Could not load quotation details.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, quotationId]);

  const handleViewPrint = () => {
    if (!quotationId) return;
    window.open(`/quotations/${quotationId}/print`, "_blank");
  };

  const handleExportXLSX = async () => {
    if (!detail) return;
    try {
      await exportQuotationToXLSX(detail);
      toast({ title: "Export Successful", description: `Quotation ${detail.quoteNumber} exported to Excel.` });
    } catch {
      toast({ title: "Export Failed", description: "Failed to export quotation to Excel.", variant: "destructive" });
    }
  };

  const handleEdit = () => {
    if (onEdit && detail) {
      onEdit(detail);
      onClose();
    }
  };

  const canActOnQuotation = canEdit && (canOverride || !NON_EDITABLE_STATUSES.includes(detail?.status || ''));

  const subtotal = parseFloat(detail?.totalAmount ?? 0);
  const vatAmount = parseFloat(detail?.vatAmount ?? 0);
  const grandTotal = parseFloat(detail?.grandTotal ?? 0);

  const vatPct = subtotal > 0 && vatAmount > 0
    ? `${(vatAmount / subtotal * 100).toFixed(0)}%`
    : detail?.items?.[0]?.vatRate != null
      ? `${(parseFloat(detail.items[0].vatRate) * 100).toFixed(0)}%`
      : '0%';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <>
                <span className="font-bold text-lg">{detail?.quoteNumber || '—'}</span>
                {detail?.status && (
                  <Badge className={`${STATUS_COLORS[detail.status] || STATUS_COLORS.draft} border text-xs`}>
                    {detail.status.toUpperCase()}
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

            {/* ── Quotation Details ── */}
            <Section title="Quotation Details">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Customer</span>
                  <span className="font-medium">{detail.customerName || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Quote Date</span>
                  <span className="font-medium">{formatDate(detail.quoteDate) || '—'}</span>
                </div>
                {detail.validUntil && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Valid Until</span>
                    <span className="font-medium">{formatDate(detail.validUntil)}</span>
                  </div>
                )}
                {detail.reference && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Reference</span>
                    <span className="font-medium">{detail.reference}</span>
                  </div>
                )}
                {detail.referenceDate && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Ref Date</span>
                    <span className="font-medium">{formatDate(detail.referenceDate)}</span>
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
                          <TableCell className="text-sm text-gray-600">{item.brandName || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.productCode || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.description || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.size || '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">
                            {parseFloat(item.unitPrice || 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {parseFloat(item.lineTotal || 0).toFixed(2)}
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
                      <span>VAT ({vatPct})</span>
                      <span className="w-28 text-right">{formatCurrency(vatAmount, 'AED')}</span>
                    </div>
                    <div className="flex justify-end gap-6 text-sm font-bold border-t border-gray-200 pt-1.5 mt-1">
                      <span>Grand Total</span>
                      <span className="w-28 text-right">{formatCurrency(grandTotal, 'AED')}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No line items recorded.</p>
              )}
            </Section>

            {/* ── Remarks ── */}
            {detail.showRemarks && detail.notes && (
              <>
                <Separator />
                <Section title="Remarks">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{detail.notes}</p>
                </Section>
              </>
            )}

          </div>
        )}

        {/* ── Footer Actions ── */}
        {!loading && detail && (
          <div className="flex items-center justify-end gap-2 pt-4 border-t mt-2">
            {canActOnQuotation && (
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
