import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities";
import { CompanySettings } from "@/api/entities";
import { logAuditAction } from "../components/utils/auditLogger";
import { createPageUrl } from "@/utils";
import { Save, X, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SUPPORTED_CURRENCIES } from "@/utils/currency";

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

export default function EditProduct() {
  const { id } = useParams();
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [brands, setBrands] = useState([]);
  const [fxRate, setFxRate] = useState(4.85);
  const [originalProduct, setOriginalProduct] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [brandsData, settingsList, productData] = await Promise.all([
          Brand.list('sort_order'),
          CompanySettings.list(),
          Product.getById(parseInt(id))
        ]);
        
        setBrands(brandsData.filter(b => b.isActive));
        if (settingsList.length > 0) {
          setFxRate(settingsList[0].fx_gbp_to_aed || 4.85);
        }

        if (productData) {
          setOriginalProduct(productData);
          // Map product data to form data
          setFormData({
            brand_id: productData.brandId?.toString() || "",
            product_code: productData.sku || "",
            product_name: productData.name || "",
            size: productData.description || "",
            purchase_price: productData.costPrice || "",
            purchase_price_currency: productData.costPriceCurrency || "GBP",
            sale_price: productData.unitPrice || "",
            sale_price_currency: "AED",
          });
        } else {
          toast({
            title: "Error",
            description: "Product not found.",
            variant: "destructive",
          });
          navigate(createPageUrl('Inventory'));
        }
      } catch (error) {
        console.error("Error loading product data:", error);
        toast({
          title: "Error",
          description: "Failed to load product data.",
          variant: "destructive",
        });
        navigate(createPageUrl('Inventory'));
      } finally {
        setLoadingProduct(false);
      }
    };

    if (id) {
      loadInitialData();
    }
  }, [id, navigate, toast]);

  const validate = useCallback(async () => {
    const newErrors = {};

    // Required fields
    if (!formData.brand_id) newErrors.brand_id = "Brand is required";
    if (!formData.product_code) newErrors.product_code = "Product code is required";
    if (!formData.product_name) newErrors.product_name = "Product name is required";
    if (formData.sale_price === "" || formData.sale_price === null) newErrors.sale_price = "Sale price is required";

    // SKU format
    const codeRegex = /^[A-Za-z0-9]{1,50}$/;
    if (formData.product_code && !codeRegex.test(formData.product_code)) {
      newErrors.product_code = "Up to 50 letters and numbers only";
    }

    // Price validation
    if (formData.sale_price && parseFloat(formData.sale_price) < 0) {
      newErrors.sale_price = "Sale price must be positive";
    }
    
    if (formData.purchase_price && parseFloat(formData.purchase_price) < 0) {
      newErrors.purchase_price = "Purchase price must be positive";
    }

    // Business logic: Sale price should be higher than purchase price for profitability (only when same currency)
    if (formData.purchase_price && formData.sale_price && formData.purchase_price_currency === formData.sale_price_currency) {
      const purchasePrice = parseFloat(formData.purchase_price);
      const salePrice = parseFloat(formData.sale_price);
      if (salePrice <= purchasePrice) {
        newErrors.sale_price = "Sale price should be higher than purchase price for profitability";
      }
    }
    
    // Check uniqueness of product code only if it changed
    if (formData.product_code && originalProduct && formData.product_code.trim().toUpperCase() !== originalProduct.sku) {
      if (!newErrors.product_code) {
        const existing = await Product.filter({ sku: formData.product_code.trim().toUpperCase() });
        if (existing.length > 0) {
          newErrors.product_code = "This product code already exists.";
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, originalProduct]);
  
  const handleSave = async () => {
    setLoading(true);
    if (!(await validate())) {
      setLoading(false);
      return;
    }

    try {
      // Map form fields to the database schema
      const productData = {
        sku: formData.product_code.trim().toUpperCase(),
        brandId: parseInt(formData.brand_id),
        name: formData.product_name.trim(),
        description: formData.size.trim() || null,
        costPrice: formData.purchase_price || "0",
        costPriceCurrency: formData.purchase_price_currency || "GBP",
        unitPrice: formData.sale_price || "0",
      };

      const updatedProduct = await Product.update(parseInt(id), productData);

      await logAuditAction("Product", updatedProduct.id, "update", currentUser.email, { 
        before: originalProduct,
        after: updatedProduct 
      });

      // Invalidate products cache so Inventory reflects the update immediately
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      
      toast({
        title: "Success",
        description: "Product updated successfully.",
      });

      navigate(createPageUrl('Inventory'));

    } catch (error) {
      console.error("Error updating product:", error);
      toast({
        title: "Error",
        description: "Failed to update product.",
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
        handleSave();
      }
      // Plain Enter no longer triggers save — use the Save button to avoid accidental submissions
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSave, navigate]);

  if (loadingProduct) {
    return (
      <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-6"></div>
          <div className="space-y-4">
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
        <p className="text-gray-600">Update product information and pricing details.</p>
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
                <SelectItem key={brand.id} value={brand.id.toString()}>
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
            maxLength={50}
            className={errors.product_code ? "border-red-500" : ""}
            data-testid="input-product-code"
          />
          <p className="text-xs text-gray-500">Up to 50 characters, letters and numbers only. Will be auto-uppercased.</p>
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
            data-testid="input-product-name"
          />
          {errors.product_name && <p className="text-sm text-red-500">{errors.product_name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="size">Size</Label>
          <Input
            id="size"
            value={formData.size}
            onChange={(e) => handleInputChange('size', e.target.value)}
            placeholder="e.g., 250ml, 1kg, 10 pcs"
            data-testid="input-size"
          />
        </div>

        {/* Pricing Section */}
        <div className="border rounded-lg p-4 bg-gray-50/80">
          <h3 className="font-semibold text-gray-900 mb-3">Pricing Information</h3>
          
          <div className="grid grid-cols-1 gap-6">
            {/* Purchase Price */}
            <div className="space-y-2">
              <Label>Purchase Price</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.purchase_price}
                  onChange={(e) => handleInputChange('purchase_price', e.target.value)}
                  placeholder="0.00"
                  className={errors.purchase_price ? "border-red-500" : ""}
                  data-testid="input-purchase-price"
                />
                <Select
                  value={formData.purchase_price_currency}
                  onValueChange={(value) => handleInputChange('purchase_price_currency', value)}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">Cost price per unit</p>
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
                  className={errors.sale_price ? "border-red-500" : ""}
                  data-testid="input-sale-price"
                />
                <Select
                  value={formData.sale_price_currency}
                  onValueChange={(value) => handleInputChange('sale_price_currency', value)}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">Selling price per unit</p>
              {errors.sale_price && <p className="text-xs text-red-500">{errors.sale_price}</p>}
            </div>

            {/* Profit Margin Display */}
            {formData.purchase_price && formData.sale_price && parseFloat(formData.purchase_price) > 0 && formData.purchase_price_currency === formData.sale_price_currency && (
              <div className="p-3 bg-emerald-50 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800">Profit Margin</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {(((parseFloat(formData.sale_price) - parseFloat(formData.purchase_price)) / parseFloat(formData.purchase_price)) * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-emerald-600 mt-1">
                  Est. Profit: {(parseFloat(formData.sale_price) - parseFloat(formData.purchase_price)).toFixed(2)} {formData.sale_price_currency}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="md:static fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm md:bg-transparent p-4 md:p-0 border-t md:border-0 z-10">
        <div className="flex justify-end gap-3">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate(createPageUrl('Inventory'))} 
            disabled={loading}
            data-testid="button-cancel"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={loading} 
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Updating..." : "Update Product"}
          </Button>
        </div>
      </div>
    </div>
  );
}