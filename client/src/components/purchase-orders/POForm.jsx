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
import { Brand } from "@/api/entities";
import { Product } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { formatDate } from "@/utils/dateUtils";

export default function POForm({ open, onClose, editingPO, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [products, setProducts] = useState([]);
  
  // Simple form state
  const [formData, setFormData] = useState({
    poNumber: "",
    supplierId: "",
    orderDate: new Date().toISOString().split('T')[0],
    expectedDelivery: "",
    status: "draft",
    notes: "",
    totalAmount: "0.00",
    items: []
  });

  // Load data when dialog opens
  useEffect(() => {
    if (open) {
      loadInitialData();
    }
  }, [open]);

  // Load data when editing
  useEffect(() => {
    if (open && editingPO) {
      loadEditingData();
    }
  }, [open, editingPO]);

  const loadInitialData = async () => {
    try {
      const [brandsData, productsData] = await Promise.all([
        Brand.list(),
        Product.list()
      ]);
      
      setBrands(brandsData.filter(b => b.isActive));
      setProducts(productsData);
      
      if (!editingPO) {
        generatePONumber();
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const loadEditingData = async () => {
    if (!editingPO) return;
    
    try {
      // Set basic form data
      setFormData({
        poNumber: editingPO.poNumber || "",
        supplierId: editingPO.supplierId?.toString() || "",
        orderDate: editingPO.orderDate ? formatDate(editingPO.orderDate, 'yyyy-MM-dd') : "",
        expectedDelivery: editingPO.expectedDelivery ? formatDate(editingPO.expectedDelivery, 'yyyy-MM-dd') : "",
        status: editingPO.status || "draft",
        notes: editingPO.notes || "",
        totalAmount: editingPO.totalAmount || "0.00",
        items: []
      });
      
      // Load line items
      if (editingPO.id) {
        const response = await fetch(`/api/purchase-orders/${editingPO.id}/items`);
        if (response.ok) {
          const items = await response.json();
          const formattedItems = items.map(item => ({
            id: item.id,
            productId: item.productId?.toString() || "",
            productSku: item.productSku || "",
            productName: item.productName || "",
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
      // Get the latest PO number to calculate the next sequence
      const response = await fetch('/api/purchase-orders');
      const existingPOs = await response.json();
      
      const currentYear = new Date().getFullYear();
      const currentYearPOs = existingPOs.filter(po => 
        po.poNumber && po.poNumber.startsWith(`PO-${currentYear}`)
      );
      
      let nextNumber = 1;
      if (currentYearPOs.length > 0) {
        // Extract sequence numbers and find the highest
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
      // Fallback to simple numbering
      const poNumber = `PO-${new Date().getFullYear()}-001`;
      setFormData(prev => ({ ...prev, poNumber }));
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    const newItem = {
      productId: "",
      productSku: "",
      productName: "",
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
    
    // Auto-fill product details when product is selected
    if (field === 'productId' && value) {
      const product = products.find(p => p.id === parseInt(value));
      if (product) {
        newItems[index].productSku = product.sku;
        newItems[index].productName = product.name;
        newItems[index].unitPrice = parseFloat(product.costPrice) || 0;
        newItems[index].lineTotal = newItems[index].quantity * (parseFloat(product.costPrice) || 0);
      }
    }
    
    // Calculate line total when quantity or price changes
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].lineTotal = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
    }
    
    setFormData(prev => ({ ...prev, items: newItems }));
    
    // Update total amount
    const total = newItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
  };

  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, items: newItems }));
    
    // Update total amount
    const total = newItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
    setFormData(prev => ({ ...prev, totalAmount: total.toFixed(2) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const submitData = {
        poNumber: formData.poNumber,
        supplierId: parseInt(formData.supplierId),
        orderDate: formData.orderDate + 'T00:00:00.000Z',
        expectedDelivery: formData.expectedDelivery ? formData.expectedDelivery + 'T00:00:00.000Z' : null,
        status: formData.status,
        notes: formData.notes,
        totalAmount: formData.totalAmount,
        grandTotal: formData.totalAmount
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
    setFormData({
      poNumber: "",
      supplierId: "",
      orderDate: new Date().toISOString().split('T')[0],
      expectedDelivery: "",
      status: "draft",
      notes: "",
      totalAmount: "0.00",
      items: []
    });
  };

  const getFilteredProducts = () => {
    if (!formData.supplierId) return [];
    return products.filter(p => p.brandId === parseInt(formData.supplierId));
  };

  const canEdit = !editingPO || editingPO.status !== 'closed';

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
              <Label htmlFor="supplierId">Brand *</Label>
              <Select 
                value={formData.supplierId} 
                onValueChange={(value) => handleInputChange('supplierId', value)}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>

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
                <p>Please select a brand first to add line items</p>
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
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price (GBP)</TableHead>
                      <TableHead>Line Total</TableHead>
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
                                  {product.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{item.productSku}</TableCell>
                        <TableCell>{item.productName}</TableCell>
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
                        <TableCell>£{item.lineTotal.toFixed(2)}</TableCell>
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
                  <span className="font-medium">Subtotal (GBP)</span>
                  <span data-testid="text-subtotal">£{formData.totalAmount}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total (GBP)</span>
                  <span data-testid="text-total">£{formData.totalAmount}</span>
                </div>
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