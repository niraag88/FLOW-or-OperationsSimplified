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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Customer } from '@/api/entities';
import { Quotation } from '@/api/entities';
import { Invoice } from '@/api/entities';
import { useToast } from '@/components/ui/use-toast';

export default function CreateFromExistingDialog({ open, onClose, onDocumentSelected }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('quotation');
  const [submittedQuotations, setSubmittedQuotations] = useState([]);
  const [submittedInvoices, setSubmittedInvoices] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadSubmittedDocuments();
    } else {
      // Reset state on close
      setSelectedQuotationId('');
      setSelectedInvoiceId('');
      setActiveTab('quotation');
    }
  }, [open]);

  const loadSubmittedDocuments = async () => {
    setLoading(true);
    try {
      // Fetch ALL quotations and filter client-side for eligible statuses
      // (sent, accepted, submitted) — avoids comma-encoding issues with filter()
      const [allQuotationsData, invoicesData, customersData] = await Promise.all([
        Quotation.list(),
        Invoice.filter({ status: 'submitted' }, '-updated_date'),
        Customer.list()
      ]);

      // Create a map for quick customer lookup
      const customerMap = {};
      customersData.forEach(customer => {
        customerMap[customer.id] = customer.customer_name || customer.name;
      });

      // Client-side filter for eligible quotation statuses
      const eligibleStatuses = ['sent', 'accepted', 'submitted'];
      const filteredQuotations = allQuotationsData.filter(quotation => {
        const status = (quotation.status || '').toLowerCase().trim();
        return eligibleStatuses.includes(status);
      });

      // Enrich quotations with customer names and sort by date (newest first)
      const enrichedQuotations = filteredQuotations
        .map(quotation => ({
          ...quotation,
          customerName: customerMap[quotation.customerId || quotation.customer_id] || 'Unknown Customer'
        }))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || b.updated_date || b.updatedDate) - new Date(a.updatedAt || a.createdAt || a.updated_date || a.updatedDate));

      // Enrich invoices with customer names and sort by date (newest first)
      const enrichedInvoices = invoicesData
        .map(invoice => ({
          ...invoice,
          customerName: customerMap[invoice.customer_id] || 'Unknown Customer'
        }))
        .sort((a, b) => new Date(b.updated_date || b.updatedDate) - new Date(a.updated_date || a.updatedDate));

      setSubmittedQuotations(enrichedQuotations);
      setSubmittedInvoices(enrichedInvoices);
    } catch (error) {
      console.error("Error loading submitted documents:", error);
      toast({
        title: "Error",
        description: "Could not load documents. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    let selectedDocument = null;
    let documentType = '';

    if (activeTab === 'quotation') {
      if (!selectedQuotationId) {
        toast({
          title: "Selection required",
          description: "Please select a quotation.",
          variant: "destructive",
        });
        return;
      }
      selectedDocument = submittedQuotations.find(q => String(q.id) === String(selectedQuotationId));
      documentType = 'quotation';
    } else {
      if (!selectedInvoiceId) {
        toast({
          title: "Selection required",
          description: "Please select an invoice.",
          variant: "destructive",
        });
        return;
      }
      selectedDocument = submittedInvoices.find(i => String(i.id) === String(selectedInvoiceId));
      documentType = 'invoice';
    }

    if (!selectedDocument) {
      toast({
        title: "Error",
        description: "Selected document not found.",
        variant: "destructive",
      });
      return;
    }

    onDocumentSelected(selectedDocument, documentType);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Delivery Order from Existing</DialogTitle>
          <DialogDescription>
            Select a submitted quotation or invoice to create a new delivery order. All document details will be copied.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quotation" data-testid="tab-quotation">From Quotation</TabsTrigger>
            <TabsTrigger value="invoice" data-testid="tab-invoice">From Invoice</TabsTrigger>
          </TabsList>

          <TabsContent value="quotation" className="space-y-4 mt-4">
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
          </TabsContent>

          <TabsContent value="invoice" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-select">Select Invoice</Label>
              <Select
                value={selectedInvoiceId}
                onValueChange={setSelectedInvoiceId}
                disabled={loading}
                data-testid="select-invoice"
              >
                <SelectTrigger id="invoice-select">
                  <SelectValue 
                    placeholder={loading ? "Loading invoices..." : "Select an invoice"} 
                  />
                </SelectTrigger>
                <SelectContent>
                  {submittedInvoices.length > 0 ? (
                    submittedInvoices.map(invoice => (
                      <SelectItem key={invoice.id} value={String(invoice.id)}>
                        {invoice.invoice_number || invoice.invoiceNumber} - {invoice.customerName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {loading ? "Loading..." : "No submitted invoices available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {submittedInvoices.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  No submitted invoices found. Create and submit an invoice first.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading} data-testid="button-cancel">
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || (activeTab === 'quotation' ? !selectedQuotationId : !selectedInvoiceId)}
            data-testid="button-create-delivery-order"
          >
            {loading ? "Creating..." : "Create Delivery Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}