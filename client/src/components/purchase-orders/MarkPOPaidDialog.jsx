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
import { CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MarkPOPaidDialog({ open, onClose, po, onSuccess }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentMadeDate, setPaymentMadeDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRemarks, setPaymentRemarks] = useState("");

  useEffect(() => {
    if (open) {
      setPaymentMadeDate(new Date().toISOString().split('T')[0]);
      setPaymentRemarks("");
    }
  }, [open]);

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
      toast({ title: 'Payment Recorded', description: `PO ${po.poNumber || po.po_number} marked as paid.` });
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error marking PO as paid:", error);
      toast({ title: 'Error', description: error.message || 'Failed to record payment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!po) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Mark as Paid
          </DialogTitle>
          <DialogDescription>
            Record payment for purchase order {po.poNumber || po.po_number}
          </DialogDescription>
        </DialogHeader>

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
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? "Saving..." : "Mark as Paid"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
