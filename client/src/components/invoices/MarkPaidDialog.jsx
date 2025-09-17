import React, { useState } from "react";
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
import { CreditCard } from "lucide-react";
import { Invoice } from "@/api/entities";

export default function MarkPaidDialog({ open, onClose, invoice, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({
    paid_amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_reference: ""
  });

  React.useEffect(() => {
    if (invoice && open) {
      const outstanding = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
      setPaymentData({
        paid_amount: outstanding,
        payment_date: new Date().toISOString().split('T')[0],
        payment_reference: ""
      });
    }
  }, [invoice, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!invoice) return;

    setLoading(true);
    try {
      const newPaidAmount = (invoice.paid_amount || 0) + paymentData.paid_amount;
      const isFullyPaid = newPaidAmount >= invoice.total_amount;

      await Invoice.update(invoice.id, {
        paid_amount: newPaidAmount,
        payment_date: paymentData.payment_date,
        payment_reference: paymentData.payment_reference,
        status: isFullyPaid ? 'paid' : invoice.status
      });

      onSuccess();
    } catch (error) {
      console.error("Error marking invoice as paid:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

  const outstanding = (invoice.total_amount || 0) - (invoice.paid_amount || 0);
  const formatCurrency = (amount) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${invoice.currency} ${formatter.format(amount)}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-600" />
            Mark Payment Received
          </DialogTitle>
          <DialogDescription>
            Record payment for invoice {invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Summary */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Amount:</span>
              <span className="font-medium">{formatCurrency(invoice.total_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Already Paid:</span>
              <span className="font-medium">{formatCurrency(invoice.paid_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span className="text-gray-900">Outstanding:</span>
              <span className="text-amber-600">{formatCurrency(outstanding)}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="paid_amount">Payment Amount *</Label>
              <Input
                id="paid_amount"
                type="number"
                step="0.01"
                min="0.01"
                max={outstanding}
                value={paymentData.paid_amount}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  paid_amount: parseFloat(e.target.value) || 0
                }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">Payment Date *</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentData.payment_date}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  payment_date: e.target.value
                }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_reference">Payment Reference</Label>
              <Input
                id="payment_reference"
                value={paymentData.payment_reference}
                onChange={(e) => setPaymentData(prev => ({
                  ...prev,
                  payment_reference: e.target.value
                }))}
                placeholder="TXN-123456, CHQ-789, etc."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || paymentData.paid_amount <= 0}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}