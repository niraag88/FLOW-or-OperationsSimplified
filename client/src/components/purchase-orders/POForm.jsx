import React, { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { Supplier } from "@/api/entities";
import { Product } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { formatDate } from "@/utils/dateUtils";
import { getRateToAed, formatCurrency, SUPPORTED_CURRENCIES } from "@/utils/currency";

export default function POForm({ open, onClose, editingPO, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [currencyExplicitlySet, setCurrencyExplicitlySet] = useState(false);
  
  const [formData, setFormData] = useState({
    poNumber: "",
    supplierId: "",
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
      loadInitialData();
    }
  }, [open, editingPO]);

  const loadInitialData = async () => {
    try {
      const [suppliersData, productsData, settingsResponse] = await Promise.all([
        Supplier.list(),
        Product.list(),
        fetch('/api/company-settings')
      ]);
      
      const filteredSuppliers = suppliersData.filter(s => s.isActive !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setSuppliers(filteredSuppliers);
      setProducts(productsData);
      
      let settings = null;
      if (settingsResponse.ok) {
        settings = await settingsResponse.json();
        setCompanySettings(settings);
      }
      
      if (editingPO) {
        await loadEditingData(filteredSuppliers, settings);
      } else {
        setCurrencyExplicitlySet(false);
        generatePONumber();
        if (settings) {
          const defaultRate = getRateToAed('GBP', settings);
          setFormData(prev => ({
            ...prev,
            currency: 'GBP',
            fxRateToAed: defaultRate.toFixed(4)
          }));
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const loadEditingData = async (availableSuppliers = suppliers, settings = companySettings) => {
    if (!editingPO) return;
    
    try {
      const formDataToSet = {
        poNumber: editingPO.poNumber || "",
        supplierId: editingPO.supplierId?.toString() || "",
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
      setFormData(prev => ({ ...prev, supplierId: editingPO.supplierId?.toString() || "" }));
      
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

  const generatePONumber = async () => {
    try {
      const response = await fetch('/api/purchase-orders');
      const existingPOs = await response.json();
      
      const currentYear = new Date().getFullYear();
      const currentYearPOs = existingPOs.filter(po => 
        po.poNumber && po.poNumber.startsWith(`PO-${currentYear}`)
      );
      
      let nextNumber = 1;
      if (currentYearPOs.length > 0) {
        const sequenceNumbers = currentYearPOs.map(po => {
          const match = po.poNumber.match(/PO-\d{4}-(\d{3})/);
          return match ? parseInt(match[1]) : 0;
        });
        nextNumber = Math.max(...sequenceNumbers) + 1;
      }
      
      const poNumber = `PO-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;
      setFormData(prev => ({ ...prev, poNumber }));
    } catch (error) {
      console.error("Error generating PO number:", error);
      const poNumber = `PO-${new Date().getFullYear()}-001`;
      setFormData(prev => ({ ...prev, poNumber }));
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
        supplierId: parseInt(formData.supplierId),
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
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrencyExplicitlySet(false);
    setFormData({
      poNumber: "",
      supplierId: "",
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
    if (!formData.supplierId) return [];
    return products.filter(p => p.isActive !== false);
  };

  const canEdit = !editingPO || editingPO.status !== 'closed';

  const currency = formData.currency || 'GBP';
  const fxRate = parseFloat(formData.fxRateToAed) || 4.85;
  const totalInCurrency = parseFloat(formData.totalAmount) || 0;
  const totalAed = currency === 'AED' ? totalInCurrency : totalInCurrency * fxRate;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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
              <Label htmlFor="supplierId">Supplier *</Label>
              <Select 
                value={formData.supplierId} 
                onValueChange={(value) => handleInputChange('supplierId', value)}
                disabled={!canEdit}
              >
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
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
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
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
              {canEdit && formData.supplierId && (
                <Button type="button" variant="outline" onClick={addItem} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            {!formData.supplierId && (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                <p>Please select a supplier first to add line items</p>
              </div>
            )}

            {formData.items.length > 0 && (
              <div className="rounded-md border">
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
                                  {product.name}{product.size ? ` - ${product.size}` : ''}
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
  );
}
