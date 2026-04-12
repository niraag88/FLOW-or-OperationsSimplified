
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
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { DeliveryOrder as DOEntity } from "@/api/entities";
import { Product as ProductEntity } from "@/api/entities";
import { Customer as CustomerEntity } from "@/api/entities";
import { Brand as BrandEntity } from "@/api/entities";
import type { DeliveryOrder, Customer, Brand, Product } from "@shared/schema";
import { Card } from "@/components/ui/card";

const toNum = (v: unknown): number => parseFloat(String(v)) || 0;

const normalizeDoData = (data: Record<string, unknown>) => ({
  ...data,
  subtotal: toNum(data.subtotal),
  tax_amount: toNum(data.tax_amount),
  total_amount: toNum(data.total_amount),
  tax_rate: toNum(data.tax_rate) || 0.05,
});

const getInitialDOFormData = () => ({
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
  show_remarks: false,
  items: [] as DOItem[]
});

interface DOItem {
  brand_id: string | number;
  brand_name: string;
  product_id: string | number;
  product_code: string;
  description: string;
  size: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface DOFormProps {
  open: boolean;
  onClose: () => void;
  editingDO?: Record<string, unknown> | null;
  currentUser?: { email?: string; role?: string } | null;
  onSuccess?: () => void;
}

export default function DOForm({ open, onClose, editingDO, currentUser, onSuccess }: DOFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [formData, setFormData] = useState(getInitialDOFormData);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, editingDO]);

  const loadData = async () => {
    try {
      setLoading(true);
      setFormData(getInitialDOFormData());

      const isEditing = !!(editingDO && editingDO.id);
      const isNewFromDocument = !!(editingDO && !editingDO.id);
      const isNew = !editingDO;
      const needsNextNumber = isNew || isNewFromDocument;

      const settled = await Promise.allSettled([
        CustomerEntity.list(),
        ProductEntity.list(),
        BrandEntity.list(),
        needsNextNumber
          ? fetch('/api/delivery-orders/next-number', { credentials: 'include' })
          : Promise.resolve(null),
        isEditing
          ? fetch(`/api/delivery-orders/${editingDO.id}`, { credentials: 'include' })
          : Promise.resolve(null),
      ]);

      const customersData = (settled[0].status === 'fulfilled' ? (settled[0].value || []) : []) as Customer[];
      const productsData  = (settled[1].status === 'fulfilled' ? (settled[1].value || []) : []) as Product[];
      const brandsData    = (settled[2].status === 'fulfilled' ? (settled[2].value || []) : []) as Brand[];
      const nextNumResp   = settled[3].status === 'fulfilled' ? settled[3].value : null;
      const fullDOResp    = settled[4].status === 'fulfilled' ? settled[4].value : null;

      const filteredCustomers = customersData.filter((c) => c.isActive !== false);
      const filteredBrands    = brandsData.filter((b) => b.isActive !== false);

      setCustomers(filteredCustomers);
      setProducts(productsData);
      setBrands(filteredBrands);

      let nextNumber = '';
      if (needsNextNumber && nextNumResp && nextNumResp.ok) {
        try {
          const data = await nextNumResp.json();
          nextNumber = data.nextNumber || '';
        } catch {}
      }

      if (isNew) {
        setFormData(prev => ({ ...prev, do_number: nextNumber }));
      } else if (isNewFromDocument) {
        // New DO created from existing document — customer_id already validated by handleDocumentSelect
        const customer = filteredCustomers.find((c) => c.id === editingDO.customer_id);
        setSelectedCustomer(customer || null);
        setFormData(normalizeDoData({
          ...getInitialDOFormData(),
          ...editingDO,
          do_number: nextNumber,
          items: editingDO.items || [],
        }) as Parameters<typeof setFormData>[0]);
      } else {
        // Editing an existing DO — fetch full DO data
        let full: Record<string, unknown> | null = null;
        if (fullDOResp && fullDOResp.ok) {
          try { full = await fullDOResp.json(); } catch {}
        }
        if (full) {
          const customer = filteredCustomers.find((c) => c.id === full.customer_id);
          setSelectedCustomer(customer || null);
          setFormData(normalizeDoData({
            ...getInitialDOFormData(),
            ...full,
            items: full.items || []
          }) as Parameters<typeof setFormData>[0]);
        } else {
          // Fallback to passed data
          const customer = filteredCustomers.find((c) => c.id === editingDO.customer_id);
          setSelectedCustomer(customer || null);
          setFormData(normalizeDoData({ ...getInitialDOFormData(), ...editingDO, items: editingDO.items || [] }) as Parameters<typeof setFormData>[0]);
        }
      }
    } catch (error: unknown) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => {
      let newState = { ...prev, [field]: value };

      // Handle customer change logic
      if (field === 'customer_id') {
        const customerId = parseInt(String(value));
        const customer = customers.find((c) => c.id === customerId);
        setSelectedCustomer(customer ?? null);
        
        let taxTreatment = "StandardRated";
        let taxRate = 0.05;
        
        if (customer && (customer.vatTreatment === "ZeroRated" || customer.vatTreatment === "International" || (customer as Record<string, unknown>).type === "International")) {
          taxTreatment = "ZeroRated";
          taxRate = 0;
        }
        
        newState = { 
          ...newState, 
          customer_id: String(customerId), 
          tax_treatment: taxTreatment, 
          tax_rate: taxRate 
        };
      }
      return newState;
    });
  };

  useEffect(() => {
    const subtotal = formData.items.reduce((sum: number, item: DOItem) => sum + (item.line_total || 0), 0);
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
      size: "",
      quantity: 1,
      unit_price: 0,
      line_total: 0
    };
    setFormData(prev => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const updateItem = (index: number, field: keyof DOItem, value: string | number) => {
    const newItems = [...formData.items];
    
    // Convert string values to numbers for ID fields
    if (field === 'brand_id' || field === 'product_id') {
      value = parseInt(String(value));
    }
    
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'brand_id') {
      const brand = brands.find((b) => b.id === value);
      newItems[index] = {
        ...newItems[index],
        brand_name: brand?.name || "",
        product_id: "",
        product_code: "",
        description: "",
        size: "",
        unit_price: 0,
        line_total: 0
      };
    }

    if (field === 'product_id' && value) {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          product_code: product.sku || "",
          description: `${product.name || ''}${product.description ? ` - ${product.description}` : ''}`,
          size: product.size ?? "",
          unit_price: parseFloat(String(product.unitPrice || 0)) || 0
        };
      }
    }

    if (['quantity', 'unit_price'].includes(field) || field === 'product_id') {
      const quantity = field === 'quantity' ? (parseInt(String(value)) || 0) : (newItems[index].quantity || 0);
      const unitPrice = field === 'unit_price' ? (parseFloat(String(value)) || 0) : (newItems[index].unit_price || 0);
      newItems[index].line_total = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const getFilteredProducts = (brandId: string | number) => {
    if (!brandId) return [];
    return products.filter((product) => String(product.brandId) === String(brandId));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({ 
      ...prev, 
      items: prev.items.filter((_, i) => i !== index) 
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_id || !formData.do_number) return;

    setLoading(true);
    try {
      const doData = {
        ...formData,
        subtotal: parseFloat(formData.subtotal.toFixed(2)),
        tax_amount: parseFloat(formData.tax_amount.toFixed(2)),
        total_amount: parseFloat(formData.total_amount.toFixed(2)),
        items: formData.items.map((item: DOItem) => ({
          ...item,
          line_total: parseFloat((item.line_total || 0).toFixed(2))
        }))
      };

      if (editingDO && editingDO.id) {
        await DOEntity.update(editingDO.id as string | number, doData);
      } else {
        await DOEntity.create(doData);
      }
      
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error("Error saving DO:", error);
    } finally {
      setLoading(false);
    }
  };

  const isEditable = !['delivered', 'cancelled'].includes(formData.status);

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

        <form onSubmit={handleSubmit} className="space-y-6" data-testid="do-form">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="do_number">DO Number *</Label>
              <Input 
                id="do_number" 
                data-testid="input-do-number"
                value={formData.do_number} 
                onChange={(e) => handleInputChange('do_number', e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select value={formData.customer_id ? formData.customer_id.toString() : ''} onValueChange={(value) => handleInputChange('customer_id', value)} disabled={!isEditable}>
                <SelectTrigger id="customer" data-testid="select-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)} disabled={!isEditable}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
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
                <Button type="button" variant="outline" onClick={addItem} data-testid="button-add-item">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            {formData.items.length > 0 && (
              <div className="space-y-4">
                {formData.items.map((item, index) => (
                  <Card key={index} className="p-4" data-testid={`do-item-row-${index}`}>
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                      <div className="space-y-2">
                        <Label>Brand</Label>
                        <Select 
                          value={item.brand_id ? String(item.brand_id) : ''} 
                          onValueChange={(v) => updateItem(index, 'brand_id', v)} 
                          disabled={!isEditable}
                        >
                          <SelectTrigger data-testid={`select-brand-${index}`}>
                            <SelectValue placeholder="Select brand" />
                          </SelectTrigger>
                          <SelectContent>
                            {brands.map((b) => (
                              <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Product</Label>
                        <Select 
                          value={item.product_id ? String(item.product_id) : ''} 
                          onValueChange={(v) => updateItem(index, 'product_id', v)} 
                          disabled={!isEditable || !item.brand_id}
                        >
                          <SelectTrigger data-testid={`select-product-${index}`}>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {getFilteredProducts(item.brand_id).map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                <div className="flex flex-col">
                                  <p className="font-medium truncate">{p.name}{p.size ? ` (${p.size})` : ''}</p>
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
                          data-testid={`input-description-${index}`}
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
                          data-testid={`input-quantity-${index}`}
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
                          data-testid={`input-unit-price-${index}`}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Total</Label>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">AED {(item.line_total || 0).toFixed(2)}</span>
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
                <span className="font-semibold">AED {formData.subtotal.toFixed(2)}</span>
              </div>
              {formData.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT ({(formData.tax_rate * 100).toFixed(1)}%):</span>
                  <span className="font-semibold">AED {formData.tax_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="font-bold">Total:</span>
                <span className="font-bold text-amber-600">AED {formData.total_amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="remarks">Remarks</Label>
              <div className="flex items-center space-x-2">
                <Label htmlFor="show_remarks" className="text-sm font-normal">
                  Show in output
                </Label>
                <Switch 
                  id="show_remarks"
                  checked={formData.show_remarks || false}
                  onCheckedChange={(checked) => handleInputChange('show_remarks', checked)}
                  disabled={!isEditable}
                />
              </div>
            </div>
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
              <Button type="submit" disabled={loading} className="bg-amber-600 hover:bg-amber-700" data-testid="button-save-do">
                {loading ? "Saving..." : (editingDO && editingDO.id ? "Update" : "Create")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
