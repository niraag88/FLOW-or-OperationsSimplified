
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
import { Plus, Trash2, Upload } from "lucide-react";
import { PurchaseOrder } from "@/api/entities";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities";
import { CompanySettings } from "@/api/entities";
import { AuditLog } from "@/api/entities";
import { UploadFile } from "@/api/integrations";
import { Card } from "@/components/ui/card";
import { generateDocumentNumber } from "../utils/documentNumber";
import { logAuditAction, logStatusChange } from "../utils/auditLogger";

export default function POForm({ open, onClose, editingPO, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [companySettings, setCompanySettings] = useState(null);
  const [formData, setFormData] = useState({
    po_number: "",
    supplier_id: "",
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: "",
    status: "draft",
    currency: "GBP",
    fx_rate_to_aed: 0, // Will be set from company settings
    subtotal: 0,
    total_amount: 0,
    po_total_aed: 0,
    notes: "",
    terms_conditions: "",
    attachments: [],
    items: []
  });

  // Removed showStatusConfirm and pendingStatus state variables

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [brandsData, productsData, settingsList] = await Promise.all([
          Brand.list('sort_order'),
          Product.list(),
          CompanySettings.list()
        ]);
        
        setBrands(brandsData.filter(b => b.isActive));
        setAllProducts(productsData);

        if (settingsList.length > 0) {
          const currentSettings = settingsList[0];
          setCompanySettings(currentSettings);
          
          // For new POs, reset form with correct exchange rate
          if (!editingPO) {
            const exchangeRate = parseFloat(currentSettings.fxGbpToAed) || 5;
            const initialFormData = {
              po_number: "",
              supplier_id: "",
              order_date: new Date().toISOString().split('T')[0],
              expected_delivery_date: "",
              status: "draft",
              currency: "GBP",
              fx_rate_to_aed: exchangeRate,
              subtotal: 0,
              total_amount: 0,
              po_total_aed: 0,
              notes: "",
              terms_conditions: "",
              attachments: [],
              items: []
            };
            setFormData(prev => ({ ...prev, ...initialFormData }));
          }
        }
      } catch (error) {
        console.error("Error loading initial data for PO Form:", error);
      }
    };

    if (open) {
      loadInitialData().then(() => {
        if (editingPO) {
          setFormData(editingPO);
          // Filter products when editing existing PO
          if (editingPO.supplier_id) {
            filterProductsByBrand(editingPO.supplier_id);
          }
        } else {
          generatePONumber();
        }
      });
    }
  }, [open, editingPO]);

  const loadBrands = async () => {
    try {
      const brandsData = await Brand.list('sort_order');
      setBrands(brandsData.filter(b => b.isActive));
    } catch (error) {
      console.error("Error loading brands:", error);
    }
  };

  const loadProducts = async () => {
    try {
      const productsData = await Product.list();
      setAllProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

  const filterProductsByBrand = (brandId) => {
    if (!brandId) {
      setFilteredProducts([]);
      return;
    }
    const filtered = allProducts.filter(product => product.brandId === parseInt(brandId));
    setFilteredProducts(filtered);
  };

  const generatePONumber = async () => {
    try {
      const poNumber = await generateDocumentNumber('po');
      setFormData(prev => ({ 
        ...prev, 
        po_number: poNumber,
        // Ensure exchange rate is set from company settings if available
        fx_rate_to_aed: companySettings ? parseFloat(companySettings.fxGbpToAed) : prev.fx_rate_to_aed
      }));
    } catch (error) {
      console.error("Error generating PO number:", error);
      const timestamp = Date.now().toString().slice(-6);
      const poNumber = `PO-${timestamp}`;
      setFormData(prev => ({ 
        ...prev, 
        po_number: poNumber,
        // Ensure exchange rate is set from company settings if available
        fx_rate_to_aed: companySettings ? parseFloat(companySettings.fxGbpToAed) : prev.fx_rate_to_aed
      }));
    }
  };

  const resetForm = () => {
    const initialFormData = {
      po_number: "",
      supplier_id: "",
      order_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: "",
      status: "draft",
      currency: "GBP",
      fx_rate_to_aed: parseFloat(companySettings?.fxGbpToAed) || 5,
      subtotal: 0,
      total_amount: 0,
      po_total_aed: 0,
      notes: "",
      terms_conditions: "",
      attachments: [],
      items: []
    };
    setFormData(initialFormData);
    setFilteredProducts([]);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Update exchange rate when currency changes
    if (field === 'currency' && companySettings) {
      const newRate = value === 'GBP' ? parseFloat(companySettings.fxGbpToAed) : 1;
      setFormData(prev => ({
        ...prev,
        fx_rate_to_aed: newRate
      }));
    }

    // Filter products when brand/supplier changes
    if (field === 'supplier_id') {
      filterProductsByBrand(value);
      // Clear existing line items when brand changes
      setFormData(prev => ({
        ...prev,
        items: [],
        supplier_id: value
      }));
    }
  };

  // Removed handleStatusChange function
  // Removed confirmStatusChange function

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    const totalAmount = subtotal; // No tax for export products
    const poTotalAED = totalAmount * (formData.fx_rate_to_aed || 1);

    setFormData(prev => ({
      ...prev,
      subtotal,
      total_amount: totalAmount,
      po_total_aed: poTotalAED
    }));
  };

  useEffect(() => {
    calculateTotals();
  }, [formData.items, formData.fx_rate_to_aed]);

  const addItem = () => {
    const newItem = {
      product_id: "",
      product_code: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      line_total: 0,
      received_quantity: 0
    };
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    
    // Calculate line total
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].line_total = (newItems[index].quantity || 0) * (newItems[index].unit_price || 0);
    }

    // Update product details when product is selected
    if (field === 'product_id' && value) {
      const product = filteredProducts.find(p => p.id === parseInt(value));
      if (product) {
        newItems[index].product_code = product.sku;
        newItems[index].description = `${product.name}${product.size ? ` - ${product.size}` : ''}`;
        // Use cost_price in GBP for POs
        newItems[index].unit_price = product.costPrice || 0;
        newItems[index].line_total = (newItems[index].quantity || 0) * (product.costPrice || 0);
      }
    }

    setFormData(prev => ({
      ...prev,
      items: newItems
    }));
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const { file_url } = await UploadFile({ file });
      const attachment = {
        filename: file.name,
        file_url,
        file_type: file.type,
        uploaded_date: new Date().toISOString()
      };

      setFormData(prev => ({
        ...prev,
        attachments: [...prev.attachments, attachment]
      }));
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Transform form data to match API schema
      const transformedData = {
        supplierId: parseInt(formData.supplier_id),
        poNumber: formData.po_number,
        orderDate: formData.order_date + 'T00:00:00.000Z', // Convert to ISO datetime
        expectedDelivery: formData.expected_delivery_date + 'T00:00:00.000Z', // Convert to ISO datetime
        totalAmount: formData.total_amount.toString(),
        grandTotal: formData.total_amount.toString(),
        notes: formData.notes || '',
        status: formData.status || 'draft'
      };

      console.log("Transformed data being sent:", transformedData);

      if (editingPO) {
        // Log status change if status actually changed
        if (formData.status !== editingPO.status) {
          await logStatusChange(
            "PurchaseOrder",
            editingPO.id,
            currentUser.email,
            editingPO.status,
            formData.status
          );
        }
        await PurchaseOrder.update(editingPO.id, transformedData);
        await logAuditAction("PurchaseOrder", editingPO.id, "update", currentUser.email, { updated_fields: Object.keys(formData) });
      } else {
        const newPO = await PurchaseOrder.create(transformedData);
        await logAuditAction("PurchaseOrder", newPO.id, "create", currentUser.email, { po_number: formData.po_number });
      }
      
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Error saving purchase order:", error);
    } finally {
      setLoading(false);
    }
  };

  const canEdit = !editingPO || editingPO.status !== 'closed';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 md:p-6">
        <DialogHeader className="p-6 md:p-0">
          <DialogTitle>
            {editingPO ? `Edit Purchase Order ${editingPO.po_number}` : 'New Purchase Order'}
          </DialogTitle>
          <DialogDescription>
            {editingPO ? 'Update purchase order details and line items' : 'Create a new purchase order'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 md:px-0 pb-24 md:pb-0">
          {/* Header Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="po_number">PO Number *</Label>
              <Input
                id="po_number"
                value={formData.po_number}
                onChange={(e) => handleInputChange('po_number', e.target.value)}
                disabled={!!editingPO}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier">Brand/Supplier *</Label>
              <Select 
                value={formData.supplier_id} 
                onValueChange={(value) => handleInputChange('supplier_id', value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select brand/supplier" />
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
                disabled={!canEdit || formData.status === 'closed'}
              >
                <SelectTrigger>
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
              <Label htmlFor="order_date">Order Date *</Label>
              <Input
                id="order_date"
                type="date"
                value={formData.order_date}
                onChange={(e) => handleInputChange('order_date', e.target.value)}
                disabled={!canEdit}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_delivery_date">Expected Delivery</Label>
              <Input
                id="expected_delivery_date"
                type="date"
                value={formData.expected_delivery_date}
                onChange={(e) => handleInputChange('expected_delivery_date', e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency *</Label>
              <Select 
                value={formData.currency} 
                onValueChange={(value) => handleInputChange('currency', value)}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fx_rate">Exchange Rate to AED</Label>
              <Input
                id="fx_rate"
                type="number"
                step="0.01"
                value={formData.fx_rate_to_aed}
                onChange={(e) => handleInputChange('fx_rate_to_aed', parseFloat(e.target.value))}
                disabled // This field is now disabled
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Line Items</h3>
              {canEdit && formData.supplier_id && (
                <Button type="button" variant="outline" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            {!formData.supplier_id && (
              <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                <p>Please select a brand/supplier first to add line items</p>
              </div>
            )}

            {formData.items.length > 0 && (
              <>
                {/* Desktop Table View */}
                <div className="rounded-md border hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">Product</TableHead>
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
                              value={item.product_id}
                              onValueChange={(value) => updateItem(index, 'product_id', value)}
                              disabled={!canEdit}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {filteredProducts.map(product => (
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    <div className="flex flex-col">
                                      <p className="font-medium truncate">{product.name}</p>
                                      {product.size && <p className="text-sm text-gray-500">{product.size}</p>}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium text-gray-700">
                              {item.product_code || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              disabled={!canEdit}
                              className="w-48"
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
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                              disabled={!canEdit}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">£{item.line_total?.toFixed(2) || '0.00'}</span>
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(index)}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="space-y-3 md:hidden">
                  {formData.items.map((item, index) => (
                    <Card key={index} className="p-4">
                       <div className="flex justify-between items-start mb-4">
                        <div className="flex-grow space-y-2">
                           <Label>Product</Label>
                           <Select
                              value={item.product_id}
                              onValueChange={(value) => updateItem(index, 'product_id', value)}
                              disabled={!canEdit}
                            >
                              <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                              <SelectContent>
                                {filteredProducts.map(product => ( 
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    <div className="flex flex-col">
                                      <p className="font-medium truncate">{product.name}</p>
                                      {product.size && <p className="text-sm text-gray-500">{product.size}</p>}
                                    </div>
                                  </SelectItem> 
                                ))}
                              </SelectContent>
                            </Select>
                        </div>
                        {canEdit && (
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} className="ml-2 flex-shrink-0 -mr-2 -mt-2">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>

                      {item.product_code && (
                        <div className="space-y-2 mb-4">
                          <Label>Product Code</Label>
                          <div className="text-sm font-medium text-gray-700 bg-gray-50 px-3 py-2 rounded border">
                            {item.product_code}
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 mb-4">
                        <Label>Description</Label>
                        <Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} disabled={!canEdit} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)} disabled={!canEdit} />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit Price (GBP)</Label>
                           <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, 'unit_price', parseFloat(e.target.value) || 0)} disabled={!canEdit} />
                        </div>
                      </div>
                       <div className="mt-4 pt-2 border-t">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600 font-medium">Line Total</span>
                          <span className="font-semibold text-lg">£{item.line_total?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Totals */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Subtotal ({formData.currency})</p>
                <p className="font-semibold text-lg">{formData.subtotal?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <p className="text-gray-600">Total ({formData.currency})</p>
                <p className="font-semibold text-lg">{formData.total_amount?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <p className="text-gray-600">Total (AED)</p>
                <p className="font-semibold text-lg text-emerald-600">{formData.po_total_aed?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </div>

          {/* Notes and Terms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="terms">Terms & Conditions</Label>
              <Textarea
                id="terms"
                value={formData.terms_conditions}
                onChange={(e) => handleInputChange('terms_conditions', e.target.value)}
                disabled={!canEdit}
                rows={3}
              />
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Attachments</Label>
            {canEdit && (
              <div>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  className="hidden"
                  id="file-upload"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('file-upload').click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
              </div>
            )}
            {formData.attachments?.length > 0 && (
              <div className="space-y-2">
                {formData.attachments.map((attachment, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{attachment.filename}</span>
                    <a
                      href={attachment.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="md:static fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm md:bg-transparent p-4 md:p-0 border-t md:border-0 z-10">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="w-full md:w-auto">
                Cancel
              </Button>
              {canEdit && (
                <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 w-full md:w-auto">
                  {loading ? "Saving..." : editingPO ? "Update Purchase Order" : "Create Purchase Order"}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
      
      {/* Removed ConfirmDialog component completely */}
    </Dialog>
  );
}
