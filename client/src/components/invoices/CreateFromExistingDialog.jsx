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

export default function CreateFromExistingDialog({ open, onClose, onDocumentSelected }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('quotation');
  const [enrichedQuotations, setEnrichedQuotations] = useState([]);
  const [enrichedDeliveryOrders, setEnrichedDeliveryOrders] = useState([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedDeliveryOrderId, setSelectedDeliveryOrderId] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadDocuments();
    } else {
      // Reset state on close
      setSelectedQuotationId('');
      setSelectedDeliveryOrderId('');
      setActiveTab('quotation');
    }
  }, [open]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      console.log("Loading documents for Create from Existing dialog");
      
      // Load all required data in parallel - fetch ALL documents and filter client-side
      const [allQuotationsData, deliveredDos, confirmedDos, customersData] = await Promise.all([
        Quotation.list('-updated_date'), // Fetch ALL quotations, don't rely on backend filtering
        DeliveryOrder.filter({ status: 'delivered' }, '-updated_date'),
        DeliveryOrder.filter({ status: 'confirmed' }, '-updated_date'),
        Customer.list()
      ]);

      console.log("Raw quotations loaded:", allQuotationsData.length, "total quotations");
      console.log("Sample quotation statuses:", allQuotationsData.slice(0, 3).map(q => ({ id: q.id, status: q.status })));

      // Create customer lookup map
      const customerMap = {};
      customersData.forEach(customer => {
        customerMap[customer.id] = customer.customer_name || customer.name;
      });
      
      console.log("Customer map:", customerMap);

      // CLIENT-SIDE filtering for submitted quotations only
      const submittedQuotations = allQuotationsData.filter(quotation => {
        const status = (quotation.status || '').toLowerCase().trim();
        console.log(`Quotation ${quotation.id}: status="${quotation.status}" -> filtered="${status}" -> include=${status === 'submitted'}`);
        return status === 'submitted';
      });

      console.log("Filtered to submitted quotations:", submittedQuotations.length, "out of", allQuotationsData.length);

      // Enrich quotations with customer names and sort by newest first
      const quotationsWithCustomers = submittedQuotations
        .map(quotation => {
          const customerId = quotation.customer_id || quotation.customerId;
          console.log("Quotation customer lookup - ID:", customerId, "Name:", customerMap[customerId]);
          return {
            ...quotation,
            customerName: customerMap[customerId] || 'Unknown Customer'
          };
        })
        .sort((a, b) => new Date(b.updated_date || b.updatedDate) - new Date(a.updated_date || a.updatedDate));

      // Combine and de-duplicate delivery orders, then enrich with customer names
      const allDos = [...deliveredDos, ...confirmedDos];
      const uniqueDos = Array.from(new Map(allDos.map(item => [item.id, item])).values());
      const deliveryOrdersWithCustomers = uniqueDos
        .map(deliveryOrder => {
          const customerId = deliveryOrder.customer_id || deliveryOrder.customerId;
          return {
            ...deliveryOrder,
            customerName: customerMap[customerId] || 'Unknown Customer'
          };
        })
        .sort((a, b) => new Date(b.updated_date || b.updatedDate) - new Date(a.updated_date || a.updatedDate));

      console.log("Loaded documents:", quotationsWithCustomers.length, "quotations,", deliveryOrdersWithCustomers.length, "delivery orders");
      
      setEnrichedQuotations(quotationsWithCustomers);
      setEnrichedDeliveryOrders(deliveryOrdersWithCustomers);
    } catch (error) {
      console.error("Error loading documents:", error);
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
      selectedDocument = enrichedQuotations.find(q => String(q.id) === String(selectedQuotationId));
      documentType = 'quotation';
    } else {
      if (!selectedDeliveryOrderId) {
        toast({
          title: "Selection required",
          description: "Please select a delivery order.",
          variant: "destructive",
        });
        return;
      }
      selectedDocument = enrichedDeliveryOrders.find(d => String(d.id) === String(selectedDeliveryOrderId));
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

    console.log("Selected document for invoice creation:", documentType, selectedDocument);
    onDocumentSelected(selectedDocument, documentType);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invoice from Existing</DialogTitle>
          <DialogDescription>
            Select a submitted quotation or delivered delivery order to create a new invoice. All document details will be copied.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="quotation" data-testid="tab-quotation">From Quotation</TabsTrigger>
            <TabsTrigger value="delivery_order" data-testid="tab-delivery-order">From Delivery Order</TabsTrigger>
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
                  {enrichedQuotations.length > 0 ? (
                    enrichedQuotations.map(quotation => (
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
              {enrichedQuotations.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  No submitted quotations found. Create and submit a quotation first.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="delivery_order" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="delivery-order-select">Select Delivery Order</Label>
              <Select
                value={selectedDeliveryOrderId}
                onValueChange={setSelectedDeliveryOrderId}
                disabled={loading}
                data-testid="select-delivery-order"
              >
                <SelectTrigger id="delivery-order-select">
                  <SelectValue 
                    placeholder={loading ? "Loading delivery orders..." : "Select a delivery order"} 
                  />
                </SelectTrigger>
                <SelectContent>
                  {enrichedDeliveryOrders.length > 0 ? (
                    enrichedDeliveryOrders.map(deliveryOrder => (
                      <SelectItem key={deliveryOrder.id} value={String(deliveryOrder.id)}>
                        {deliveryOrder.do_number || deliveryOrder.deliveryOrderNumber} - {deliveryOrder.customerName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      {loading ? "Loading..." : "No delivery orders available"}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {enrichedDeliveryOrders.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground">
                  No delivered or confirmed delivery orders found. Create and deliver a delivery order first.
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
            disabled={loading || (activeTab === 'quotation' ? !selectedQuotationId : !selectedDeliveryOrderId)}
            data-testid="button-create-invoice"
          >
            {loading ? "Creating..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}