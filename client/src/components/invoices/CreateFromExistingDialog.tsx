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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Customer } from '@/api/entities';
import { Quotation } from '@/api/entities';
import { DeliveryOrder } from '@/api/entities';
import { useToast } from '@/hooks/use-toast';

export default function CreateFromExistingDialog({ open, onClose, onDocumentSelected }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('quotation');
  const [enrichedQuotations, setEnrichedQuotations] = useState<any[]>([]);
  const [enrichedDeliveryOrders, setEnrichedDeliveryOrders] = useState<any[]>([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState('');
  const [selectedDeliveryOrderId, setSelectedDeliveryOrderId] = useState('');

  // Two-step DO state
  const [doStep, setDoStep] = useState(1);
  const [doItems, setDoItems] = useState<any[]>([]);
  const [fullDo, setFullDo] = useState<any>(null);
  const [fetchingDo, setFetchingDo] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadDocuments();
    } else {
      setSelectedQuotationId('');
      setSelectedDeliveryOrderId('');
      setActiveTab('quotation');
      setDoStep(1);
      setDoItems([]);
      setFullDo(null);
    }
  }, [open]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const [allQuotationsData, deliveredDos, customersData] = await Promise.all([
        Quotation.list('-updated_date'),
        DeliveryOrder.filter({ status: 'delivered' }),
        Customer.list()
      ]);

      const customerMap: Record<string, any> = {};
      customersData.forEach((customer: any) => {
        customerMap[customer.id] = customer.customer_name || customer.name;
      });

      const submittedQuotations = allQuotationsData.filter((quotation: any) => {
        const status = (quotation.status || '').toLowerCase().trim();
        return status === 'sent' || status === 'accepted' || status === 'submitted';
      });

      const quotationsWithCustomers = submittedQuotations
        .map((quotation: any) => {
          const customerId = quotation.customer_id || quotation.customerId;
          return { ...quotation, customerName: customerMap[customerId] || 'Unknown Customer' };
        })
        .sort((a: any, b: any) => new Date(b.updated_date || b.updatedDate).getTime() - new Date(a.updated_date || a.updatedDate).getTime());

      const deliveryOrdersWithCustomers = deliveredDos
        .map((deliveryOrder: any) => {
          const customerId = deliveryOrder.customer_id || deliveryOrder.customerId;
          return { ...deliveryOrder, customerName: customerMap[customerId] || 'Unknown Customer' };
        })
        .sort((a: any, b: any) => new Date(b.updated_date || b.updatedDate).getTime() - new Date(a.updated_date || a.updatedDate).getTime());

      setEnrichedQuotations(quotationsWithCustomers);
      setEnrichedDeliveryOrders(deliveryOrdersWithCustomers);
    } catch (error: any) {
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

  const handleQuotationSubmit = async () => {
    if (!selectedQuotationId) {
      toast({ title: "Selection required", description: "Please select a quotation.", variant: "destructive" });
      return;
    }
    const selectedDocument = enrichedQuotations.find((q: any) => String(q.id) === String(selectedQuotationId));
    if (!selectedDocument) {
      toast({ title: "Error", description: "Selected document not found.", variant: "destructive" });
      return;
    }
    onDocumentSelected(selectedDocument, 'quotation');
  };

  const handleDoContinue = async () => {
    if (!selectedDeliveryOrderId) {
      toast({ title: "Selection required", description: "Please select a delivery order.", variant: "destructive" });
      return;
    }
    setFetchingDo(true);
    try {
      const res = await fetch(`/api/delivery-orders/${selectedDeliveryOrderId}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const doData = await res.json();
      setFullDo(doData);
      setDoItems((doData.items || []).map((item: any) => ({
        ...item,
        invoiceQty: item.quantity,
        maxQty: item.quantity,
      })));
      setDoStep(2);
    } catch {
      toast({ title: "Error", description: "Could not load delivery order details.", variant: "destructive" });
    } finally {
      setFetchingDo(false);
    }
  };

  const handleDoItemQtyChange = (idx, value) => {
    setDoItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const parsed = parseInt(value, 10);
      const qty = isNaN(parsed) ? 0 : Math.max(0, Math.min(parsed, item.maxQty));
      return { ...item, invoiceQty: qty };
    }));
  };

  const handleDoSubmit = () => {
    const includedItems = doItems.filter((item: any) => item.invoiceQty > 0);
    if (includedItems.length === 0) {
      toast({ title: "No items selected", description: "At least one item must have a quantity greater than 0.", variant: "destructive" });
      return;
    }

    const taxRate = fullDo.tax_rate ?? 0;
    const adjustedItems = includedItems.map((item: any) => ({
      ...item,
      quantity: item.invoiceQty,
      line_total: parseFloat(item.unit_price || 0) * item.invoiceQty,
    }));
    const subtotal = adjustedItems.reduce((sum: any, item: any) => sum + item.line_total, 0);
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    const adjustedDo = {
      ...fullDo,
      items: adjustedItems,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
    };
    onDocumentSelected(adjustedDo, 'delivery_order');
  };

  const adjustedSubtotal = doItems
    .filter((item: any) => item.invoiceQty > 0)
    .reduce((sum: any, item: any) => sum + parseFloat(item.unit_price || 0) * (item.invoiceQty || 0), 0);
  const taxRate = fullDo?.tax_rate ?? 0;
  const adjustedTax = adjustedSubtotal * taxRate;
  const adjustedTotal = adjustedSubtotal + adjustedTax;
  const taxPct = taxRate > 0 ? `${(taxRate * 100).toFixed(0)}%` : '0%';

  const selectedDoInfo = enrichedDeliveryOrders.find((d: any) => String(d.id) === String(selectedDeliveryOrderId));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={doStep === 2 ? "max-w-3xl" : "max-w-md"}>
        <DialogHeader>
          <DialogTitle>Create Invoice from Existing</DialogTitle>
          {doStep === 1 && (
            <DialogDescription>
              Select a submitted quotation or delivered delivery order to create a new invoice.
            </DialogDescription>
          )}
          {doStep === 2 && (
            <DialogDescription>
              Adjust quantities for <span className="font-medium">{fullDo?.do_number}</span> — {selectedDoInfo?.customerName}. Set quantity to 0 to exclude an item.
            </DialogDescription>
          )}
        </DialogHeader>

        {doStep === 1 && (
          <>
            <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); }} className="w-full">
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
                      <SelectValue placeholder={loading ? "Loading quotations..." : "Select a quotation"} />
                    </SelectTrigger>
                    <SelectContent>
                      {enrichedQuotations.length > 0 ? (
                        enrichedQuotations.map((quotation: any) => (
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
                      <SelectValue placeholder={loading ? "Loading delivery orders..." : "Select a delivery order"} />
                    </SelectTrigger>
                    <SelectContent>
                      {enrichedDeliveryOrders.length > 0 ? (
                        enrichedDeliveryOrders.map((deliveryOrder: any) => (
                          <SelectItem key={deliveryOrder.id} value={String(deliveryOrder.id)}>
                            {deliveryOrder.do_number || deliveryOrder.deliveryOrderNumber} - {deliveryOrder.customerName}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          {loading ? "Loading..." : "No delivered delivery orders found"}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {enrichedDeliveryOrders.length === 0 && !loading && (
                    <p className="text-sm text-muted-foreground">
                      No delivered delivery orders found. Create and deliver a delivery order first.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={loading} data-testid="button-cancel">
                Cancel
              </Button>
              {activeTab === 'quotation' ? (
                <Button
                  onClick={handleQuotationSubmit}
                  disabled={loading || !selectedQuotationId}
                  data-testid="button-create-invoice"
                >
                  {loading ? "Loading..." : "Create Invoice"}
                </Button>
              ) : (
                <Button
                  onClick={handleDoContinue}
                  disabled={loading || !selectedDeliveryOrderId || fetchingDo}
                  data-testid="button-do-continue"
                >
                  {fetchingDo ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading...</>
                  ) : (
                    "Continue"
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {doStep === 2 && fullDo && (
          <>
            <div className="space-y-4">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Size</TableHead>
                      <TableHead className="w-20 text-right">Delivered</TableHead>
                      <TableHead className="w-24 text-right">Invoice Qty</TableHead>
                      <TableHead className="w-28 text-right">Line Total (AED)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doItems.map((item, idx) => {
                      const lineTotal = parseFloat(item.unit_price || 0) * (item.invoiceQty || 0);
                      const excluded = item.invoiceQty === 0;
                      return (
                        <TableRow key={item.id || idx} className={excluded ? 'opacity-40' : ''}>
                          <TableCell className="text-sm text-gray-600">{item.product_code || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.description || item.product_name || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">{item.size || '—'}</TableCell>
                          <TableCell className="text-right text-sm text-gray-500">{item.maxQty}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={item.maxQty}
                              value={item.invoiceQty}
                              onChange={(e) => handleDoItemQtyChange(idx, e.target.value)}
                              className="w-20 text-right h-8 ml-auto"
                            />
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {lineTotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                <div className="px-4 py-3 bg-gray-50 border-t space-y-1.5">
                  <div className="flex justify-end gap-6 text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span className="w-28 text-right">AED {adjustedSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-sm text-gray-600">
                    <span>VAT ({taxPct})</span>
                    <span className="w-28 text-right">AED {adjustedTax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-end gap-6 text-sm font-bold border-t border-gray-200 pt-1.5 mt-1">
                    <span>Grand Total</span>
                    <span className="w-28 text-right">AED {adjustedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                {doItems.filter((i: any) => i.invoiceQty > 0).length} of {doItems.length} items will be invoiced.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDoStep(1)} data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button
                onClick={handleDoSubmit}
                disabled={doItems.filter((i: any) => i.invoiceQty > 0).length === 0}
                data-testid="button-create-invoice"
              >
                Create Invoice
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
