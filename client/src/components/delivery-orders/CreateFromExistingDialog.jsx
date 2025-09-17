
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
  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [activeTab, setActiveTab] = useState('quotation');
  
  // Quotation selection
  const [quotationCustomerId, setQuotationCustomerId] = useState('');
  const [filteredQuotations, setFilteredQuotations] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  
  // Invoice selection
  const [invoiceCustomerId, setInvoiceCustomerId] = useState('');
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadInitialData();
    } else {
      resetState();
    }
  }, [open]);

  const resetState = () => {
    setQuotationCustomerId('');
    setSelectedQuotationId('');
    setFilteredQuotations([]);
    setInvoiceCustomerId('');
    setSelectedInvoiceId('');
    setFilteredInvoices([]);
    setActiveTab('quotation');
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [customersData, quotationsData, invoicesData] = await Promise.all([
        Customer.list(),
        Quotation.filter({ status: 'sent' }, '-updated_date'),
        Invoice.filter({ status: 'sent' }, '-updated_date') // Load sent invoices and quotations
      ]);
      
      setCustomers(customersData.filter(c => c.isActive !== false));
      setQuotations(quotationsData);
      setInvoices(invoicesData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Could not load documents.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuotationCustomerChange = (customerId) => {
    setQuotationCustomerId(customerId);
    setSelectedQuotationId('');
    const customerQuotations = quotations.filter(q => String(q.customer_id) === String(customerId));
    setFilteredQuotations(customerQuotations);
  };

  const handleInvoiceCustomerChange = (customerId) => {
    setInvoiceCustomerId(customerId);
    setSelectedInvoiceId('');
    const customerInvoices = invoices.filter(i => String(i.customer_id) === String(customerId));
    setFilteredInvoices(customerInvoices);
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
      selectedDocument = quotations.find(q => String(q.id) === String(selectedQuotationId));
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
      selectedDocument = invoices.find(i => String(i.id) === String(selectedInvoiceId));
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
            Select a submitted quotation or submitted invoice to create a new delivery order.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quotation">From Quotation</TabsTrigger>
            <TabsTrigger value="invoice">From Invoice</TabsTrigger>
          </TabsList>

          <TabsContent value="quotation" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={quotationCustomerId}
                onValueChange={handleQuotationCustomerChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quotation</Label>
              <Select
                value={selectedQuotationId}
                onValueChange={setSelectedQuotationId}
                disabled={loading || !quotationCustomerId || filteredQuotations.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!quotationCustomerId ? "Select a customer first" : "Select a quotation"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredQuotations.length > 0 ? (
                    filteredQuotations.map(q => (
                      <SelectItem key={q.id} value={String(q.id)}>
                        {q.quotation_number} - {q.total_amount.toFixed(2)} {q.currency}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {quotationCustomerId ? "No submitted quotations for this customer" : "No quotations found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="invoice" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={invoiceCustomerId}
                onValueChange={handleInvoiceCustomerChange}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Invoice</Label>
              <Select
                value={selectedInvoiceId}
                onValueChange={setSelectedInvoiceId}
                disabled={loading || !invoiceCustomerId || filteredInvoices.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!invoiceCustomerId ? "Select a customer first" : "Select an invoice"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredInvoices.length > 0 ? (
                    filteredInvoices.map(i => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.invoice_number} - {i.total_amount.toFixed(2)} {i.currency}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {invoiceCustomerId ? "No submitted invoices for this customer" : "No invoices found"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || (activeTab === 'quotation' ? !selectedQuotationId : !selectedInvoiceId)}
          >
            {loading ? "Loading..." : "Create Delivery Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
