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
import type { Invoice } from "@shared/schema";

interface MarkPaidDialogProps {
  open: boolean;
  onClose: () => void;
  invoice: Record<string, any> | null;
  onSuccess: () => void;
}

export default function MarkPaidDialog({ open, onClose, invoice, onSuccess }: MarkPaidDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentReceivedDate, setPaymentReceivedDate] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");

  const isEditing = !!(invoice?.paymentReceivedDate || invoice?.payment_received_date);

  useEffect(() => {
    if (open && invoice) {
      const existingDate = invoice.paymentReceivedDate || invoice.payment_received_date;
      if (existingDate) {
        try {
          setPaymentReceivedDate(new Date(existingDate).toISOString().split('T')[0]);
        } catch {
          setPaymentReceivedDate(new Date().toISOString().split('T')[0]);
        }
      } else {
        setPaymentReceivedDate(new Date().toISOString().split('T')[0]);
      }
      setPaymentRemarks(invoice.paymentRemarks || invoice.payment_remarks || "");
    }
  }, [open, invoice]);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!invoice) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paymentStatus: 'paid',
          paymentReceivedDate: paymentReceivedDate || null,
          paymentRemarks: paymentRemarks || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update payment status');
      }
      toast({
        title: isEditing ? 'Payment Updated' : 'Payment Recorded',
        description: `Invoice ${invoice.invoiceNumber || invoice.invoice_number} payment details saved.`,
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving invoice payment:", error);
      toast({ title: 'Error', description: error.message || 'Failed to save payment.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

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
              ? `Update payment details for invoice ${invoice.invoiceNumber || invoice.invoice_number}`
              : `Record payment for invoice ${invoice.invoiceNumber || invoice.invoice_number}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment_received_date">Payment Received Date *</Label>
            <Input
              id="payment_received_date"
              type="date"
              value={paymentReceivedDate}
              onChange={(e) => setPaymentReceivedDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_remarks">Remarks <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Textarea
              id="payment_remarks"
              value={paymentRemarks}
              onChange={(e) => setPaymentRemarks(e.target.value)}
              placeholder="e.g. bank transfer, cheque, cash received..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !paymentReceivedDate}
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
