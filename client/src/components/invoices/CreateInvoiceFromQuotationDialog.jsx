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
  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [filteredQuotations, setFilteredQuotations] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadInitialData();
    } else {
      // Reset state on close
      setSelectedCustomerId('');
      setSelectedQuotationId('');
      setFilteredQuotations([]);
    }
  }, [open]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      console.log("Loading customers and quotations for dialog");
      const [customersData, quotationsData] = await Promise.all([
        Customer.list(),
        Quotation.filter({ 
          status: 'submitted'  // Only load submitted quotations
        }, '-updated_date')
      ]);
      
      console.log("Loaded customers:", customersData.length);
      console.log("Loaded submitted quotations:", quotationsData.length);
      
      setCustomers(customersData.filter(c => c.isActive !== false));
      setQuotations(quotationsData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Could not load customers or quotations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerChange = (customerId) => {
    console.log("Customer selected:", customerId);
    setSelectedCustomerId(customerId);
    setSelectedQuotationId(''); // Reset quotation selection
    const customerQuotations = quotations.filter(q => String(q.customer_id) === String(customerId));
    console.log("Filtered quotations for customer:", customerQuotations.length);
    setFilteredQuotations(customerQuotations);
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

    setLoading(true);
    try {
      console.log("Fetching selected quotation:", selectedQuotationId);
      const selectedQuotation = quotations.find(q => q.id === selectedQuotationId);
      
      if (!selectedQuotation) {
        throw new Error("Selected quotation not found");
      }
      
      console.log("Selected quotation data:", selectedQuotation);
      onQuotationSelected(selectedQuotation);
    } catch (error) {
      console.error("Error fetching selected quotation:", error);
      toast({
        title: "Error",
        description: "Could not fetch the selected quotation details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Invoice from Quotation</DialogTitle>
          <DialogDescription>
            Select a customer and then choose one of their submitted quotations to create a new invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="customer-select">Customer</Label>
            <Select
              value={selectedCustomerId}
              onValueChange={handleCustomerChange}
              disabled={loading}
            >
              <SelectTrigger id="customer-select">
                <SelectValue placeholder="Select a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.customer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quotation-select">Quotation</Label>
            <Select
              value={selectedQuotationId}
              onValueChange={setSelectedQuotationId}
              disabled={loading || !selectedCustomerId || filteredQuotations.length === 0}
            >
              <SelectTrigger id="quotation-select">
                <SelectValue placeholder={!selectedCustomerId ? "Select a customer first" : "Select a quotation"} />
              </SelectTrigger>
              <SelectContent>
                {filteredQuotations.length > 0 ? (
                  filteredQuotations.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.quotation_number} - {q.currency} {q.total_amount.toFixed(2)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>
                    {selectedCustomerId ? "No submitted quotations for this customer" : "No quotations found"}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !selectedQuotationId}>
            {loading ? "Loading..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}