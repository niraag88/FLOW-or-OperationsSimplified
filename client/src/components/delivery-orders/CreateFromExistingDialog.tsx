import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Customer } from '@/api/entities';
import { Quotation } from '@/api/entities';
import { useToast } from '@/hooks/use-toast';

interface CreateFromExistingDialogProps {
  open: boolean;
  onClose: () => void;
  onDocumentSelected: (document: Record<string, unknown>, type?: string) => void;
}

export default function CreateFromExistingDialog({ open, onClose, onDocumentSelected }: CreateFromExistingDialogProps) {
  const [loading, setLoading] = useState(false);
  const [submittedQuotations, setSubmittedQuotations] = useState<any[]>([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadQuotations();
    } else {
      setSelectedQuotationId('');
    }
  }, [open]);

  const loadQuotations = async () => {
    setLoading(true);
    try {
      const [allQuotationsData, customersData] = await Promise.all([
        Quotation.list(),
        Customer.list()
      ]);

      const customerMap: Record<string, unknown> = {};
      customersData.forEach((customer: any) => {
        customerMap[customer.id] = customer.customer_name || customer.name;
      });

      const eligibleStatuses = ['sent', 'accepted', 'submitted'];
      const filteredQuotations = allQuotationsData.filter((quotation: any) => {
        const status = (quotation.status || '').toLowerCase().trim();
        return eligibleStatuses.includes(status);
      });

      const enrichedQuotations = filteredQuotations
        .map((quotation: any) => ({
          ...quotation,
          customerName: customerMap[quotation.customerId || quotation.customer_id] || 'Unknown Customer'
        }))
        .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || b.updated_date || b.updatedDate).getTime() - new Date(a.updatedAt || a.createdAt || a.updated_date || a.updatedDate).getTime());

      setSubmittedQuotations(enrichedQuotations);
    } catch (error: any) {
      console.error("Error loading quotations:", error);
      toast({
        title: "Error",
        description: "Could not load quotations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedQuotationId) {
      toast({
        title: "Selection required",
        description: "Please select a quotation.",
        variant: "destructive",
      });
      return;
    }

    const selectedDocument = submittedQuotations.find((q: any) => String(q.id) === String(selectedQuotationId));
    if (!selectedDocument) {
      toast({
        title: "Error",
        description: "Selected quotation not found.",
        variant: "destructive",
      });
      return;
    }

    onDocumentSelected(selectedDocument, 'quotation');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Delivery Order from Quotation</DialogTitle>
          <DialogDescription>
            Select a submitted quotation to create a new delivery order. All customer and item details will be copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="quotation-select">Select Quotation</Label>
            <Select
              value={selectedQuotationId}
              onValueChange={setSelectedQuotationId}
              disabled={loading}
              data-testid="select-quotation"
            >
              <SelectTrigger id="quotation-select">
                <SelectValue
                  placeholder={loading ? "Loading quotations..." : "Select a quotation"}
                />
              </SelectTrigger>
              <SelectContent>
                {submittedQuotations.length > 0 ? (
                  submittedQuotations.map((quotation: any) => (
                    <SelectItem key={quotation.id} value={String(quotation.id)}>
                      {quotation.quotation_number || quotation.quoteNumber} — {quotation.customerName}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    {loading ? "Loading..." : "No submitted quotations available"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {submittedQuotations.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">
                No submitted quotations found. Create and submit a quotation first.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedQuotationId}
            data-testid="button-create-delivery-order"
          >
            {loading ? "Loading..." : "Create Delivery Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
