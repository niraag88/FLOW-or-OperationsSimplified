
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
  brandId: "",
  sku: "",
  name: "",
  description: "",
  unitPrice: "",
  costPrice: "",
  category: "",
  unit: "pcs",
  stockQuantity: 0,
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
        
        setBrands(brandsData.filter(b => b.isActive)); // Fetch and filter active brands
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
    if (!formData.brandId) newErrors.brandId = "Brand is required";
    if (!formData.sku) newErrors.sku = "SKU is required";
    if (!formData.name) newErrors.name = "Product name is required";
    if (formData.unitPrice === "" || formData.unitPrice === null) newErrors.unitPrice = "Unit price is required";

    // SKU format
    const skuRegex = /^[A-Za-z0-9]{1,50}$/;
    if (formData.sku && !skuRegex.test(formData.sku)) {
      newErrors.sku = "Up to 50 letters and numbers only";
    }

    // Price validation
    if (formData.unitPrice && parseFloat(formData.unitPrice) < 0) {
      newErrors.unitPrice = "Unit price must be positive";
    }
    
    if (formData.costPrice && parseFloat(formData.costPrice) < 0) {
      newErrors.costPrice = "Cost price must be positive";
    }

    // Business logic: Unit price should be higher than cost price for profitability
    if (formData.costPrice && formData.unitPrice) {
      const costPrice = parseFloat(formData.costPrice);
      const unitPrice = parseFloat(formData.unitPrice);
      if (unitPrice <= costPrice) {
        newErrors.unitPrice = "Unit price should be higher than cost price for profitability";
      }
    }
    
    // Check uniqueness of SKU
    if (formData.sku && !newErrors.sku) {
        const existing = await Product.filter({ sku: formData.sku });
        if (existing.length > 0) {
            newErrors.sku = "This SKU already exists.";
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
      const productData = {
        ...formData,
        unitPrice: parseFloat(formData.unitPrice) || 0,
        costPrice: parseFloat(formData.costPrice) || 0,
        stockQuantity: parseInt(formData.stockQuantity) || 0,
        brandId: parseInt(formData.brandId)
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
        document.getElementById('brandId').focus();
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
    if (field === 'sku') {
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


  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add New Product</h1>
        <p className="text-gray-600">Create a new product with pricing information for your catalog.</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brandId">Brand *</Label>
          <Select
            value={formData.brandId}
            onValueChange={(value) => handleInputChange('brandId', value)}
          >
            <SelectTrigger id="brandId" className={errors.brandId ? "border-red-500" : ""}>
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
          {errors.brandId && <p className="text-sm text-red-500">{errors.brandId}</p>}
          {brands.length === 0 && (
            <p className="text-sm text-amber-600">
              No brands available. Please add brands in Settings first.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sku">SKU *</Label>
          <Input
            id="sku"
            value={formData.sku}
            onChange={(e) => handleInputChange('sku', e.target.value)}
            placeholder="e.g., LAPTOP001"
            maxLength={50}
            className={errors.sku ? "border-red-500" : ""}
          />
          <p className="text-xs text-gray-500">Up to 50 characters, letters and numbers only. Will be auto-uppercased.</p>
          {errors.sku && <p className="text-sm text-red-500">{errors.sku}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Product Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="e.g., MacBook Pro 16-inch"
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Product description"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => handleInputChange('category', e.target.value)}
              placeholder="e.g., Electronics, Clothing"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Unit</Label>
            <Select
              value={formData.unit}
              onValueChange={(value) => handleInputChange('unit', value)}
            >
              <SelectTrigger id="unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pcs">Pieces</SelectItem>
                <SelectItem value="kg">Kilograms</SelectItem>
                <SelectItem value="g">Grams</SelectItem>
                <SelectItem value="l">Liters</SelectItem>
                <SelectItem value="ml">Milliliters</SelectItem>
                <SelectItem value="m">Meters</SelectItem>
                <SelectItem value="cm">Centimeters</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Pricing Section */}
        <div className="border rounded-lg p-4 bg-gray-50/80">
          <h3 className="font-semibold text-gray-900 mb-3">Pricing Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
            {/* Unit Price */}
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit Price *</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => handleInputChange('unitPrice', e.target.value)}
                placeholder="0.00"
                className={errors.unitPrice ? "border-red-500" : ""}
              />
              <p className="text-xs text-gray-500">Selling price per unit</p>
              {errors.unitPrice && <p className="text-sm text-red-500">{errors.unitPrice}</p>}
            </div>

            {/* Cost Price */}
            <div className="space-y-2">
              <Label htmlFor="costPrice">Cost Price</Label>
              <Input
                id="costPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.costPrice}
                onChange={(e) => handleInputChange('costPrice', e.target.value)}
                placeholder="0.00"
                className={errors.costPrice ? "border-red-500" : ""}
              />
              <p className="text-xs text-gray-500">Purchase cost per unit</p>
              {errors.costPrice && <p className="text-sm text-red-500">{errors.costPrice}</p>}
            </div>

          </div>

          {/* Stock Information */}
          <div className="mt-4">
            <h4 className="font-medium text-gray-900 mb-3">Stock Information</h4>
            <div className="space-y-2">
              <Label htmlFor="stockQuantity">Initial Stock Quantity</Label>
              <Input
                id="stockQuantity"
                type="number"
                min="0"
                value={formData.stockQuantity}
                onChange={(e) => handleInputChange('stockQuantity', e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-gray-500">Current available quantity in stock</p>
            </div>
          </div>

          {/* Profit Margin Display */}
          {formData.unitPrice && formData.costPrice && (
            <div className="mt-4">
              <div className="p-3 bg-emerald-50 rounded-md">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-emerald-800">Profit Margin</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {(((parseFloat(formData.unitPrice) - parseFloat(formData.costPrice)) / parseFloat(formData.unitPrice)) * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-emerald-600 mt-1">
                  Est. Profit: {(parseFloat(formData.unitPrice) - parseFloat(formData.costPrice)).toFixed(2)}
                </p>
              </div>
            </div>
          )}
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
