import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, FileText, ExternalLink, Paperclip, Package, Trash2 } from "lucide-react";
import { formatDate } from "@/utils/dateUtils";
import { formatCurrency } from "@/utils/currency";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  closed: "bg-green-100 text-green-800",
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

export default function POQuickViewModal({ poId, open, onClose }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open || !poId) return;
    setDetail(null);
    setLoading(true);
    fetch(`/api/purchase-orders/${poId}/detail`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => toast({ title: "Error", description: "Could not load PO details.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, poId]);

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

  const handleDeletePoDoc = () => {
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    setConfirmDeleteOpen(false);
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/scan-key`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove document');
      setDetail(prev => prev ? { ...prev, supplierScanKey: null } : prev);
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      toast({ title: 'Document Removed', description: 'The document has been removed from the purchase order.' });
    } catch {
      toast({ title: 'Error', description: 'Could not remove the document.', variant: 'destructive' });
    }
  };

  const currency = detail?.currency || "GBP";
  const recon = detail?.reconciliation;

  // Collect all documents in one list
  const allDocs: any[] = [];
  if (detail?.supplierScanKey) {
    const last = detail.supplierScanKey.split('/').pop() || '';
    const stripped = last.replace(/^\d{10,}-/, '');
    const filename = (stripped && stripped.includes('.')) ? stripped : 'Consolidated Invoice';
    allDocs.push({ label: filename, key: detail.supplierScanKey, isPOLevel: true });
  }
  if (detail?.grns) {
    for (const grn of detail.grns) {
      const label = grn.receiptNumber
        ? `GRN ${grn.receiptNumber}`
        : `GRN ${grn.receivedDate ? formatDate(grn.receivedDate) : grn.id}`;
      if (grn.scanKey1) allDocs.push({ label: `${label} — Document 1`, key: grn.scanKey1 });
      if (grn.scanKey2) allDocs.push({ label: `${label} — Document 2`, key: grn.scanKey2 });
      if (grn.scanKey3) allDocs.push({ label: `${label} — Document 3`, key: grn.scanKey3 });
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            {loading ? (
              <Skeleton className="h-6 w-32" />
            ) : (
              <>
                <span className="font-bold text-lg">{detail?.poNumber}</span>
                {detail?.status && (
                  <Badge className={`${STATUS_COLORS[detail.status] || STATUS_COLORS.draft} border text-xs`}>
                    {detail.status.toUpperCase()}
                  </Badge>
                )}
                {detail?.paymentStatus && (
                  <Badge className={`${PAYMENT_COLORS[detail.paymentStatus] || PAYMENT_COLORS.outstanding} border text-xs`}>
                    {detail.paymentStatus.toUpperCase()}
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

            {/* ── PO Header Info ── */}
            <Section title="Purchase Order Details">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Supplier</span>
                  <span className="font-medium">{detail.supplierName || "—"}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Currency</span>
                  <span className="font-medium">{currency}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 shrink-0">Order Date</span>
                  <span className="font-medium">{formatDate(detail.orderDate) || "—"}</span>
                </div>
                {detail.expectedDelivery && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Expected</span>
                    <span className="font-medium">{formatDate(detail.expectedDelivery)}</span>
                  </div>
                )}
                {detail.notes && (
                  <div className="col-span-2 flex gap-2">
                    <span className="text-gray-500 w-28 shrink-0">Notes</span>
                    <span className="text-gray-700">{detail.notes}</span>
                  </div>
                )}
              </div>
            </Section>

            <Separator />

            {/* ── Line Items ── */}
            <Section title="Items Ordered">
              {detail.items && detail.items.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right w-24">Qty Ordered</TableHead>
                        <TableHead className="text-right w-32">Unit Price</TableHead>
                        <TableHead className="text-right w-32">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.productName || "—"}</div>
                            {item.size && <div className="text-xs text-gray-500">{item.size}</div>}
                            {item.productSku && !item.descriptionOverride && (
                              <div className="text-xs text-gray-400">{item.productSku}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(parseFloat(item.unitPrice) || 0, currency)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatCurrency(parseFloat(item.lineTotal) || 0, currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t">
                    <span className="text-sm font-semibold text-gray-700 mr-4">Original PO Total</span>
                    <span className="text-sm font-bold">
                      {formatCurrency(parseFloat(detail.totalAmount) || 0, currency)}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No line items recorded.</p>
              )}
            </Section>

            {/* ── Items Received (only if GRNs exist) ── */}
            {recon?.hasGrns && detail.items && detail.items.length > 0 && (
              <>
                <Separator />
                <Section title="Items Received">
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right w-24">Qty Received</TableHead>
                          <TableHead className="text-right w-32">Unit Price</TableHead>
                          <TableHead className="text-right w-32">Line Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.items.map((item) => {
                          const receivedQty = parseFloat(item.receivedQuantity) || 0;
                          const orderedQty = parseFloat(item.quantity) || 0;
                          const isShort = orderedQty > 0 && receivedQty < orderedQty;
                          const unitPrice = parseFloat(item.unitPrice) || 0;
                          const receivedLineTotal = receivedQty * unitPrice;
                          return (
                            <TableRow key={item.id} className={isShort ? "bg-amber-50" : ""}>
                              <TableCell>
                                <div className="font-medium text-sm">{item.productName || "—"}</div>
                                {item.size && <div className="text-xs text-gray-500">{item.size}</div>}
                                {item.productSku && !item.descriptionOverride && (
                                  <div className="text-xs text-gray-400">{item.productSku}</div>
                                )}
                              </TableCell>
                              <TableCell className={`text-right text-sm ${isShort ? "text-amber-700 font-medium" : ""}`}>
                                {receivedQty}{isShort ? " ⚠" : ""}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {formatCurrency(unitPrice, currency)}
                              </TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                {formatCurrency(receivedLineTotal, currency)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex justify-end px-4 py-2.5 bg-gray-50 border-t">
                      <span className="text-sm font-semibold text-gray-700 mr-4">Received Total</span>
                      <span className="text-sm font-bold">
                        {formatCurrency(recon.receivedTotal, currency)}
                      </span>
                    </div>
                  </div>
                </Section>
              </>
            )}

            {/* ── Goods Receipts by Date (only if GRNs exist with item detail) ── */}
            {recon?.hasGrns && detail.grns && detail.grns.some((g: any) => g.items && g.items.length > 0) && (
              <>
                <Separator />
                <Section title="Goods Receipts">
                  <div className="space-y-3">
                    {detail.grns.filter((g: any) => g.items && g.items.length > 0).map((grn) => {
                      const grnShort = grn.items.some(
                        i => (parseFloat(i.receivedQuantity) || 0) < (parseFloat(i.orderedQuantity) || 0)
                      );
                      const grnTotal = grn.items.reduce(
                        (s, i) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0
                      );
                      return (
                        <div key={grn.id} className="rounded-md border overflow-hidden">
                          <div className={`flex items-center justify-between px-3 py-2 ${grnShort ? "bg-amber-50 border-b border-amber-100" : "bg-green-50 border-b border-green-100"}`}>
                            <div className="flex items-center gap-2">
                              <Package className="w-3.5 h-3.5 text-gray-500" />
                              <span className="text-sm font-semibold">{grn.receiptNumber || `GRN-${grn.id}`}</span>
                              {grn.receivedDate && (
                                <span className="text-xs text-gray-500">— {formatDate(grn.receivedDate)}</span>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border ${grnShort ? "text-amber-800 bg-amber-100 border-amber-200" : "text-green-800 bg-green-100 border-green-200"}`}>
                              {grnShort ? <><AlertTriangle className="w-3 h-3" /> Short delivery</> : <><CheckCircle2 className="w-3 h-3" /> Full delivery</>}
                            </span>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-gray-50">
                                <TableHead>Product</TableHead>
                                <TableHead className="text-right w-24">Qty Ordered</TableHead>
                                <TableHead className="text-right w-24">Qty Received</TableHead>
                                <TableHead className="text-right w-28">Unit Price</TableHead>
                                <TableHead className="text-right w-28">Received Value</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {grn.items.map((item, idx) => {
                                const recQty = parseFloat(item.receivedQuantity) || 0;
                                const ordQty = parseFloat(item.orderedQuantity) || 0;
                                const price = parseFloat(item.unitPrice) || 0;
                                const isItemShort = recQty < ordQty;
                                return (
                                  <TableRow key={idx} className={isItemShort ? "bg-amber-50/40" : ""}>
                                    <TableCell>
                                      <div className="font-medium text-sm">{item.productName || "—"}</div>
                                      {item.productSize && <div className="text-xs text-gray-500">{item.productSize}</div>}
                                      {item.productSku && <div className="text-xs text-gray-400">{item.productSku}</div>}
                                    </TableCell>
                                    <TableCell className="text-right text-sm text-gray-500">{ordQty}</TableCell>
                                    <TableCell className={`text-right text-sm font-medium ${isItemShort ? "text-amber-700" : ""}`}>{recQty}</TableCell>
                                    <TableCell className="text-right text-sm">{formatCurrency(price, currency)}</TableCell>
                                    <TableCell className="text-right text-sm font-medium">{formatCurrency(recQty * price, currency)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          <div className="flex justify-end px-4 py-2 bg-gray-50 border-t">
                            <span className="text-xs font-semibold text-gray-600 mr-3">Receipt Total</span>
                            <span className="text-xs font-bold">{formatCurrency(grnTotal, currency)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </>
            )}

            {/* ── Reconciliation (only if GRNs exist) ── */}
            {recon?.hasGrns && (
              <>
                <Separator />
                <Section title="Goods Receipt Reconciliation">
                  <div className={`rounded-lg border p-4 ${recon.isShortDelivery ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
                    <div className="flex items-center gap-2 mb-3">
                      {recon.isShortDelivery ? (
                        <>
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-800">Short Delivery</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-800">Fully Delivered</span>
                        </>
                      )}
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Original PO Value</span>
                        <span className="font-medium">{formatCurrency(recon.originalTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Received Value</span>
                        <span className="font-medium">{formatCurrency(recon.receivedTotal, currency)}</span>
                      </div>
                      {recon.isShortDelivery && (
                        <div className="flex justify-between border-t border-amber-200 pt-1.5 mt-1">
                          <span className="text-amber-700 font-medium">Short by</span>
                          <span className="text-amber-700 font-bold">
                            {formatCurrency(recon.difference, currency)}
                          </span>
                        </div>
                      )}
                      <div className={`flex justify-between pt-2 mt-1 border-t ${recon.isShortDelivery ? "border-amber-200" : "border-green-200"}`}>
                        <span className={`font-semibold text-base ${recon.isShortDelivery ? "text-amber-900" : "text-green-900"}`}>
                          Payable Value
                        </span>
                        <span className={`font-bold text-base ${recon.isShortDelivery ? "text-amber-900" : "text-green-900"}`}>
                          {formatCurrency(recon.receivedTotal, currency)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">
                      The original PO value is preserved as issued. Reconciliation shows what was actually received against goods receipts.
                    </p>
                  </div>
                  {/* GRN reference list */}
                  {detail.grns.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {detail.grns.map((grn) => (
                        <div key={grn.id} className="flex items-center gap-2 text-xs text-gray-500">
                          <Package className="w-3 h-3" />
                          <span>
                            {grn.receiptNumber || `GRN-${grn.id}`}
                            {grn.receivedDate ? ` — received ${formatDate(grn.receivedDate)}` : ""}
                            {grn.notes ? ` (${grn.notes})` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}

            {/* ── Documents ── */}
            <Separator />
            <Section title="Supporting Documents">
              {allDocs.length > 0 ? (
                <div className="space-y-2">
                  {allDocs.map((doc, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2.5 rounded-md border bg-gray-50 hover:bg-gray-100 transition-colors">
                      <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <DocLink label={doc.label} scanKey={doc.key} onView={handleViewDoc} />
                      {doc.isPOLevel && (
                        <button
                          onClick={handleDeletePoDoc}
                          className="ml-auto p-1 text-red-400 hover:text-red-600 transition-colors"
                          title="Remove document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No documents attached to this purchase order or its goods receipts.</p>
              )}
            </Section>

          </div>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Document</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the document from this purchase order. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleConfirmDelete}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
