import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Pencil, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/currency";

export default function MarkPOPaidDialog({ open, onClose, po, onSuccess }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentMadeDate, setPaymentMadeDate] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [reconciledTotal, setReconciledTotal] = useState(null);

  const isEditing = !!(po?.paymentMadeDate || po?.payment_made_date);

  useEffect(() => {
    if (open && po) {
      const existingDate = po.paymentMadeDate || po.payment_made_date;
      if (existingDate) {
        try {
          setPaymentMadeDate(new Date(existingDate).toISOString().split('T')[0]);
        } catch {
          setPaymentMadeDate(new Date().toISOString().split('T')[0]);
        }
      } else {
        setPaymentMadeDate(new Date().toISOString().split('T')[0]);
      }
      setPaymentRemarks(po.paymentRemarks || po.payment_remarks || "");
      fetchReconciledTotal(po.id);
    }
  }, [open, po]);

  const fetchReconciledTotal = async (poId) => {
    try {
      const res = await fetch(`/api/purchase-orders/${poId}/items`, { credentials: 'include' });
      if (!res.ok) return;
      const items = await res.json();
      const hasReceived = items.some(i => (i.receivedQuantity ?? 0) > 0);
      if (!hasReceived) {
        setReconciledTotal(null);
        return;
      }
      const total = items.reduce((sum, item) => {
        return sum + ((item.receivedQuantity ?? 0) * (parseFloat(item.unitPrice) || 0));
      }, 0);
      setReconciledTotal(total);
    } catch {
      setReconciledTotal(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!po) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paymentStatus: 'paid',
          paymentMadeDate: paymentMadeDate || null,
          paymentRemarks: paymentRemarks || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update payment status');
      }
      toast({
        title: isEditing ? 'Payment Updated' : 'Payment Recorded',
        description: `PO ${po.poNumber || po.po_number} payment details saved.`,
      });
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving PO payment:", error);
      toast({ title: 'Error', description: error.message || 'Failed to save payment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!po) return null;

  const currency = po.currency || 'GBP';
  const fxRate = parseFloat(po.fxRateToAed) || 4.85;
  const orderedTotal = parseFloat(po.totalAmount) || 0;
  const reconciledAed = reconciledTotal !== null
    ? (currency === 'AED' ? reconciledTotal : reconciledTotal * fxRate)
    : null;
  const isShortDelivery = reconciledTotal !== null && reconciledTotal < orderedTotal - 0.001;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing
              ? <Pencil className="w-5 h-5 text-blue-600" />
              : <CheckCircle className="w-5 h-5 text-green-600" />}
            {isEditing ? 'Edit Payment Details' : 'Mark as Paid'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update payment details for purchase order ${po.poNumber || po.po_number}`
              : `Record payment for purchase order ${po.poNumber || po.po_number}`}
          </DialogDescription>
        </DialogHeader>

        {/* Reconciliation summary */}
        {reconciledTotal !== null && (
          <div className={`rounded-lg border p-3 text-sm ${isShortDelivery ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
            <div className="flex items-center gap-1.5 mb-2">
              {isShortDelivery
                ? <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                : <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
              <span className={`font-medium text-xs ${isShortDelivery ? 'text-amber-800' : 'text-green-800'}`}>
                {isShortDelivery ? 'Short Delivery — Reconciled Payable Amount' : 'Full Delivery — Reconciled Payable Amount'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs text-gray-600 mb-1">
              <span>Ordered:</span>
              <span className="font-medium">{formatCurrency(orderedTotal, currency)}</span>
            </div>
            <div className={`flex justify-between items-center text-xs mb-1 font-semibold ${isShortDelivery ? 'text-amber-800' : 'text-green-800'}`}>
              <span>Reconciled payable:</span>
              <span>{formatCurrency(reconciledTotal, currency)}</span>
            </div>
            {currency !== 'AED' && (
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>Reconciled (AED):</span>
                <span>{formatCurrency(reconciledAed, 'AED')}</span>
              </div>
            )}
            {isShortDelivery && (
              <p className="text-xs text-amber-700 mt-1.5 italic">
                Note: Payment should be based on the reconciled amount above, not the original order total.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment_made_date">Payment Made Date *</Label>
            <Input
              id="payment_made_date"
              type="date"
              value={paymentMadeDate}
              onChange={(e) => setPaymentMadeDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="po_payment_remarks">Remarks <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Textarea
              id="po_payment_remarks"
              value={paymentRemarks}
              onChange={(e) => setPaymentRemarks(e.target.value)}
              placeholder="e.g. bank transfer, cheque, wire payment..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !paymentMadeDate}
              className={isEditing ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}
            >
              {loading ? "Saving..." : isEditing ? "Save Changes" : "Mark as Paid"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
