
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
import { DeliveryOrder } from '@/api/entities';
import { useToast } from '@/components/ui/use-toast';
import { sortBy } from 'lodash';

export default function CreateFromExistingDialog({ open, onClose, onDocumentSelected }) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [quotations, setQuotations] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('quotation');
  
  // Quotation selection
  const [quotationCustomerId, setQuotationCustomerId] = useState('');
  const [filteredQuotations, setFilteredQuotations] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  
  // DO selection
  const [doCustomerId, setDoCustomerId] = useState('');
  const [filteredDOs, setFilteredDOs] = useState([]);
  const [selectedDOId, setSelectedDOId] = useState('');
  
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
    setDoCustomerId('');
    setSelectedDOId('');
    setFilteredDOs([]);
    setActiveTab('quotation');
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [customersData, quotationsData, deliveredDos, confirmedDos] = await Promise.all([
        Customer.list(),
        Quotation.filter({ status: 'sent' }, '-updated_date'),
        DeliveryOrder.filter({ status: 'delivered' }, '-updated_date'),
        DeliveryOrder.filter({ status: 'confirmed' }, '-updated_date'),
      ]);
      
      setCustomers(customersData.filter(c => c.isActive !== false));
      setQuotations(quotationsData);

      // Combine and de-duplicate DOs
      const allDos = [...deliveredDos, ...confirmedDos];
      const uniqueDos = Array.from(new Map(allDos.map(item => [item.id, item])).values());
      const sortedDos = sortBy(uniqueDos, 'updated_date').reverse(); // Sort in descending order of updated_date
      setDeliveryOrders(sortedDos);

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

  const handleDOCustomerChange = (customerId) => {
    setDoCustomerId(customerId);
    setSelectedDOId('');
    const customerDOs = deliveryOrders.filter(d => String(d.customer_id) === String(customerId));
    setFilteredDOs(customerDOs);
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
      if (!selectedDOId) {
        toast({
          title: "Selection required",
          description: "Please select a delivery order.",
          variant: "destructive",
        });
        return;
      }
      selectedDocument = deliveryOrders.find(d => String(d.id) === String(selectedDOId));
      documentType = 'delivery_order';
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
          <DialogTitle>Create Invoice from Existing</DialogTitle>
          <DialogDescription>
            Select a submitted quotation or delivered delivery order to create a new invoice.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quotation">From Quotation</TabsTrigger>
            <TabsTrigger value="delivery_order">From Delivery Order</TabsTrigger>
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
                        {q.quotation_number} - {q.currency} {q.total_amount.toFixed(2)}
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

          <TabsContent value="delivery_order" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={doCustomerId}
                onValueChange={handleDOCustomerChange}
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
              <Label>Delivery Order</Label>
              <Select
                value={selectedDOId}
                onValueChange={setSelectedDOId}
                disabled={loading || !doCustomerId || filteredDOs.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={!doCustomerId ? "Select a customer first" : "Select a delivery order"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredDOs.length > 0 ? (
                    filteredDOs.map(d => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.do_number} - {d.currency} {d.total_amount.toFixed(2)} ({d.status})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {doCustomerId ? "No confirmed/delivered orders for this customer" : "No delivery orders found"}
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
            disabled={loading || (activeTab === 'quotation' ? !selectedQuotationId : !selectedDOId)}
          >
            {loading ? "Loading..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
