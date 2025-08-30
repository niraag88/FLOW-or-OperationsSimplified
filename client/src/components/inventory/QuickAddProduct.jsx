
import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Save, X, AlertCircle, CheckCircle } from "lucide-react";
import { Product } from "@/api/entities";
import { User } from "@/api/entities";
import { Brand } from "@/api/entities";
import { useToast } from "@/components/ui/use-toast";
import { logAuditAction } from "../utils/auditLogger";

const initialFormData = {
  brand_id: "",
  product_code: "",
  product_name: "",
  size: "",
  purchase_price: "",
  purchase_price_currency: "GBP", // New field
  sale_price: "",
  sale_price_currency: "AED",     // New field
};

export default function QuickAddProduct({ onProductAdded, canAdd }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [codeStatus, setCodeStatus] = useState(null); // null, 'checking', 'valid', 'invalid', 'taken'
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [brands, setBrands] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const { toast } = useToast();
  const brandSelectRef = useRef(null);
  const checkTimeoutRef = useRef(null);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
      } catch (e) {
        console.error("Failed to fetch user", e);
        // Set default admin user for development/testing if needed
        // setCurrentUser({ role: 'Admin', email: 'user@example.com' });
      }
    };

    const loadBrands = async () => {
      try {
        const brandsData = await Brand.list('sort_order');
        setBrands(brandsData.filter(b => b.is_active)); // Filter active brands
      } catch (error) {
        console.error("Error loading brands:", error);
        toast({
          title: "Error",
          description: "Failed to load brands. Please try again.",
          variant: "destructive",
        });
      }
    };

    fetchUser();
    loadBrands();
  }, []);

  useEffect(() => {
    if (open && brandSelectRef.current) {
      // Focus first field when opened
      setTimeout(() => brandSelectRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    // Keyboard shortcuts
    const handleKeyDown = (event) => {
      if (!open) return;

      if (event.key === 'Escape') {
        handleClose();
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSave('saveAndAdd');
      } else if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        handleSave('save');
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, formData]);

  const validateProductCode = (code) => {
    if (!code) return null;
    const regex = /^[A-Za-z0-9]{1,20}$/;
    return regex.test(code) ? 'valid' : 'invalid';
  };

  const checkCodeUniqueness = async (code) => {
    if (!code || validateProductCode(code) !== 'valid') return;

    setCodeStatus('checking');

    // Clear previous timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    // Debounce the API call
    checkTimeoutRef.current = setTimeout(async () => {
      try {
        const existing = await Product.filter({ product_code: code.toUpperCase() });
        setCodeStatus(existing.length > 0 ? 'taken' : 'valid');
      } catch (error) {
        console.error("Error checking code uniqueness:", error);
        setCodeStatus('valid'); // Assume valid on error
      }
    }, 500);
  };

  const handleInputChange = (field, value) => {
    let processedValue = value;

    if (field === 'product_code') {
      processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
      const validation = validateProductCode(processedValue);
      setCodeStatus(validation);

      if (validation === 'valid') {
        checkCodeUniqueness(processedValue);
      }
    }

    setFormData(prev => ({ ...prev, [field]: processedValue }));

    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.brand_id) newErrors.brand_id = "Brand is required";
    if (!formData.product_code.trim()) newErrors.product_code = "Product code is required";
    if (!formData.product_name.trim()) newErrors.product_name = "Product name is required";
    if (formData.purchase_price === "" || formData.purchase_price === null) newErrors.purchase_price = "Purchase price is required";
    if (formData.sale_price === "" || formData.sale_price === null) newErrors.sale_price = "Sale price is required";

    if (formData.purchase_price && parseFloat(formData.purchase_price) < 0) {
      newErrors.purchase_price = "Purchase price must be positive";
    }

    if (formData.sale_price && parseFloat(formData.sale_price) < 0) {
      newErrors.sale_price = "Sale price must be positive";
    }

    // Business logic: Sale price should be higher than purchase price
    // Only apply if currencies are the same, as no conversion logic is implemented
    if (formData.purchase_price && formData.sale_price && formData.purchase_price_currency === formData.sale_price_currency) {
      const purchasePrice = parseFloat(formData.purchase_price);
      const salePrice = parseFloat(formData.sale_price);
      if (!isNaN(purchasePrice) && !isNaN(salePrice) && salePrice <= purchasePrice) {
        newErrors.sale_price = "Sale price should be higher than purchase price";
      }
    }

    if (codeStatus === 'taken') {
      newErrors.product_code = "This code is already in use";
    }

    if (codeStatus === 'invalid') {
      newErrors.product_code = "Invalid code format";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async (mode) => {
    if (!validate() || codeStatus === 'checking') return;

    setLoading(true);
    try {
      // Get brand name for denormalization
      const selectedBrand = brands.find(b => b.id === formData.brand_id);

      const productData = {
        ...formData,
        brand_name: selectedBrand?.name || '',
        product_code: formData.product_code.trim().toUpperCase(),
        product_name: formData.product_name.trim(),
        size: formData.size.trim() || null,
        purchase_price: parseFloat(formData.purchase_price),
        sale_price: parseFloat(formData.sale_price)
      };

      const newProduct = await Product.create(productData);

      if (currentUser) {
        await logAuditAction("Product", newProduct.id, "create", currentUser.email, { product: newProduct });
      }

      toast({
        title: "Success",
        description: "Product added successfully.",
      });

      onProductAdded?.(newProduct);

      if (mode === 'saveAndAdd') {
        setFormData(initialFormData);
        setCodeStatus(null);
        setErrors({});
        setTimeout(() => brandSelectRef.current?.focus(), 100);
      } else {
        handleClose();
      }

    } catch (error) {
      console.error("Error creating product:", error);

      // Check if it's a uniqueness error
      if (error.message?.includes('product_code') || error.message?.includes('unique')) {
        setCodeStatus('taken');
        setErrors(prev => ({ ...prev, product_code: "This code is already in use" }));
      } else {
        toast({
          title: "Error",
          description: "Failed to create product.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setFormData(initialFormData);
    setErrors({});
    setCodeStatus(null);
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }
  };

  const formatPreviewPrice = (value, currency) => {
    if (!value) return '';
    const formatted = parseFloat(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return currency === 'GBP' ? `£${formatted}` : `${formatted} AED`;
  };

  const getCodeStatusBadge = () => {
    switch (codeStatus) {
      case 'checking':
        return <Badge variant="outline" className="text-blue-600">Checking...</Badge>;
      case 'valid':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle className="w-3 h-3 mr-1" />Available</Badge>;
      case 'invalid':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Invalid code</Badge>;
      case 'taken':
        return <Badge variant="outline" className="text-amber-600 border-amber-300"><AlertCircle className="w-3 h-3 mr-1" />Code in use</Badge>;
      default:
        return null;
    }
  };

  const canSave = !loading && codeStatus !== 'checking' && codeStatus !== 'taken' && codeStatus !== 'invalid' &&
                  formData.brand_id && formData.product_code && formData.product_name && formData.purchase_price && formData.sale_price;

  const formContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="brand_id">Brand *</Label>
        <Select
          value={formData.brand_id}
          onValueChange={(value) => handleInputChange('brand_id', value)}
        >
          <SelectTrigger className={errors.brand_id ? "border-red-500" : ""} ref={brandSelectRef}>
            <SelectValue placeholder="Select a brand" />
          </SelectTrigger>
          <SelectContent>
            {brands.map(brand => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.brand_id && <p className="text-xs text-red-500">{errors.brand_id}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="product_code">Product Code *</Label>
        <div className="flex items-center gap-2">
          <Input
            id="product_code"
            value={formData.product_code}
            onChange={(e) => handleInputChange('product_code', e.target.value)}
            onBlur={() => checkCodeUniqueness(formData.product_code)}
            placeholder="e.g., LAPTOP001"
            maxLength={20}
            className={errors.product_code ? "border-red-500" : ""}
          />
          {getCodeStatusBadge()}
        </div>
        <p className="text-xs text-gray-500">Up to 20 characters, letters and numbers only</p>
        {errors.product_code && <p className="text-xs text-red-500">{errors.product_code}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="product_name">Product Name *</Label>
        <Input
          id="product_name"
          value={formData.product_name}
          onChange={(e) => handleInputChange('product_name', e.target.value)}
          placeholder="e.g., MacBook Pro 16-inch"
          className={errors.product_name ? "border-red-500" : ""}
        />
        {errors.product_name && <p className="text-xs text-red-500">{errors.product_name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="size">Size</Label>
        <Input
          id="size"
          value={formData.size}
          onChange={(e) => handleInputChange('size', e.target.value)}
          placeholder="e.g., 250 ml, 1 kg, 10 pcs"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
         {/* Purchase Price */}
        <div className="space-y-2">
          <Label>Purchase Price *</Label>
           <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.purchase_price}
              onChange={(e) => handleInputChange('purchase_price', e.target.value)}
              placeholder="0.00"
              className={`${errors.purchase_price ? "border-red-500" : ""}`}
            />
            <Select value={formData.purchase_price_currency} onValueChange={(value) => handleInputChange('purchase_price_currency', value)}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AED">AED</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-gray-500">For POs</p>
          {errors.purchase_price && <p className="text-xs text-red-500">{errors.purchase_price}</p>}
        </div>
        {/* Sale Price */}
        <div className="space-y-2">
          <Label>Sale Price *</Label>
           <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.sale_price}
              onChange={(e) => handleInputChange('sale_price', e.target.value)}
              placeholder="0.00"
              className={`${errors.sale_price ? "border-red-500" : ""}`}
            />
             <Select value={formData.sale_price_currency} onValueChange={(value) => handleInputChange('sale_price_currency', value)}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AED">AED</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-gray-500">For DO/Invoices</p>
          {errors.sale_price && <p className="text-xs text-red-500">{errors.sale_price}</p>}
        </div>
      </div>

      {/* Live Preview */}
      {(formData.brand_id || formData.product_name || formData.product_code || formData.sale_price) && (
        <Card className="p-4 bg-gray-50 border-dashed">
          <div className="space-y-1">
            <div className="font-medium text-gray-900">
              {/* Updated live preview logic for brand name */}
              {formData.brand_id && formData.product_name ?
                `${brands.find(b => b.id === formData.brand_id)?.name || ''} — ${formData.product_name}` :
                (brands.find(b => b.id === formData.brand_id)?.name || formData.product_name || 'Product Preview')
              }
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {formData.product_code && `Code: ${formData.product_code}`}
                {formData.product_code && (formData.size || true) && ' · '}
                {`Size: ${formData.size || '—'}`}
              </div>
              {formData.sale_price && (
                <Badge variant="secondary" className="ml-2">
                  {formatPreviewPrice(formData.sale_price, formData.sale_price_currency)}
                </Badge>
              )}
            </div>
            {formData.purchase_price && formData.sale_price && parseFloat(formData.purchase_price) > 0 && formData.purchase_price_currency === formData.sale_price_currency && (
              <div className="text-xs text-emerald-600 pt-1">
                Margin: {(((parseFloat(formData.sale_price) - parseFloat(formData.purchase_price)) / parseFloat(formData.purchase_price)) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Action Buttons - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={handleClose}
          disabled={loading}
          className="w-full sm:flex-1"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => handleSave('saveAndAdd')}
          disabled={!canSave}
          className="w-full sm:flex-1"
        >
          <Plus className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save & Add"}
        </Button>
        <Button
          type="button"
          onClick={() => handleSave('save')}
          disabled={!canSave}
          className="w-full sm:flex-1 bg-emerald-600 hover:bg-emerald-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? (
        <>
          <Button onClick={() => setOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            Quick Add
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="flex flex-col w-[95vw] max-w-full h-[90vh] m-2 p-0 rounded-lg">
              <DialogHeader className="p-4 sm:p-6 border-b">
                <DialogTitle>Quick Add Product</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {formContent}
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />
              Quick Add
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[520px] p-6 max-h-[80vh] overflow-y-auto"
            align="end"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Quick Add Product</h3>
              {formContent}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
