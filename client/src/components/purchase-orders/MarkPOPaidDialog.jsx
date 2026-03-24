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
import { CheckCircle, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function MarkPOPaidDialog({ open, onClose, po, onSuccess }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentMadeDate, setPaymentMadeDate] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");

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
    }
  }, [open, po]);

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
