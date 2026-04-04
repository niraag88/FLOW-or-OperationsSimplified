import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, PackageCheck, AlertTriangle, Paperclip, FileText, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { Brand } from "@/api/entities";
import { Product } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { formatDate } from "@/utils/dateUtils";
import { getRateToAed, formatCurrency, SUPPORTED_CURRENCIES } from "@/utils/currency";
import { computeReconciliation } from "@/utils/poReconciliation";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

export default function POForm({ open, onClose, editingPO, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [currencyExplicitlySet, setCurrencyExplicitlySet] = useState(false);
  const [grnDocs, setGrnDocs] = useState([]);
  const [loadingGrnDocs, setLoadingGrnDocs] = useState(false);
  const [supplierDocsOpen, setSupplierDocsOpen] = useState(true);
  const [poScanKey, setPoScanKey] = useState(null);
  const [confirmPoDocDeleteOpen, setConfirmPoDocDeleteOpen] = useState(false);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    poNumber: "",
    brandId: "",
    orderDate: new Date().toISOString().split('T')[0],
    expectedDelivery: "",
    status: "draft",
    notes: "",
    currency: "GBP",
    fxRateToAed: "4.8500",
    totalAmount: "0.00",
    items: []
  });

  useEffect(() => {
    if (open) {
      setPoScanKey(editingPO?.supplierScanKey || null);
      loadInitialData();
      if (editingPO?.id) {
        loadGrnDocs(editingPO.id);
      } else {
        setGrnDocs([]);
      }
    }
  }, [open, editingPO?.id]);

  const loadGrnDocs = async (poId) => {
    setLoadingGrnDocs(true);
    try {
      const res = await fetch(`/api/goods-receipts?poId=${poId}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGrnDocs(data);
      }
    } catch (e) {
      // silently ignore
    } finally {
      setLoadingGrnDocs(false);
    }
  };

  const handleViewDoc = async (scanKey) => {
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get link');
      window.open(data.url, '_blank');
    } catch (e) {
      toast({ title: 'Error', description: 'Could not retrieve the document.', variant: 'destructive' });
    }
  };

  const handleDeletePoDoc = () => {
    setConfirmPoDocDeleteOpen(true);
  };

  const handleConfirmPoDocDelete = async () => {
    setConfirmPoDocDeleteOpen(false);
    try {
      const res = await fetch(`/api/purchase-orders/${editingPO.id}/scan-key`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove document');
      }
      setPoScanKey(null);
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      toast({ title: 'Document Removed', description: 'The document has been removed from this purchase order.' });
    } catch (e) {
      toast({ title: 'Error', description: 'Could not remove the document. Please try again.', variant: 'destructive' });
    }
  };

  const loadInitialData = async () => {
    try {
      const settled = await Promise.allSettled([
        Brand.list(),
        Product.list(),
        fetch('/api/company-settings'),
        editingPO ? Promise.resolve(null) : fetch('/api/purchase-orders/next-number', { credentials: 'include' })
      ]);

      const brandsData = settled[0].status === 'fulfilled' ? settled[0].value : [];
      const productsData = settled[1].status === 'fulfilled' ? settled[1].value : [];
      const settingsResponse = settled[2].status === 'fulfilled' ? settled[2].value : null;
      const nextNumberResponse = settled[3].status === 'fulfilled' ? settled[3].value : null;

      const filteredBrands = (brandsData || []).filter(b => b.isActive !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setBrands(filteredBrands);
      setProducts(productsData || []);

      let settings = null;
      if (settingsResponse && settingsResponse.ok) {
        try {
          settings = await settingsResponse.json();
          setCompanySettings(settings);
        } catch {}
      }

      if (editingPO) {
        await loadEditingData(filteredBrands, settings);
      } else {
        let nextPONumber = "";
        try {
          if (nextNumberResponse && nextNumberResponse.ok) {
            const data = await nextNumberResponse.json();
            nextPONumber = data.nextNumber || "";
          }
        } catch {}

        const defaultRate = settings ? getRateToAed('GBP', settings) : 4.85;
        setFormData({
          poNumber: nextPONumber,
          brandId: "",
          orderDate: new Date().toISOString().split('T')[0],
          expectedDelivery: "",
          status: "draft",
          notes: "",
          currency: "GBP",
          fxRateToAed: defaultRate.toFixed(4),
          totalAmount: "0.00",
          items: []
        });
        setCurrencyExplicitlySet(false);
      }
    } catch (error) {
      console.error("Error loading PO form data:", error);
    }
  };

  const loadEditingData = async (availableBrands = brands, settings = companySettings) => {
    if (!editingPO) return;
    
    try {
      const formDataToSet = {
        poNumber: editingPO.poNumber || "",
        brandId: editingPO.brandId?.toString() || "",
        orderDate: editingPO.orderDate ? new Date(editingPO.orderDate).toISOString().split('T')[0] : "",
        expectedDelivery: editingPO.expectedDelivery ? new Date(editingPO.expectedDelivery).toISOString().split('T')[0] : "",
        status: editingPO.status || "draft",
        notes: editingPO.notes || "",
        currency: editingPO.currency || "GBP",
        fxRateToAed: editingPO.fxRateToAed || (settings ? getRateToAed(editingPO.currency || 'GBP', settings).toFixed(4) : "4.8500"),
        totalAmount: editingPO.totalAmount || "0.00",
        items: []
      };
      
      setFormData(formDataToSet);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      setFormData(prev => ({ ...prev, brandId: editingPO.brandId?.toString() || "" }));
      
      if (editingPO.id) {
        const response = await fetch(`/api/purchase-orders/${editingPO.id}/items`);
        if (response.ok) {
          const items = await response.json();
          const formattedItems = items.map(item => ({
            id: item.id,
            productId: item.productId?.toString() || "",
            productSku: item.productSku || "",
            productName: item.productName || "",
            size: item.size || "",
            quantity: item.quantity || 0,
            receivedQuantity: item.receivedQuantity ?? 0,
            unitPrice: parseFloat(item.unitPrice) || 0,
            lineTotal: parseFloat(item.lineTotal) || 0
          }));
          
          setFormData(prev => ({
            ...prev,
            items: formattedItems
          }));
        }
      }
    } catch (error) {
      console.error("Error loading editing data:", error);
    }
  };


  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCurrencyChange = (currency) => {
    const rate = companySettings ? getRateToAed(currency, companySettings) : 4.85;
    setCurrencyExplicitlySet(true);
    setFormData(prev => ({
      ...prev,
      currency,
      fxRateToAed: rate.toFixed(4)
    }));
  };

  const addItem = () => {
    const newItem = {
      productId: "",
      productSku: "",
      productName: "",
      size: "",
      quantity: 1,
      unitPrice: 0,
      lineTotal: 0
    };
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    if (field === 'productId' && value) {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        newItems[index].productSku = product.sku;
        newItems[index].productName = product.name;
        newItems[index].size = product.size || '';
        newItems[index].unitPrice = parseFloat(product.costPrice) || 0;
        newItems[index].lineTotal = newItems[index].quantity * (parseFloat(product.costPrice) || 0);

        // Auto-set PO currency from product's costPriceCurrency when first product is selected on a new PO
        // Only if user has NOT explicitly changed the currency themselves, and no other product is already selected
        const productCurrency = product.costPriceCurrency || 'GBP';
        const selectedProductCount = newItems.filter(i => i.productId).length;
        const isFirstProductSelected = !editingPO && !currencyExplicitlySet && selectedProductCount <= 1;
        if (isFirstProductSelected) {
          const rate = companySettings ? getRateToAed(productCurrency, companySettings) : 4.85;
          setFormData(prev => ({
            ...prev,
            currency: productCurrency,
            fxRateToAed: rate.toFixed(4),
            items: newItems
          }));
          const total = newItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
          setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
          return;
        }
      }
    }
    
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].lineTotal = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
    }
    
    setFormData(prev => ({ ...prev, items: newItems }));
    
    const total = newItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, items: newItems }));
    
    const total = newItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const fxRate = parseFloat(formData.fxRateToAed) || 4.85;
      const totalAed = (parseFloat(formData.totalAmount) * fxRate).toFixed(2);

      const submitData = {
        poNumber: formData.poNumber,
        brandId: parseInt(formData.brandId),
        orderDate: formData.orderDate + 'T00:00:00.000Z',
        expectedDelivery: formData.expectedDelivery ? formData.expectedDelivery + 'T00:00:00.000Z' : null,
        status: formData.status,
        notes: formData.notes,
        currency: formData.currency,
        fxRateToAed: formData.fxRateToAed,
        totalAmount: formData.totalAmount,
        grandTotal: formData.currency === 'AED' ? formData.totalAmount : totalAed,
        items: formData.items.map(item => ({
          productId: parseInt(item.productId),
          productSku: item.productSku,
          productName: item.productName,
          size: item.size || null,
          quantity: parseInt(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          lineTotal: parseFloat(item.lineTotal)
        }))
      };

      if (editingPO) {
        await PurchaseOrder.update(editingPO.id, submitData);
      } else {
        await PurchaseOrder.create(submitData);
      }
      
      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      console.error("Error saving purchase order:", error);
      toast({
        title: "Save Failed",
        description: error?.message || "Could not save the purchase order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrencyExplicitlySet(false);
    setFormData({
      poNumber: "",
      brandId: "",
      orderDate: new Date().toISOString().split('T')[0],
      expectedDelivery: "",
      status: "draft",
      notes: "",
      currency: "GBP",
      fxRateToAed: "4.8500",
      totalAmount: "0.00",
      items: []
    });
  };

  const getFilteredProducts = () => {
    if (!formData.brandId) return [];
    const brandId = parseInt(formData.brandId);
    return products.filter(p => p.isActive !== false && p.brandId === brandId);
  };

  const canEdit = !editingPO || editingPO.status !== 'closed';

  const currency = formData.currency || 'GBP';
  const fxRate = parseFloat(formData.fxRateToAed) || 4.85;
  const totalInCurrency = parseFloat(formData.totalAmount) || 0;
  const totalAed = currency === 'AED' ? totalInCurrency : totalInCurrency * fxRate;

  // Reconciliation: show when editing a PO that has at least one item with received quantities (GRNs exist)
  const recon = computeReconciliation(formData.items);
  const showReconciliation = editingPO && formData.items.length > 0 && recon.hasGRNData;
  const reconciledTotal = recon.reconciledTotal;
  const reconciledAed = currency === 'AED' ? reconciledTotal : reconciledTotal * fxRate;
  const isShortDelivery = recon.isShortDelivery;

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full sm:max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingPO ? `Edit Purchase Order ${editingPO.poNumber}` : 'New Purchase Order'}
          </DialogTitle>
          <DialogDescription>
            {editingPO ? 'Update purchase order details and line items' : 'Create a new purchase order'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number *</Label>
              <Input
                id="poNumber"
                value={formData.poNumber}
                onChange={(e) => handleInputChange('poNumber', e.target.value)}
                disabled={!!editingPO}
                required
                data-testid="input-po-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandId">Brand *</Label>
              <Select 
                value={formData.brandId} 
                onValueChange={(value) => handleInputChange('brandId', value)}
                disabled={!canEdit}
              >
                <SelectTrigger data-testid="select-brand">
                  <SelectValue placeholder="Select brand" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id.toString()}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              {editingPO?.status === 'closed' ? (
                <div className="flex items-center h-10">
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-sm font-medium px-3 py-1">
                    Closed
                  </Badge>
                  <span className="ml-2 text-xs text-muted-foreground">Set automatically via Goods Receipts</span>
                </div>
              ) : (
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleInputChange('status', value)}
                  disabled={!canEdit}
                >
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="orderDate">Order Date *</Label>
              <Input
                id="orderDate"
                type="date"
                value={formData.orderDate}
                onChange={(e) => handleInputChange('orderDate', e.target.value)}
                disabled={!canEdit}
                required
                data-testid="input-order-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expectedDelivery">Expected Delivery</Label>
              <Input
                id="expectedDelivery"
                type="date"
                value={formData.expectedDelivery}
                onChange={(e) => handleInputChange('expectedDelivery', e.target.value)}
                disabled={!canEdit}
                data-testid="input-expected-delivery"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={formData.currency}
                onValueChange={handleCurrencyChange}
                disabled={!canEdit}
              >
                <SelectTrigger data-testid="select-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* FX Rate row — only show when currency is not AED */}
          {currency !== 'AED' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fxRateToAed">FX Rate ({currency} → AED)</Label>
                <Input
                  id="fxRateToAed"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={formData.fxRateToAed}
                  onChange={(e) => handleInputChange('fxRateToAed', e.target.value)}
                  disabled={!canEdit}
                  data-testid="input-fx-rate"
                />
              </div>
            </div>
          )}

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Line Items</h3>
              {canEdit && formData.brandId && (
                <Button type="button" variant="outline" onClick={addItem} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            {!formData.brandId && (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                <p>Please select a brand first to add line items</p>
              </div>
            )}

            {formData.items.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Product Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price ({currency})</TableHead>
                      <TableHead>Line Total ({currency})</TableHead>
                      {canEdit && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={item.productId}
                            onValueChange={(value) => updateItem(index, 'productId', value)}
                            disabled={!canEdit}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {getFilteredProducts().map(product => (
                                <SelectItem key={product.id} value={product.id.toString()}>
                                  {product.name}{product.description ? ` - ${product.description}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{item.productSku}</TableCell>
                        <TableCell>
                          <Input
                            value={item.productName}
                            onChange={(e) => updateItem(index, 'productName', e.target.value)}
                            disabled={!canEdit}
                            className="min-w-[140px]"
                            placeholder="Description"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.size || ''}
                            onChange={(e) => updateItem(index, 'size', e.target.value)}
                            disabled={!canEdit}
                            className="w-24"
                            placeholder="Size"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            disabled={!canEdit}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            disabled={!canEdit}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>{currency} {item.lineTotal.toFixed(2)}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(index)}
                              data-testid={`button-remove-item-${index}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div></div>
              <div></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Subtotal</span>
                  <span data-testid="text-subtotal">{formatCurrency(formData.totalAmount, currency)}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span data-testid="text-total">{formatCurrency(formData.totalAmount, currency)}</span>
                </div>
                {currency !== 'AED' && (
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Total (AED)</span>
                    <span data-testid="text-total-aed">{formatCurrency(totalAed, 'AED')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reconciliation panel — only shown for closed POs */}
          {showReconciliation && (
            <div className={`rounded-lg border p-4 space-y-3 ${isShortDelivery ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center gap-2">
                {isShortDelivery ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                ) : (
                  <PackageCheck className="w-4 h-4 text-green-600" />
                )}
                <span className={`text-sm font-semibold ${isShortDelivery ? 'text-amber-800' : 'text-green-800'}`}>
                  Delivery Reconciliation
                </span>
                {isShortDelivery && (
                  <span className="ml-auto text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 rounded-full px-2 py-0.5">
                    Short Delivery
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-xs text-gray-500 mb-1">Ordered</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(totalInCurrency, currency)}</p>
                  {currency !== 'AED' && <p className="text-xs text-gray-500">{formatCurrency(totalAed, 'AED')}</p>}
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-xs text-gray-500 mb-1">Received</p>
                  <p className={`font-semibold ${isShortDelivery ? 'text-amber-700' : 'text-green-700'}`}>
                    {formatCurrency(reconciledTotal, currency)}
                  </p>
                  {currency !== 'AED' && <p className="text-xs text-gray-500">{formatCurrency(reconciledAed, 'AED')}</p>}
                </div>
                <div className="text-center p-2 bg-white rounded border">
                  <p className="text-xs text-gray-500 mb-1">Difference</p>
                  <p className={`font-semibold ${isShortDelivery ? 'text-red-600' : 'text-green-700'}`}>
                    {isShortDelivery ? '-' : ''}{formatCurrency(Math.abs(totalInCurrency - reconciledTotal), currency)}
                  </p>
                  {currency !== 'AED' && (
                    <p className="text-xs text-gray-500">{isShortDelivery ? '-' : ''}{formatCurrency(Math.abs(totalAed - reconciledAed), 'AED')}</p>
                  )}
                </div>
              </div>
              {formData.items.some(i => (i.receivedQuantity ?? 0) > 0) && (
                <div className="text-xs text-gray-600 border-t pt-2">
                  <div className="grid grid-cols-4 gap-1 font-medium text-gray-500 mb-1">
                    <span>Product</span>
                    <span className="text-right">Ordered</span>
                    <span className="text-right">Received</span>
                    <span className="text-right">Payable</span>
                  </div>
                  {formData.items.map((item, i) => {
                    const payable = (item.receivedQuantity ?? 0) * (parseFloat(item.unitPrice) || 0);
                    const isItemShort = (item.receivedQuantity ?? 0) < item.quantity;
                    return (
                      <div key={i} className="grid grid-cols-4 gap-1 py-0.5">
                        <span className="truncate">{item.productName || item.productSku}</span>
                        <span className="text-right">{item.quantity}</span>
                        <span className={`text-right font-medium ${isItemShort ? 'text-amber-700' : ''}`}>{item.receivedQuantity ?? 0}</span>
                        <span className="text-right">{formatCurrency(payable, currency)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Supplier Documents panel — only shown when viewing an existing PO */}
          {editingPO && (
            <Collapsible open={supplierDocsOpen} onOpenChange={setSupplierDocsOpen}>
              <div className="rounded-lg border border-blue-200 bg-blue-50/40">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-100/40 transition-colors rounded-lg"
                  >
                    <Paperclip className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm font-semibold text-blue-800 flex-1">Supplier Documents</span>
                    <span className="text-xs text-blue-500 mr-2">Per-delivery invoices &amp; supporting files</span>
                    {supplierDocsOpen ? (
                      <ChevronDown className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4 space-y-2">
                    {loadingGrnDocs ? (
                      <p className="text-xs text-gray-500">Loading documents...</p>
                    ) : (() => {
                      const grnInvoices = grnDocs.filter(grn => grn.scanKey1);
                      const supportingDocs = grnDocs.flatMap(grn =>
                        [
                          grn.scanKey2 && { key: grn.scanKey2, grn, slot: 2 },
                          grn.scanKey3 && { key: grn.scanKey3, grn, slot: 3 },
                        ].filter(Boolean)
                      );
                      const hasAnyDoc = grnInvoices.length > 0 || poScanKey || supportingDocs.length > 0;

                      const extractFilename = (key) => {
                        if (!key) return '';
                        const last = key.split('/').pop() || key;
                        return last.replace(/^\d{10,}-/, '');
                      };

                      return (
                        <div className="space-y-2">
                          {/* Block 1: GRN per-delivery invoices (slot 1 per GRN) */}
                          {grnInvoices.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-gray-600">Per-Delivery Invoices</p>
                              {grnInvoices.map(grn => (
                                <div key={grn.id} className="flex items-center gap-3 bg-white border border-blue-100 rounded px-3 py-2">
                                  <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">{grn.receiptNumber}</p>
                                    <p className="text-xs text-gray-500">
                                      {grn.receivedDate ? format(new Date(grn.receivedDate), 'dd/MM/yy') : '—'} · Supplier Invoice
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-blue-600 hover:text-blue-800"
                                    onClick={() => handleViewDoc(grn.scanKey1)}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                    View
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Block 2: PO-level uploaded document — always shown if set */}
                          {poScanKey && (
                            <div className={`space-y-1.5 ${grnInvoices.length > 0 ? 'pt-1.5 border-t border-blue-100' : ''}`}>
                              <p className="text-xs font-medium text-gray-600">PO-level Document</p>
                              <div className="flex items-center gap-3 bg-white border border-blue-100 rounded px-3 py-2">
                                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800 truncate">{extractFilename(poScanKey)}</p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-blue-600 hover:text-blue-800"
                                  onClick={() => handleViewDoc(poScanKey)}
                                >
                                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                  View
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-red-500 hover:text-red-700"
                                  onClick={handleDeletePoDoc}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Block 3: GRN supporting documents (slots 2 & 3) */}
                          {supportingDocs.length > 0 && (
                            <div className="pt-1.5 border-t border-blue-100">
                              <p className="text-xs font-medium text-gray-600 mb-1.5">Supporting Documents</p>
                              {supportingDocs.map(({ key, grn, slot }) => (
                                <div key={`${grn.id}-${slot}`} className="flex items-center gap-3 bg-white border border-blue-100 rounded px-3 py-2 mb-1">
                                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate">{grn.receiptNumber} — Supporting Doc {slot}</p>
                                    <p className="text-xs text-gray-500">
                                      {grn.receivedDate ? format(new Date(grn.receivedDate), 'dd/MM/yy') : '—'}
                                    </p>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-blue-600 hover:text-blue-800"
                                    onClick={() => handleViewDoc(key)}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                    View
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Empty state — only shown when no documents at all */}
                          {!hasAnyDoc && (
                            <p className="text-xs text-gray-500 italic">No documents attached yet. Use the Goods Receipts tab to attach a per-delivery invoice, or use the ⋮ menu on the PO to upload a document.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              disabled={!canEdit}
              data-testid="textarea-notes"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
            {canEdit && (
              <Button type="submit" disabled={loading} data-testid="button-save">
                {loading ? 'Saving...' : editingPO ? 'Update' : 'Create'}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmPoDocDeleteOpen} onOpenChange={setConfirmPoDocDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Document</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the document from this purchase order. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={handleConfirmPoDocDelete}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
