
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities"; // Added Brand import
import { CompanySettings } from "@/api/entities"; // Import CompanySettings
import { logAuditAction } from "../components/utils/auditLogger";
import { createPageUrl } from "@/utils";
import { Save, Plus, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initialFormData = {
  brand_id: "",
  product_code: "",
  product_name: "",
  size: "",
  purchase_price: "",
  purchase_price_currency: "GBP",
  sale_price: "",
  sale_price_currency: "AED",
};

export default function AddProduct() {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [brands, setBrands] = useState([]); // Added state for brands
  const [fxRate, setFxRate] = useState(4.85); // State for exchange rate
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Always use mock user for public access, removing all authentication logic
    setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
    
    const loadInitialData = async () => {
      try {
        const [brandsData, settingsList] = await Promise.all([
          Brand.list('sort_order'),
          CompanySettings.list()
        ]);
        
        setBrands(brandsData.filter(b => b.is_active)); // Fetch and filter active brands
        if (settingsList.length > 0) {
          setFxRate(settingsList[0].fx_gbp_to_aed || 4.85);
        }
      } catch (error) {
        console.error("Error loading initial data:", error);
      }
    };

    loadInitialData();
  }, []); // Removed navigate from dependency array as it's no longer needed for this effect.

  const validate = useCallback(async () => {
    const newErrors = {};

    // Required fields
    if (!formData.brand_id) newErrors.brand_id = "Brand is required"; // Validating brand_id
    if (!formData.product_code) newErrors.product_code = "Product code is required";
    if (!formData.product_name) newErrors.product_name = "Product name is required";
    if (formData.purchase_price === "" || formData.purchase_price === null) newErrors.purchase_price = "Purchase price is required"; // Validate purchase price
    if (formData.sale_price === "" || formData.sale_price === null) newErrors.sale_price = "Sale price is required"; // Validate sale price

    // Product code format
    const productCodeRegex = /^[A-Za-z0-9]{1,20}$/;
    if (formData.product_code && !productCodeRegex.test(formData.product_code)) {
      newErrors.product_code = "Up to 20 letters and numbers only";
    }

    // Price validation
    if (formData.purchase_price && parseFloat(formData.purchase_price) < 0) {
      newErrors.purchase_price = "Purchase price must be positive";
    }
    
    if (formData.sale_price && parseFloat(formData.sale_price) < 0) {
      newErrors.sale_price = "Sale price must be positive";
    }

    // Business logic: Sale price should be higher than purchase price
    // This validation is for raw input, not converted value for simplicity in validation stage
    if (formData.purchase_price && formData.sale_price && formData.purchase_price_currency === formData.sale_price_currency) {
      const purchasePrice = parseFloat(formData.purchase_price);
      const salePrice = parseFloat(formData.sale_price);
      if (salePrice <= purchasePrice) {
        newErrors.sale_price = "Sale price should be higher than purchase price for profitability";
      }
    }
    
    // Check uniqueness of product code
    if (formData.product_code && !newErrors.product_code) {
        const existing = await Product.filter({ product_code: formData.product_code });
        if (existing.length > 0) {
            newErrors.product_code = "This Product Code already exists.";
        }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);
  
  const handleSave = async (mode) => {
    setLoading(true);
    if (!(await validate())) {
      setLoading(false);
      return;
    }

    try {
      // Get brand name for denormalization
      const selectedBrand = brands.find(b => b.id === formData.brand_id);
      
      const productData = {
        ...formData,
        brand_name: selectedBrand?.name || '', // Include brand_name for denormalization
        purchase_price: parseFloat(formData.purchase_price), // Parse purchase price
        sale_price: parseFloat(formData.sale_price) // Parse sale price
      };

      const newProduct = await Product.create(productData);

      // currentUser is guaranteed to be set by useEffect now
      await logAuditAction("Product", newProduct.id, "create", currentUser.email, { product: newProduct });
      
      toast({
        title: "Success",
        description: "Product added successfully.",
      });

      if (mode === 'saveAndAdd') {
        setFormData(initialFormData);
        document.getElementById('brand_id').focus(); // Focus on brand_id after save and add
      } else {
        navigate(createPageUrl('Inventory'));
      }

    } catch (error) {
      console.error("Error creating product:", error);
      toast({
        title: "Error",
        description: "Failed to create product.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    let processedValue = value;
    if (field === 'product_code') {
      processedValue = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    setFormData(prev => ({ ...prev, [field]: processedValue }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };
  
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        navigate(createPageUrl('Inventory'));
      } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        handleSave('saveAndAdd');
      } else if (event.key === 'Enter') {
        const activeElement = document.activeElement;
        // Prevent default Enter key behavior on textareas and buttons, otherwise trigger save
        if (activeElement.tagName !== 'TEXTAREA' && activeElement.tagName !== 'BUTTON') {
          handleSave('save');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSave, navigate]);

  const calculateProfitMargin = useCallback(() => {
    const salePrice = parseFloat(formData.sale_price) || 0;
    if (salePrice <= 0) return null;

    let purchasePriceInAED = parseFloat(formData.purchase_price) || 0;
    if (formData.purchase_price_currency !== 'AED') {
      purchasePriceInAED *= fxRate;
    }

    if (purchasePriceInAED > 0 && salePrice > 0) {
      const profit = salePrice - purchasePriceInAED;
      const margin = (profit / salePrice) * 100;
      return {
        margin: margin.toFixed(1),
        profit: profit.toFixed(2),
      };
    }
    return null;
  }, [formData.purchase_price, formData.sale_price, formData.purchase_price_currency, fxRate]);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add New Product</h1>
        <p className="text-gray-600">Create a new product with pricing information for your catalog.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brand_id">Brand *</Label>
          <Select
            value={formData.brand_id}
            onValueChange={(value) => handleInputChange('brand_id', value)}
          >
            <SelectTrigger id="brand_id" className={errors.brand_id ? "border-red-500" : ""}>
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
          {errors.brand_id && <p className="text-sm text-red-500">{errors.brand_id}</p>}
          {brands.length === 0 && (
            <p className="text-sm text-amber-600">
              No brands available. Please add brands in Settings first.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="product_code">Product Code *</Label>
          <Input
            id="product_code"
            value={formData.product_code}
            onChange={(e) => handleInputChange('product_code', e.target.value)}
            placeholder="e.g., LAPTOP001"
            maxLength={20}
            className={errors.product_code ? "border-red-500" : ""}
          />
          <p className="text-xs text-gray-500">Up to 20 characters, letters and numbers only. Will be auto-uppercased.</p>
          {errors.product_code && <p className="text-sm text-red-500">{errors.product_code}</p>}
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
          {errors.product_name && <p className="text-sm text-red-500">{errors.product_name}</p>}
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

        {/* Pricing Section */}
        <div className="border rounded-lg p-4 bg-gray-50/80">
          <h3 className="font-semibold text-gray-900 mb-3">Pricing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            {/* Purchase Price */}
            <div className="space-y-2">
              <Label htmlFor="purchase_price">Purchase Price *</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="purchase_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_price}
                  onChange={(e) => handleInputChange('purchase_price', e.target.value)}
                  onBlur={(e) => e.target.value && setFormData(prev => ({...prev, purchase_price: parseFloat(e.target.value).toFixed(2)}))}
                  placeholder="0.00"
                  className={errors.purchase_price ? "border-red-500" : ""}
                />
                <Select value={formData.purchase_price_currency} onValueChange={(value) => handleInputChange('purchase_price_currency', value)}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.purchase_price && formData.purchase_price_currency !== 'AED' && (
                <div className="text-xs text-gray-500 pt-1">
                  ~ AED {(parseFloat(formData.purchase_price) * fxRate).toFixed(2)}
                </div>
              )}
              <p className="text-xs text-gray-500">Cost price for purchase orders</p>
              {errors.purchase_price && <p className="text-sm text-red-500">{errors.purchase_price}</p>}
            </div>

            {/* Sale Price */}
            <div className="space-y-2">
              <Label htmlFor="sale_price">Sale Price *</Label>
               <div className="flex items-center gap-2">
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sale_price}
                  onChange={(e) => handleInputChange('sale_price', e.target.value)}
                  onBlur={(e) => e.target.value && setFormData(prev => ({...prev, sale_price: parseFloat(e.target.value).toFixed(2)}))}
                  placeholder="0.00"
                  className={errors.sale_price ? "border-red-500" : ""}
                />
                <Select value={formData.sale_price_currency} onValueChange={(value) => handleInputChange('sale_price_currency', value)}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">Selling price for delivery orders & invoices</p>
              {errors.sale_price && <p className="text-sm text-red-500">{errors.sale_price}</p>}
            </div>
          </div>

          {/* Profit Margin Display */}
          <div className="mt-4">
            {calculateProfitMargin() ? (
              <div className="p-3 bg-emerald-50 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800">Profit Margin</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {calculateProfitMargin().margin}%
                  </span>
                </div>
                <p className="text-xs text-emerald-600 mt-1">
                  Est. Profit: AED {calculateProfitMargin().profit}
                </p>
              </div>
            ) : formData.purchase_price && formData.sale_price && formData.purchase_price_currency === formData.sale_price_currency && (
              <Alert variant="info" className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-xs">
                  Sale price must be greater than purchase price to calculate margin.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </div>
      
      <div className="md:static fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm md:bg-transparent p-4 md:p-0 border-t md:border-0 z-10">
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(createPageUrl('Inventory'))} disabled={loading}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleSave('saveAndAdd')} disabled={loading}>
            <Plus className="w-4 h-4 mr-2" />
            {loading ? "Saving..." : "Save & Add Another"}
          </Button>
          <Button type="button" onClick={() => handleSave('save')} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
