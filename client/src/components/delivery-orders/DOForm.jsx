
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
import { Plus, Trash2 } from "lucide-react";
import { DeliveryOrder } from "@/api/entities";
import { Product } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Brand } from "@/api/entities";
import { Card } from "@/components/ui/card";

export default function DOForm({ open, onClose, editingDO, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [formData, setFormData] = useState({
    do_number: "",
    customer_id: "",
    order_date: new Date().toISOString().split('T')[0],
    reference: "",
    reference_date: "",
    status: "draft",
    currency: "AED",
    tax_treatment: "StandardRated",
    tax_rate: 0.05,
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    remarks: "",
    attachments: [],
    items: []
  });

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [customersData, productsData, brandsData] = await Promise.all([
        Customer.list().catch(() => []),
        Product.list().catch(() => []),
        Brand.list().catch(() => [])
      ]);

      setCustomers(customersData.filter(c => c.isActive !== false));
      setProducts(productsData);
      setBrands(brandsData.filter(b => b.isActive !== false));

      if (editingDO) {
        const customer = customersData.find(c => c.id === editingDO.customer_id);
        setSelectedCustomer(customer);
        setFormData({
          ...editingDO,
          items: editingDO.items || []
        });
      } else {
        // Generate DO number for new DO
        const timestamp = Date.now().toString().slice(-6);
        setFormData(prev => ({ 
          ...prev, 
          do_number: `DO-${timestamp}` 
        }));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      let newState = { ...prev, [field]: value };

      // Handle customer change logic
      if (field === 'customer_id') {
        const customer = customers.find(c => c.id === value);
        setSelectedCustomer(customer);
        
        let taxTreatment = "StandardRated";
        let taxRate = 0.05;
        
        if (customer && customer.type === "International") {
          taxTreatment = "ZeroRated";
          taxRate = 0;
        }
        
        newState = { 
          ...newState, 
          customer_id: value, 
          tax_treatment: taxTreatment, 
          tax_rate: taxRate 
        };
      }
      return newState;
    });
  };

  useEffect(() => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    const taxAmount = formData.tax_treatment === 'StandardRated' ? subtotal * formData.tax_rate : 0;
    const totalAmount = subtotal + taxAmount;
    
    setFormData(prev => ({ 
      ...prev, 
      subtotal, 
      tax_amount: taxAmount, 
      total_amount: totalAmount 
    }));
  }, [formData.items, formData.tax_rate, formData.tax_treatment]);

  const addItem = () => {
    const newItem = {
      brand_id: "",
      brand_name: "",
      product_id: "",
      product_code: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      line_total: 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'brand_id') {
      const brand = brands.find(b => b.id === value);
      newItems[index] = {
        ...newItems[index],
        brand_name: brand?.name || "",
        product_id: "",
        product_code: "",
        description: "",
        unit_price: 0,
        line_total: 0
      };
    }

    if (field === 'product_id' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          product_code: product.sku || "",
          description: `${product.name || ''}${product.description ? ` - ${product.description}` : ''}`,
          unit_price: product.unitPrice || 0
        };
      }
    }

    if (['quantity', 'unit_price'].includes(field) || field === 'product_id') {
      const quantity = field === 'quantity' ? (parseInt(value) || 0) : (newItems[index].quantity || 0);
      const unitPrice = field === 'unit_price' ? (parseFloat(value) || 0) : (newItems[index].unit_price || 0);
      newItems[index].line_total = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const getFilteredProducts = (brandId) => {
    if (!brandId) return [];
    return products.filter(product => product.brandId === brandId);
  };

  const removeItem = (index) => {
    setFormData(prev => ({ 
      ...prev, 
      items: prev.items.filter((_, i) => i !== index) 
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.customer_id || !formData.do_number) return;

    setLoading(true);
    try {
      const doData = {
        ...formData,
        subtotal: parseFloat(formData.subtotal.toFixed(2)),
        tax_amount: parseFloat(formData.tax_amount.toFixed(2)),
        total_amount: parseFloat(formData.total_amount.toFixed(2)),
        items: formData.items.map(item => ({
          ...item,
          line_total: parseFloat((item.line_total || 0).toFixed(2))
        }))
      };

      if (editingDO && editingDO.id) {
        await DeliveryOrder.update(editingDO.id, doData);
      } else {
        await DeliveryOrder.create(doData);
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving DO:", error);
    } finally {
      setLoading(false);
    }
  };

  const isEditable = !editingDO || !['delivered', 'cancelled'].includes(editingDO?.status);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingDO && editingDO.id ? `Edit DO ${editingDO.do_number}` : 'New Delivery Order'}
          </DialogTitle>
          <DialogDescription>
            {editingDO && editingDO.id ? 'Update delivery order details' : 'Create a new delivery order'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="do_number">DO Number *</Label>
              <Input 
                id="do_number" 
                value={formData.do_number} 
                onChange={(e) => handleInputChange('do_number', e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select value={formData.customer_id} onValueChange={(value) => handleInputChange('customer_id', value)} disabled={!isEditable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customer_name} ({c.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)} disabled={!isEditable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="order_date">Order Date *</Label>
              <Input 
                id="order_date" 
                type="date" 
                value={formData.order_date} 
                onChange={(e) => handleInputChange('order_date', e.target.value)} 
                disabled={!isEditable} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input 
                id="reference" 
                value={formData.reference} 
                onChange={(e) => handleInputChange('reference', e.target.value.slice(0, 20))} 
                disabled={!isEditable} 
                maxLength={20} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_date">Reference Date</Label>
              <Input 
                id="reference_date" 
                type="date" 
                value={formData.reference_date} 
                onChange={(e) => handleInputChange('reference_date', e.target.value)} 
                disabled={!isEditable} 
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Line Items</h3>
              {isEditable && (
                <Button type="button" variant="outline" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            {formData.items.length > 0 && (
              <div className="space-y-4">
                {formData.items.map((item, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Brand</Label>
                        <Select 
                          value={item.brand_id || ''} 
                          onValueChange={(v) => updateItem(index, 'brand_id', v)} 
                          disabled={!isEditable}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select brand" />
                          </SelectTrigger>
                          <SelectContent>
                            {brands.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Product</Label>
                        <Select 
                          value={item.product_id || ''} 
                          onValueChange={(v) => updateItem(index, 'product_id', v)} 
                          disabled={!isEditable || !item.brand_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {getFilteredProducts(item.brand_id).map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                <div className="flex flex-col">
                                  <p className="font-medium truncate">{p.name}</p>
                                  {p.description && <p className="text-sm text-gray-500">{p.description}</p>}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Description</Label>
                        <Input 
                          value={item.description} 
                          onChange={(e) => updateItem(index, 'description', e.target.value)} 
                          disabled={!isEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={item.quantity} 
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)} 
                          disabled={!isEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Unit Price</Label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={item.unit_price} 
                          onChange={(e) => updateItem(index, 'unit_price', e.target.value)} 
                          disabled={!isEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Total</Label>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{(item.line_total || 0).toFixed(2)} AED</span>
                          {isEditable && (
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => removeItem(index)}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
          {/* Totals */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="space-y-2 max-w-sm ml-auto">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">{formData.subtotal.toFixed(2)} AED</span>
              </div>
              {formData.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT ({(formData.tax_rate * 100).toFixed(1)}%):</span>
                  <span className="font-semibold">{formData.tax_amount.toFixed(2)} AED</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="font-bold">Total:</span>
                <span className="font-bold text-amber-600">{formData.total_amount.toFixed(2)} AED</span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={formData.remarks || ''}
              onChange={(e) => handleInputChange('remarks', e.target.value)}
              disabled={!isEditable}
              rows={3}
              placeholder="Add any additional remarks here..."
            />
          </div>
          
          {/* Submit Buttons */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {isEditable && (
              <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700">
                {loading ? "Saving..." : (editingDO && editingDO.id ? "Update" : "Create")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
