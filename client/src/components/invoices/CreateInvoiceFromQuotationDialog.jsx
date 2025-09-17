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
import { useToast } from '@/components/ui/use-toast';

export default function CreateInvoiceFromQuotationDialog({ open, onClose, onQuotationSelected }) {
  const [loading, setLoading] = useState(false);
  const [submittedQuotations, setSubmittedQuotations] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadSubmittedQuotations();
    } else {
      // Reset state on close
      setSelectedQuotationId('');
    }
  }, [open]);

  const loadSubmittedQuotations = async () => {
    setLoading(true);
    try {
      console.log("Loading submitted quotations for invoice creation");
      
      // Load all submitted quotations with customer data
      const [quotationsData, customersData] = await Promise.all([
        Quotation.filter({ status: 'submitted' }, '-updated_date'),
        Customer.list()
      ]);

      // Create a map for quick customer lookup
      const customerMap = {};
      customersData.forEach(customer => {
        customerMap[customer.id] = customer.customer_name || customer.name;
      });

      // Combine quotations with customer names and sort by date (newest first)
      const enrichedQuotations = quotationsData
        .map(quotation => ({
          ...quotation,
          customerName: customerMap[quotation.customer_id] || 'Unknown Customer'
        }))
        .sort((a, b) => new Date(b.updated_date || b.updatedDate) - new Date(a.updated_date || a.updatedDate));

      console.log("Loaded quotations with customer names:", enrichedQuotations.length, "items");
      setSubmittedQuotations(enrichedQuotations);
    } catch (error) {
      console.error("Error loading submitted quotations:", error);
      toast({
        title: "Error",
        description: "Could not load submitted quotations. Please try again.",
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
        description: "Please select a quotation to create an invoice from.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const selectedQuotation = submittedQuotations.find(q => String(q.id) === String(selectedQuotationId));
      
      if (!selectedQuotation) {
        throw new Error("Selected quotation not found");
      }
      
      console.log("Selected quotation for invoice creation:", selectedQuotation);
      onQuotationSelected(selectedQuotation);
    } catch (error) {
      console.error("Error creating invoice from quotation:", error);
      toast({
        title: "Error",
        description: "Could not create invoice from the selected quotation.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invoice from Quotation</DialogTitle>
          <DialogDescription>
            Select a submitted quotation to create a new invoice. All quotation details will be copied to the new invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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
                  submittedQuotations.map(quotation => (
                    <SelectItem key={quotation.id} value={String(quotation.id)}>
                      {quotation.quotation_number || quotation.quoteNumber} - {quotation.customerName}
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
            data-testid="button-create-invoice"
          >
            {loading ? "Creating..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}