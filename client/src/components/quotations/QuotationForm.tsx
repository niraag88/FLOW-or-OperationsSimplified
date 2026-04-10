
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { Quotation as QuotationEntity } from "@/api/entities";
import { Product as ProductEntity } from "@/api/entities";
import { Customer as CustomerEntity } from "@/api/entities";
import { Brand as BrandEntity } from "@/api/entities";
import type { Quotation } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface QuotationItem {
  brand_id: string | number;
  brand_name: string;
  product_id: string | number;
  product_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface QuotationEntity {
  id?: number;
  name?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

interface QuotationFormProps {
  open: boolean;
  onClose: () => void;
  editingQuotation?: Record<string, any> | null;
  currentUser?: { email?: string; role?: string } | null;
  canOverride?: boolean;
  onSuccess?: () => void;
  preloadedCustomers?: Record<string, any>[];
  preloadedProducts?: Record<string, any>[];
  preloadedBrands?: Record<string, any>[];
}

export default function QuotationForm({ open, onClose, editingQuotation, currentUser, canOverride, onSuccess, preloadedCustomers, preloadedProducts, preloadedBrands }: QuotationFormProps) {
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Record<string, any>[]>([]);
  const [products, setProducts] = useState<Record<string, any>[]>([]);
  const [brands, setBrands] = useState<Record<string, any>[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Record<string, any> | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    quotation_number: "",
    customer_id: "",
    quotation_date: new Date().toISOString().split('T')[0],
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
    payment_terms: "",
    attachments: [] as string[],
    items: [] as QuotationItem[]
  });

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      console.time('📝 QuotationForm - Total Load Time');
      setLoading(true);
      
      // Use preloaded data if available, otherwise fetch from API (fallback)
      let customersData, productsData, brandsData;
      
      if ((preloadedCustomers?.length ?? 0) > 0 && (preloadedProducts?.length ?? 0) > 0 && (preloadedBrands?.length ?? 0) > 0) {
        // Use preloaded data for better performance
        customersData = preloadedCustomers;
        productsData = preloadedProducts;
        brandsData = preloadedBrands;
      } else {
        // Fallback to API calls if preloaded data not available
        [customersData, productsData, brandsData] = await Promise.all([
          CustomerEntity.list().catch(() => []),
          ProductEntity.list().catch(() => []),
          BrandEntity.list().catch(() => [])
        ]);
      }

      setCustomers((customersData as Record<string, any>[] ?? []).filter((c) => c.is_active !== false));
      setProducts((productsData as Record<string, any>[] ?? []));
      setBrands((brandsData as Record<string, any>[] ?? []).filter((b) => b.isActive !== false));

      if (editingQuotation) {
        
        // 🟢 Use passed editingQuotation data immediately (like POForm does)
        const customer = (customersData as Record<string, any>[] ?? []).find((c) => c.id === editingQuotation.customerId);
        setSelectedCustomer(customer ?? null);
        
        // Set basic form data immediately from passed quotation
        const basicFormData = {
          quotation_number: editingQuotation.quoteNumber || "",
          customer_id: editingQuotation.customerId ? editingQuotation.customerId.toString() : "",
          quotation_date: editingQuotation.quoteDate ? new Date(editingQuotation.quoteDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          reference: editingQuotation.reference || "",
          reference_date: editingQuotation.referenceDate ? new Date(editingQuotation.referenceDate).toISOString().split('T')[0] : "",
          status: editingQuotation.status || "draft",
          currency: editingQuotation.currency || "AED",
          tax_treatment: editingQuotation.taxTreatment || "StandardRated", 
          tax_rate: editingQuotation.taxRate || 0.05,
          subtotal: parseFloat(editingQuotation.totalAmount || 0),
          tax_amount: parseFloat(editingQuotation.vatAmount || 0),
          total_amount: parseFloat(editingQuotation.grandTotal || 0),
          remarks: editingQuotation.notes || "",
          show_remarks: editingQuotation.showRemarks || false,
          payment_terms: editingQuotation.terms || "", // Preserve existing payment terms
          attachments: editingQuotation.attachments || [],
          items: [] // Will load separately for performance
        };
        
        setFormData(basicFormData);
        
        // Force a small delay to ensure React state updates are processed (like POForm)
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Set the customer ID again separately to force Select component update (like POForm)
        setFormData(prev => ({ ...prev, customer_id: editingQuotation.customerId?.toString() || "" }));
        
        // 🟢 Only fetch line items separately (like POForm does)
        try {
          const itemsResponse = await fetch(`/api/quotations/${editingQuotation.id}/items`, { cache: 'no-store' });
          if (itemsResponse.ok || itemsResponse.status === 304) {
            const items = await itemsResponse.json();
            
            const formattedItems = (items as Record<string, any>[]).map((item) => {
              // Look up product details to get brand information
              const product = (productsData as Record<string, any>[] ?? []).find((p) => p.id === (item.productId || item.product_id));
              const brand = (brandsData as Record<string, any>[] ?? []).find((b) => b.id === product?.brandId);
              
              return {
                product_id: (item.productId || item.product_id || "").toString(),
                brand_id: (product?.brandId || item.brand_id || "").toString(),
                brand_name: brand?.name || item.brand_name || "",
                product_code: product?.sku || item.product_code || "",
                description: product?.name || item.description || "",
                quantity: Number(item.quantity || 0),
                unit_price: Number(item.unitPrice || item.unit_price || 0),
                discount: Number(item.discount || 0),
                vat_rate: Number(item.vatRate || item.vat_rate || 0.05),
                line_total: Number(item.lineTotal || item.line_total || 0)
              };
            });
            
            // Update form with line items
            setFormData(prev => ({
              ...prev,
              items: formattedItems
            }));
          }
        } catch (error: unknown) {
          console.error("Error fetching quotation details:", error);
          toast({
            title: "Error",
            description: "Failed to load quotation details for editing",
            variant: "destructive",
          });
        }
      } else {
        // Fetch next quotation number from API
        try {
          const response = await fetch('/api/quotations/next-number');
          if (response.ok) {
            const { nextNumber } = await response.json();
            setFormData(prev => ({ 
              ...prev, 
              quotation_number: nextNumber,
              quotation_date: new Date().toISOString().split('T')[0]
            }));
          } else {
            console.error('Failed to fetch next quotation number');
            // Fallback to manual number
            setFormData(prev => ({ 
              ...prev, 
              quotation_number: '',
              quotation_date: new Date().toISOString().split('T')[0]
            }));
          }
        } catch (error: unknown) {
          console.error('Error fetching next quotation number:', error);
          // Fallback to manual number
          setFormData(prev => ({ 
            ...prev, 
            quotation_number: '',
            quotation_date: new Date().toISOString().split('T')[0]
          }));
        }
      }
    } catch (error: unknown) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load form data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      console.timeEnd('📝 QuotationForm - Total Load Time');
    }
  };

  const handleInputChange = (field: string, value: unknown) => {
    setFormData(prev => {
      const newState = {
        ...prev,
        [field]: value
      };

      // Specific logic for customer_id
      if (field === 'customer_id') {
        const customerId = parseInt(String(value));
        const customer = customers.find((c) => c.id === customerId);
        setSelectedCustomer(customer ?? null);
        newState.customer_id = String(customerId);
        
        let taxTreatment = "StandardRated";
        let taxRate = 0.05;
        
        if (customer && (customer.vatTreatment === "ZeroRated" || customer.vatTreatment === "International" || customer.type === "International")) {
          taxTreatment = "ZeroRated";
          taxRate = 0;
        }
        newState.tax_treatment = taxTreatment;
        newState.tax_rate = taxRate;
        
        // Set payment terms from customer
        if (customer && customer.paymentTerms) {
          newState.payment_terms = customer.paymentTerms;
        } else {
          newState.payment_terms = "";
        }
      }
      return newState;
    });
  };

  // Calculate totals when items change
  useEffect(() => {
    const subtotal = formData.items.reduce((sum: number, item: QuotationItem) => sum + (item.line_total || 0), 0);
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

  const updateItem = (index: number, field: keyof QuotationItem, value: string | number) => {
    const newItems = [...formData.items];
    
    // Convert string values to numbers for ID fields
    if (field === 'brand_id' || field === 'product_id') {
      value = parseInt(String(value));
    }
    
    newItems[index] = { ...newItems[index], [field]: value };

    // Handle brand selection - reset product fields
    if (field === 'brand_id') {
      const brand = brands.find((b) => b.id === value);
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

    // Auto-populate product details when product is selected
    if (field === 'product_id' && value) {
      const product = products.find((p) => p.id === value);
      if (product) {
        newItems[index] = {
          ...newItems[index],
          product_code: product.sku || "",
          description: `${product.name} - ${product.sku} - ${product.size || 'N/A'}`,
          unit_price: parseFloat(product.unitPrice) || 0,
        };
      }
    }

    // Recalculate line total when quantity or unit price changes
    if (['quantity', 'unit_price'].includes(field) || field === 'product_id') {
      const quantity = field === 'quantity' ? (parseInt(String(value)) || 0) : (newItems[index].quantity || 0);
      const unitPrice = field === 'unit_price' ? (parseFloat(String(value)) || 0) : (newItems[index].unit_price || 0);
      newItems[index].line_total = quantity * unitPrice;
    }

    setFormData(prev => ({ ...prev, items: newItems }));
  };

  const getFilteredProducts = (brandId: string | number) => {
    if (!brandId) return [];
    // Convert brandId to number for comparison since product.brandId is a number
    const numericBrandId = parseInt(String(brandId));
    return products.filter((product) => product.brandId === numericBrandId);
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({ 
      ...prev, 
      items: prev.items.filter((_, i) => i !== index) 
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.customer_id || !formData.quotation_number) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields (Customer and Quotation Number).",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Calculate validUntil as 30 days from quote date
      const quoteDate = new Date(formData.quotation_date);
      const validUntil = new Date(quoteDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days later

      const quotationData = {
        // Map frontend snake_case fields to backend camelCase schema fields
        quoteNumber: formData.quotation_number,
        customerId: parseInt(formData.customer_id),
        quoteDate: quoteDate, // Send as Date object
        validUntil: validUntil, // Send as Date object
        status: formData.status,
        totalAmount: formData.subtotal.toFixed(2), // Send as string
        vatAmount: formData.tax_amount.toFixed(2), // Send as string  
        grandTotal: formData.total_amount.toFixed(2), // Send as string
        notes: formData.remarks,
        showRemarks: formData.show_remarks,
        terms: formData.payment_terms || "Net 30", // Use customer's payment terms
        // Keep additional fields for frontend use
        reference: formData.reference,
        reference_date: formData.reference_date,
        currency: formData.currency,
        tax_treatment: formData.tax_treatment,
        tax_rate: formData.tax_rate,
        attachments: formData.attachments || [],
        items: formData.items.map((item: QuotationItem) => ({
          brand_id: item.brand_id,
          brand_name: item.brand_name,
          product_id: item.product_id,
          product_code: item.product_code,
          description: item.description,
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          line_total: parseFloat((item.line_total || 0).toFixed(2))
        }))
      };

      let result;
      if (editingQuotation && editingQuotation.id) {
        result = await QuotationEntity.update(editingQuotation.id, quotationData);
        
        toast({
          title: "Success",
          description: "Quotation updated successfully.",
          variant: "default",
        });
      } else {
        result = await QuotationEntity.create(quotationData);
        
        toast({
          title: "Success",
          description: "Quotation created successfully.",
          variant: "default",
        });
      }
      
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      console.error("Error saving quotation:", error);
      toast({
        title: "Error",
        description: `Failed to save quotation: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isEditable = !editingQuotation || editingQuotation.status !== 'submitted' || canOverride;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingQuotation ? `Edit Quotation ${formData.quotation_number || editingQuotation.quoteNumber || ''}` : 'New Quotation'}
          </DialogTitle>
          <DialogDescription>
            {editingQuotation ? 'Update quotation details' : 'Create a new quotation'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quotation_number">Quotation Number *</Label>
              <Input 
                id="quotation_number" 
                value={formData.quotation_number} 
                onChange={(e) => handleInputChange('quotation_number', e.target.value)} 
                disabled={!!editingQuotation || !isEditable} 
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select value={formData.customer_id ? formData.customer_id.toString() : ''} onValueChange={(value) => handleInputChange('customer_id', value)} disabled={!isEditable}>
                <SelectTrigger id="customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name} ({c.vatTreatment})
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
                disabled={!isEditable}
              >
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
              <Label htmlFor="quotation_date">Quotation Date *</Label>
              <Input 
                id="quotation_date" 
                type="date" 
                value={formData.quotation_date} 
                onChange={(e) => handleInputChange('quotation_date', e.target.value)} 
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input 
                id="payment_terms" 
                value={formData.payment_terms || ''} 
                disabled={true}
                placeholder="Will be set automatically from customer"
                className="bg-gray-50 text-gray-700"
              />
              <p className="text-xs text-gray-500">Payment terms are set from the customer's profile and cannot be edited here</p>
            </div>
          </div>

          {/* Line Items Section */}
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
              <div className="rounded-md border overflow-x-auto">
                <Table className="table-fixed w-full min-w-[680px]">
                  <colgroup>
                    <col className="w-[140px]" />
                    <col className="w-[180px]" />
                    <col />
                    <col className="w-[90px]" />
                    <col className="w-[130px]" />
                    <col className="w-[110px]" />
                    {isEditable && <col className="w-10" />}
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price (AED)</TableHead>
                      <TableHead className="text-right">Line Total (AED)</TableHead>
                      {isEditable && <TableHead></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select 
                            value={item.brand_id ? item.brand_id.toString() : ''} 
                            onValueChange={(v) => updateItem(index, 'brand_id', v)} 
                            disabled={!isEditable}
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
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={item.product_id ? item.product_id.toString() : ''} 
                            onValueChange={(v) => updateItem(index, 'product_id', v)} 
                            disabled={!isEditable || !item.brand_id}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={item.brand_id ? "Select product" : "Select brand first"} />
                            </SelectTrigger>
                            <SelectContent>
                              {getFilteredProducts(item.brand_id).map((p) => (
                                <SelectItem key={p.id} value={p.id.toString()}>
                                  {p.name} - {p.sku} - {p.size || 'N/A'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input 
                            value={item.description} 
                            onChange={(e) => updateItem(index, 'description', e.target.value)} 
                            disabled={!isEditable}
                            className="border-0 bg-transparent p-0 h-auto"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            disabled={!isEditable}
                            className="w-full text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                            disabled={!isEditable}
                            className="w-full text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">{(item.line_total || 0).toFixed(2)}</TableCell>
                        {isEditable && (
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                                                            size="sm"
                              onClick={() => removeItem(index)}
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
                <span className="font-bold text-sky-600">AED {formData.total_amount.toFixed(2)}</span>
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
              <Button type="submit" disabled={loading} className="bg-sky-600 hover:bg-sky-700">
                {loading ? "Saving..." : (editingQuotation ? "Update" : "Create")}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
