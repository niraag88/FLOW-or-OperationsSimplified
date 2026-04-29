
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCard, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const STALE_3MIN = 3 * 60 * 1000;
const TODAY = new Date().toISOString().slice(0, 10);

interface GRNRow {
  id: number;
  receiptNumber: string;
  poId: number;
  poNumber?: string;
  supplierName?: string;
  poBrandName?: string;
  receivedDate: string;
  referenceNumber?: string | null;
  referenceAmount?: number;
  poCurrency?: string;
  poFxRateToAed?: string | number | null;
  paymentStatus?: string | null;
  paymentMadeDate?: string | null;
  paymentRemarks?: string | null;
}

interface GRNPaymentsLedgerProps {
  canEdit: boolean;
}

function paymentBadge(status: string | null | undefined) {
  const s = status || "outstanding";
  if (s === "paid") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 bg-green-100 border border-green-300 rounded px-1.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" />Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5">
      <Clock className="w-3 h-3" />Outstanding
    </span>
  );
}

function getAedAmount(grn: GRNRow): number {
  const amount = Number(grn.referenceAmount ?? 0);
  const currency = grn.poCurrency || "GBP";
  if (currency === "AED") return amount;
  const rate = parseFloat(String(grn.poFxRateToAed));
  if (!rate) return 0;
  return amount * rate;
}

function fmtAmt(value: number, currency = "AED") {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function GRNPaymentsLedger({ canEdit }: GRNPaymentsLedgerProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "outstanding" | "paid">("outstanding");
  const [paymentDialogGrn, setPaymentDialogGrn] = useState<GRNRow | null>(null);
  const [paymentDate, setPaymentDate] = useState(TODAY);
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const { data: grns = [], isLoading } = useQuery<GRNRow[]>({
    queryKey: ["/api/goods-receipts"],
    staleTime: STALE_3MIN,
    refetchOnWindowFocus: true,
  });

  const filtered = (grns as GRNRow[]).filter((grn) => {
    if (filterStatus === "all") return true;
    return (grn.paymentStatus || "outstanding") === filterStatus;
  });

  const outstandingCount = (grns as GRNRow[]).filter(
    (g) => (g.paymentStatus || "outstanding") === "outstanding"
  ).length;

  const openPaymentDialog = (grn: GRNRow) => {
    setPaymentDialogGrn(grn);
    setPaymentDate(grn.paymentMadeDate || TODAY);
    setPaymentRemarks(grn.paymentRemarks || "");
  };

  const closeDialog = () => {
    setPaymentDialogGrn(null);
    setPaymentDate(TODAY);
    setPaymentRemarks("");
  };

  const handleSavePayment = async (newStatus: "paid" | "outstanding") => {
    if (!paymentDialogGrn) return;
    if (newStatus === "paid" && !paymentDate) {
      toast({ title: "Payment date is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/goods-receipts/${paymentDialogGrn.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          paymentStatus: newStatus,
          paymentMadeDate: newStatus === "paid" ? paymentDate : null,
          paymentRemarks: paymentRemarks || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update payment");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      closeDialog();
      toast({
        title: newStatus === "paid" ? "Payment recorded" : "Marked as outstanding",
        description:
          newStatus === "paid"
            ? `${paymentDialogGrn.receiptNumber} marked as paid on ${format(new Date(paymentDate), "dd/MM/yy")}.`
            : `${paymentDialogGrn.receiptNumber} reset to outstanding.`,
      });
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Could not update payment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payments Ledger
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Record and track payments against goods receipts.
                {outstandingCount > 0 && (
                  <span className="ml-2 font-medium text-amber-700">
                    {outstandingCount} outstanding
                  </span>
                )}
              </p>
            </div>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as "all" | "outstanding" | "paid")}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              <CreditCard className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-semibold">
                {filterStatus === "outstanding"
                  ? "No outstanding payments"
                  : filterStatus === "paid"
                  ? "No paid receipts"
                  : "No goods receipts yet"}
              </p>
              <p className="text-sm mt-1">
                {filterStatus === "outstanding"
                  ? "All goods receipts have been paid."
                  : "Change the filter to see other records."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "110px" }}>GRN #</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "110px" }}>PO #</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "130px" }}>Brand</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "95px" }}>Received</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "110px" }}>Reference #</th>
                    <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground" style={{ width: "110px" }}>Amount</th>
                    <th className="h-10 px-3 text-right align-middle font-medium text-muted-foreground" style={{ width: "110px" }}>Amount (AED)</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "105px" }}>Status</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "95px" }}>Payment Date</th>
                    <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "140px" }}>Remarks</th>
                    {canEdit && (
                      <th className="h-10 px-3 text-left align-middle font-medium text-muted-foreground" style={{ width: "90px" }}></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((grn) => {
                    const isPaid = (grn.paymentStatus || "outstanding") === "paid";
                    const currency = grn.poCurrency || "GBP";
                    const refAmount = Number(grn.referenceAmount ?? 0);
                    const aedAmount = getAedAmount(grn);
                    return (
                      <tr key={grn.id} className="border-b transition-colors hover:bg-muted/30">
                        <td className="p-3 align-middle font-medium" style={{ width: "110px" }}>
                          {grn.receiptNumber}
                        </td>
                        <td className="p-3 align-middle font-medium" style={{ width: "110px" }}>
                          {grn.poNumber || `PO#${grn.poId}`}
                        </td>
                        <td className="p-3 align-middle truncate" style={{ width: "130px" }}>
                          {grn.supplierName || grn.poBrandName || "—"}
                        </td>
                        <td className="p-3 align-middle" style={{ width: "95px" }}>
                          {grn.receivedDate
                            ? format(new Date(grn.receivedDate), "dd/MM/yy")
                            : "—"}
                        </td>
                        <td className="p-3 align-middle text-gray-600 text-xs" style={{ width: "110px" }}>
                          {grn.referenceNumber || "—"}
                        </td>
                        <td className="p-3 align-middle text-right tabular-nums" style={{ width: "110px" }}>
                          {refAmount > 0 ? fmtAmt(refAmount, currency) : "—"}
                        </td>
                        <td className="p-3 align-middle text-right tabular-nums" style={{ width: "110px" }}>
                          {aedAmount > 0 ? fmtAmt(aedAmount, "AED") : "—"}
                        </td>
                        <td className="p-3 align-middle" style={{ width: "105px" }}>
                          {paymentBadge(grn.paymentStatus)}
                        </td>
                        <td className="p-3 align-middle text-sm text-gray-600" style={{ width: "95px" }}>
                          {grn.paymentMadeDate ? format(new Date(grn.paymentMadeDate), "dd/MM/yy") : "—"}
                        </td>
                        <td className="p-3 align-middle text-xs text-gray-500 truncate" style={{ width: "140px" }} title={grn.paymentRemarks || ""}>
                          {grn.paymentRemarks || "—"}
                        </td>
                        {canEdit && (
                          <td className="p-3 align-middle" style={{ width: "90px" }}>
                            <Button
                              size="sm"
                              variant={isPaid ? "outline" : "default"}
                              className={
                                isPaid
                                  ? "h-7 text-xs"
                                  : "h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                              }
                              onClick={() => openPaymentDialog(grn)}
                            >
                              {isPaid ? "Edit" : "Record Payment"}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={!!paymentDialogGrn} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {(paymentDialogGrn?.paymentStatus || "outstanding") === "paid"
                ? "Edit Payment"
                : "Record Payment"}{" "}
              — {paymentDialogGrn?.receiptNumber}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {paymentDialogGrn && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded-md p-3 space-y-1">
                <div className="flex justify-between">
                  <span>PO</span>
                  <span className="font-medium">{paymentDialogGrn.poNumber || `#${paymentDialogGrn.poId}`}</span>
                </div>
                <div className="flex justify-between">
                  <span>Brand</span>
                  <span className="font-medium">{paymentDialogGrn.supplierName || paymentDialogGrn.poBrandName || "—"}</span>
                </div>
                {Number(paymentDialogGrn.referenceAmount) > 0 && (
                  <div className="flex justify-between">
                    <span>Amount</span>
                    <span className="font-medium">
                      {fmtAmt(Number(paymentDialogGrn.referenceAmount), paymentDialogGrn.poCurrency || "GBP")}
                      {" "}
                      <span className="text-gray-400 text-xs">
                        ({fmtAmt(getAedAmount(paymentDialogGrn), "AED")})
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payment-date">
                Payment Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                max={TODAY}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-remarks">Remarks (optional)</Label>
              <Textarea
                id="payment-remarks"
                placeholder="e.g. Wire transfer ref TT-20240415, bank: Mashreq..."
                value={paymentRemarks}
                onChange={(e) => setPaymentRemarks(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
            {(paymentDialogGrn?.paymentStatus || "outstanding") === "paid" && (
              <Button
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50"
                disabled={saving}
                onClick={() => handleSavePayment("outstanding")}
              >
                Mark as Outstanding
              </Button>
            )}
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={saving || !paymentDate}
              onClick={() => handleSavePayment("paid")}
            >
              {saving ? "Saving…" : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
