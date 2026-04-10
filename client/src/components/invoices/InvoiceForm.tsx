
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
import { Invoice as InvoiceEntity } from "@/api/entities";
import { Product as ProductEntity } from "@/api/entities";
import { Customer as CustomerEntity } from "@/api/entities";
import { Brand as BrandEntity } from "@/api/entities";
import type { Invoice } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const getInitialFormData = (invoiceNumber = '') => ({
  invoice_number: invoiceNumber || "",
  customer_id: "",
  invoice_date: new Date().toISOString().split('T')[0],
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
  attachments: [] as string[],
  items: [] as InvoiceItem[]
});


interface InvoiceItem {
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


interface FormCustomer {
  id: number;
  name: string;
  vatTreatment?: string | null;
  type?: string | null;
  isActive?: boolean;
}

interface FormBrand {
  id: number;
  name: string;
  isActive?: boolean;
}

interface FormProduct {
  id: number;
  name: string;
  sku?: string | null;
  description?: string | null;
  size?: string | null;
  unitPrice?: string | number | null;
  brandId?: number | null;
  isActive?: boolean;
}


interface EditingInvoiceData {
  [key: string]: unknown;
  id?: number;
  items?: InvoiceItem[];
  attachments?: string[];
}

interface InvoiceFormProps {
  open: boolean;
  onClose: () => void;
  editingInvoice?: EditingInvoiceData | null;
  currentUser?: { email?: string; role?: string } | null;
  canOverride?: boolean;
  onSuccess?: () => void;
}

export default function InvoiceForm({ open, onClose, editingInvoice, currentUser, canOverride, onSuccess }: InvoiceFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<FormCustomer[]>([]);
  const [products, setProducts] = useState<FormProduct[]>([]);
  const [brands, setBrands] = useState<FormBrand[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<FormCustomer | null>(null);
  const { toast } = useToast();
  const [formData, setFormData] = useState(getInitialFormData());

  useEffect(() => {
    if (!open) return;

    const loadFormData = async () => {
      try {
        setLoading(true);
        setFormData(getInitialFormData(''));

        const isEditing = !!(editingInvoice && editingInvoice.id);
        const isNewFromDocument = !!(editingInvoice && !editingInvoice.id);
        const isNew = !editingInvoice;
        const needsNextNumber = isNew || isNewFromDocument;

        const settled = await Promise.allSettled([
          CustomerEntity.list(),
          ProductEntity.list(),
          BrandEntity.list(),
          needsNextNumber
            ? fetch('/api/invoices/next-number', { credentials: 'include' })
            : Promise.resolve(null),
          isEditing
            ? fetch(`/api/invoices/${editingInvoice.id}`, { credentials: 'include' })
            : Promise.resolve(null),
        ]);

        const customersData = settled[0].status === 'fulfilled' ? (settled[0].value || []) : [];
        const productsData  = settled[1].status === 'fulfilled' ? (settled[1].value || []) : [];
        const brandsData    = settled[2].status === 'fulfilled' ? (settled[2].value || []) : [];
        const nextNumResp   = settled[3].status === 'fulfilled' ? settled[3].value : null;
        const fullInvResp   = settled[4].status === 'fulfilled' ? settled[4].value : null;

        const filteredCustomers = (customersData as FormCustomer[]).filter((c) => c.isActive !== false);
        const filteredBrands    = (brandsData as FormBrand[]).filter((b) => b.isActive !== false);

        setCustomers(filteredCustomers);
        setProducts(productsData as FormProduct[]);
        setBrands(filteredBrands);

        let nextNumber = '';
        if (needsNextNumber && nextNumResp && nextNumResp.ok) {
          try {
            const data = await nextNumResp.json();
            nextNumber = data.nextNumber || '';
          } catch {}
        }

        if (isNew) {
          setFormData(getInitialFormData(nextNumber));
        } else if (isNewFromDocument) {
          setFormData(prev => ({
            ...prev,
            ...(editingInvoice as Record<string, unknown>),
            invoice_number: nextNumber,
            status: 'draft',
            invoice_date: new Date().toISOString().split('T')[0],
            items: editingInvoice.items || [],
            attachments: editingInvoice.attachments || [],
          } as typeof prev));
        } else {
          let full: Record<string, unknown> | null = null;
          if (fullInvResp && fullInvResp.ok) {
            try { full = await fullInvResp.json(); } catch {}
          }
          if (full) {
            let resolvedCustomerId: string | number | null = (full['customer_id'] as string | number | null) ?? null;
            if (!resolvedCustomerId && full['customer_name'] && filteredCustomers.length > 0) {
              const matched = filteredCustomers.find((c) =>
                c.name?.trim().toLowerCase() === (full['customer_name'] as string)?.trim().toLowerCase()
              );
              if (matched) resolvedCustomerId = matched.id;
            }
            setFormData(prev => ({
              ...prev,
              ...full,
              customer_id: String(resolvedCustomerId || full['customer_id'] || ''),
              status: (full['status'] && full['status'] !== 'draft') ? 'submitted' : (String(full['status'] || '') || 'draft'),
            } as typeof prev));
          } else {
            setFormData(prev => ({
              ...prev,
              ...(editingInvoice as Record<string, unknown>),
              items: editingInvoice.items || [],
              attachments: editingInvoice.attachments || [],
            } as typeof prev));
          }
        }
      } catch (error: unknown) {
        console.error('Error loading invoice form data:', error);
        toast({ title: 'Error', description: 'Failed to load required data.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadFormData();
  }, [open, editingInvoice]);

  useEffect(() => {
    // Effect to update the selected customer object whenever the customer_id in formData changes
    if (formData.customer_id && customers.length > 0) {
      const customer = customers.find((c) => String(c.id) === String(formData.customer_id)) ?? null;
      setSelectedCustomer(customer);
    } else if (!formData.customer_id) {
      setSelectedCustomer(null);
    }
  }, [formData.customer_id, customers]);


  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => {
      let updatedData = { ...prev, [field]: value };

      // Handle customer change logic
      if (field === 'customer_id') {
        const customerId = parseInt(String(value));
        const customer = customers.find((c) => c.id === customerId);
        updatedData.customer_id = String(customerId);
        
        let taxTreatment = "StandardRated";
        let taxRate = 0.05;
        
        if (customer && (customer.vatTreatment === "ZeroRated" || customer.vatTreatment === "International" || customer.type === "International")) {
          taxTreatment = "ZeroRated";
          taxRate = 0;
        }
        
        updatedData = { 
          ...updatedData, 
          currency: "AED", // Always enforce AED currency
          tax_treatment: taxTreatment, 
          tax_rate: taxRate 
        };
      }
      return updatedData;
    });
  };

  // Calculate totals when items change
  useEffect(() => {
    const subtotal = formData.items.reduce((sum: number, item: InvoiceItem) => sum + (item.line_total || 0), 0);
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

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...formData.items];
    
    // Convert string values to numbers for ID fields
    if (field === 'brand_id' || field === 'product_id') {
      value = parseInt(String(value));
    }
    
    // Check if brand_id is actually changing to prevent clearing during form initialization
    const isChangingBrand = field === 'brand_id' && newItems[index].brand_id !== value;
    
    newItems[index] = { ...newItems[index], [field]: value };

    if (isChangingBrand) {
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
    } else if (field === 'brand_id') {
      // Just update brand_name without clearing other fields
      const brand = brands.find((b) => b.id === value);
      newItems[index] = {
        ...newItems[index],
        brand_name: brand?.name || "",
      };
    }

    if (field === 'product_id' && value) {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          product_code: product.sku || "",
          description: `${product.name || ''}${product.description ? ` - ${product.description}` : ''}`,
          size: product.size || "",
          unit_price: Number(product.unitPrice) || 0
        };
      }
    }

    // Recalculate line total
    if (['quantity', 'unit_price'].includes(field) || field === 'product_id') {
      const quantity = field === 'quantity' ? (parseInt(String(value)) || 0) : (newItems[index].quantity || 0);
      const unitPrice = field === 'unit_price' ? (parseFloat(String(value)) || 0) : (newItems[index].unit_price || 0);
      newItems[index].line_total = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const getFilteredProducts = (brandId: string | number) => {
    if (!brandId) return [];
    return products.filter((product) => Number(product.brandId) === Number(brandId));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({ 
      ...prev, 
      items: prev.items.filter((_, i) => i !== index) 
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.customer_id || isNaN(Number(formData.customer_id)) || !formData.invoice_number) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Customer and Invoice Number).",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const invoiceData = {
        invoice_number: formData.invoice_number,
        customer_id: formData.customer_id,
        invoice_date: formData.invoice_date,
        reference: formData.reference,
        reference_date: formData.reference_date,
        status: formData.status,
        currency: formData.currency,
        tax_treatment: formData.tax_treatment,
        tax_rate: formData.tax_rate,
        subtotal: parseFloat((formData.subtotal || 0).toFixed(2)),
        tax_amount: parseFloat((formData.tax_amount || 0).toFixed(2)),
        total_amount: parseFloat((formData.total_amount || 0).toFixed(2)),
        remarks: formData.remarks,
        show_remarks: formData.show_remarks,
        attachments: formData.attachments || [],
        items: formData.items.map((item: InvoiceItem) => ({
          brand_id: item.brand_id,
          brand_name: item.brand_name,
          product_id: item.product_id,
          product_code: item.product_code,
          description: item.description,
          size: item.size || "",
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          line_total: parseFloat((item.line_total || 0).toFixed(2))
        }))
      };

      let result;
      const isEditingExisting = editingInvoice && editingInvoice.id;
      
      if (isEditingExisting) {
        result = await InvoiceEntity.update(editingInvoice.id!, invoiceData);
        
        toast({
          title: "Success",
          description: "Invoice updated successfully.",
          variant: "default",
        });
      } else {
        result = await InvoiceEntity.create(invoiceData);
        
        toast({
          title: "Success",
          description: "Invoice created successfully.",
          variant: "default",
        });
      }
      
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error("Error saving invoice:", error);
      toast({
        title: "Error",
        description: `Failed to save invoice: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Determine if the form is editable
  const isCurrentlyEditable = !editingInvoice || !editingInvoice.id || canOverride || ['draft', 'submitted'].includes(String(editingInvoice?.status || ''));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingInvoice && editingInvoice.id ? `Edit Invoice ${editingInvoice.invoice_number}` : 'New Invoice'}
          </DialogTitle>
          <DialogDescription>
            {editingInvoice && editingInvoice.id ? 'Update invoice details' : 'Create a new invoice'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Header Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number *</Label>
              <Input 
                id="invoice_number" 
                value={formData.invoice_number || ''} 
                onChange={(e) => handleInputChange('invoice_number', e.target.value)} 
                disabled={(!!editingInvoice && !!editingInvoice.id) || !isCurrentlyEditable} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select value={formData.customer_id ? formData.customer_id.toString() : ''} onValueChange={(value) => handleInputChange('customer_id', value)} disabled={!isCurrentlyEditable}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}{c.type ? ` (${c.type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status || 'draft'} onValueChange={(value) => handleInputChange('status', value)} disabled={!isCurrentlyEditable}>
                <SelectTrigger>
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
              <Label htmlFor="invoice_date">Invoice Date *</Label>
              <Input 
                id="invoice_date" 
                type="date" 
                value={formData.invoice_date || ''} 
                onChange={(e) => handleInputChange('invoice_date', e.target.value)} 
                disabled={!isCurrentlyEditable} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Reference</Label>
              <Input 
                id="reference" 
                value={formData.reference || ''} 
                onChange={(e) => handleInputChange('reference', e.target.value.slice(0, 20))} 
                disabled={!isCurrentlyEditable} 
                maxLength={20} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_date">Reference Date</Label>
              <Input 
                id="reference_date" 
                type="date" 
                value={formData.reference_date || ''} 
                onChange={(e) => handleInputChange('reference_date', e.target.value)} 
                disabled={!isCurrentlyEditable} 
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Line Items</h3>
              {isCurrentlyEditable && (
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
                          value={item.brand_id ? String(item.brand_id) : ''} 
                          onValueChange={(v) => updateItem(index, 'brand_id', v)} 
                          disabled={!isCurrentlyEditable}
                        >
                          <SelectTrigger>
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
                          disabled={!isCurrentlyEditable || !item.brand_id}
                        >
                          <SelectTrigger>
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
                        <div className="flex items-center gap-2">
                          <Label>Description</Label>
                          {item.size && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                              {item.size}
                            </span>
                          )}
                        </div>
                        <Input 
                          value={item.description || ''} 
                          onChange={(e) => updateItem(index, 'description', e.target.value)} 
                          disabled={!isCurrentlyEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Input 
                          type="number" 
                          min="1" 
                          value={item.quantity} 
                          onChange={(e) => updateItem(index, 'quantity', e.target.value)} 
                          disabled={!isCurrentlyEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Unit Price</Label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={item.unit_price} 
                          onChange={(e) => updateItem(index, 'unit_price', e.target.value)} 
                          disabled={!isCurrentlyEditable} 
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Total</Label>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{(item.line_total || 0).toFixed(2)} AED</span>
                          {isCurrentlyEditable && (
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
                <span className="font-semibold">{(formData.subtotal || 0).toFixed(2)} AED</span>
              </div>
              {(formData.tax_amount || 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">VAT ({((formData.tax_rate || 0) * 100).toFixed(1)}%):</span>
                  <span className="font-semibold">{(formData.tax_amount || 0).toFixed(2)} AED</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="font-bold">Total:</span>
                <span className="font-bold text-purple-600">{(formData.total_amount || 0).toFixed(2)} AED</span>
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
                  disabled={!isCurrentlyEditable}
                />
              </div>
            </div>
            <Textarea
              id="remarks"
              value={formData.remarks || ''}
              onChange={(e) => handleInputChange('remarks', e.target.value)}
              disabled={!isCurrentlyEditable}
              rows={3}
              placeholder="Add any additional remarks here..."
            />
          </div>
          
          {/* Submit Buttons */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {isCurrentlyEditable && (
              <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700">
                {loading ? "Saving..." : (editingInvoice && editingInvoice.id ? "Update" : "Create")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
