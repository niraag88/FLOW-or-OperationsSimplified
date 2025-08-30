
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Package, Trash2, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Product } from "@/api/entities";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logAuditAction } from "../utils/auditLogger";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function ProductsTab({ products, loading, canEdit, canDelete, onRefresh }) {
  // State variables for Quick Add Product form
  const [newProductCode, setNewProductCode] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newPurchasePriceValue, setNewPurchasePriceValue] = useState("");
  const [newPurchasePriceCurrency, setNewPurchasePriceCurrency] = useState("AED");
  const [newSalePriceValue, setNewSalePriceValue] = useState("");
  const [newSalePriceCurrency, setNewSalePriceCurrency] = useState("AED");
  const [isQuickAddPopoverOpen, setIsQuickAddPopoverOpen] = useState(false);

  // State variables for SimpleConfirmDialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState(null);

  // Override permission checks - allow all actions
  const actualCanEdit = true;
  const actualCanDelete = true;

  const handleDeleteClick = (product) => {
    setProductToDelete(product);
    setDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    try {
      await Product.delete(productToDelete.id);
      const user = await User.me();
      await logAuditAction("Product", productToDelete.id, "delete", user.email, { deleted_product: productToDelete });
      onRefresh();
    } catch (error) {
      console.error("Error deleting product:", error);
    } finally {
      setDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const handleAddProduct = async () => {
    // Basic validation
    if (!newProductCode || !newBrandName || !newProductName || !newPurchasePriceValue || !newSalePriceValue) {
      alert("Please fill in all required fields: Product Code, Brand Name, Product Name, Purchase Price, and Sale Price.");
      return;
    }

    const productData = {
      product_code: newProductCode,
      brand_name: newBrandName,
      product_name: newProductName,
      size: newSize || null,
      purchase_price: parseFloat(newPurchasePriceValue),
      purchase_price_currency: newPurchasePriceCurrency,
      sale_price: parseFloat(newSalePriceValue),
      sale_price_currency: newSalePriceCurrency,
    };

    try {
      const createdProduct = await Product.create(productData);
      const user = await User.me();
      await logAuditAction("Product", createdProduct.id, "create", user.email, { created_product: createdProduct });
      onRefresh();
      // Reset form fields
      setNewProductCode("");
      setNewBrandName("");
      setNewProductName("");
      setNewSize("");
      setNewPurchasePriceValue("");
      setNewPurchasePriceCurrency("AED");
      setNewSalePriceValue("");
      setNewSalePriceCurrency("AED");
      setIsQuickAddPopoverOpen(false);
    } catch (error) {
      console.error("Error adding product:", error);
      alert("Failed to add product. Please try again.");
    }
  };

  const formatCurrency = (amount, currency) => {
    if (isNaN(amount) || amount === null || !currency) {
      return '';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Create a temporary product object for live preview
  const livePreviewProduct = {
    id: 'preview',
    product_code: newProductCode || 'PREVIEWCODE',
    brand_name: newBrandName || 'Preview Brand',
    product_name: newProductName || 'Preview Product',
    size: newSize || '-',
    purchase_price: parseFloat(newPurchasePriceValue) || 0,
    purchase_price_currency: newPurchasePriceCurrency,
    sale_price: parseFloat(newSalePriceValue) || 0,
    sale_price_currency: newSalePriceCurrency,
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products ({products.length})
          </CardTitle>
          {actualCanEdit && (
            <Popover open={isQuickAddPopoverOpen} onOpenChange={setIsQuickAddPopoverOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                    Quick Add Product
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium leading-none">Add New Product</h4>
                    <p className="text-sm text-muted-foreground">Fill in product details to quickly add a new item.</p>
                  </div>
                  <div className="grid gap-2">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="productCode">Product Code *</Label>
                      <Input
                        id="productCode"
                        value={newProductCode}
                        onChange={(e) => setNewProductCode(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., ABC-123"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="brandName">Brand Name *</Label>
                      <Input
                        id="brandName"
                        value={newBrandName}
                        onChange={(e) => setNewBrandName(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., Acme Corp"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="productName">Product Name *</Label>
                      <Input
                        id="productName"
                        value={newProductName}
                        onChange={(e) => setNewProductName(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., Widget Deluxe 5000"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="size">Size</Label>
                      <Input
                        id="size"
                        value={newSize}
                        onChange={(e) => setNewSize(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 500g, 100ml"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="purchasePriceValue">Purchase Price *</Label>
                      <Input
                        id="purchasePriceValue"
                        type="number"
                        value={newPurchasePriceValue}
                        onChange={(e) => setNewPurchasePriceValue(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 15.00"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="purchasePriceCurrency">Purchase Currency</Label>
                      <Input
                        id="purchasePriceCurrency"
                        value={newPurchasePriceCurrency}
                        onChange={(e) => setNewPurchasePriceCurrency(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., AED"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="salePriceValue">Sale Price *</Label>
                      <Input
                        id="salePriceValue"
                        type="number"
                        value={newSalePriceValue}
                        onChange={(e) => setNewSalePriceValue(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 19.99"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="salePriceCurrency">Sale Currency</Label>
                      <Input
                        id="salePriceCurrency"
                        value={newSalePriceCurrency}
                        onChange={(e) => setNewSalePriceCurrency(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., AED"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    <h5 className="font-medium text-sm leading-none">Live Preview</h5>
                    <div className="border rounded-md hidden md:block">
                      <Table>
                        <TableBody>
                          <TableRow className="bg-gray-50/50">
                            <TableCell className="font-mono text-xs py-2 px-2">{livePreviewProduct.product_code}</TableCell>
                            <TableCell className="text-xs py-2 px-2">
                              <div className="font-medium">{livePreviewProduct.brand_name}</div>
                              <div className="text-muted-foreground">{livePreviewProduct.product_name}</div>
                            </TableCell>
                            <TableCell className="text-xs py-2 px-2">{livePreviewProduct.size}</TableCell>
                            <TableCell className="text-xs py-2 px-2">{formatCurrency(livePreviewProduct.purchase_price, livePreviewProduct.purchase_price_currency)}</TableCell>
                            <TableCell className="font-semibold text-xs py-2 px-2">{formatCurrency(livePreviewProduct.sale_price, livePreviewProduct.sale_price_currency)}</TableCell>
                            <TableCell className="text-xs py-2 px-2"><Plus className="w-3 h-3 text-gray-400" /></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    <div className="border rounded-md md:hidden p-2 text-sm bg-gray-50/50">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-semibold">{livePreviewProduct.product_name}</h3>
                        <Plus className="w-3 h-3 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-600 font-mono mb-2">{livePreviewProduct.product_code}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500">Brand</p>
                          <p className="font-medium">{livePreviewProduct.brand_name}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Size</p>
                          <p className="font-medium">{livePreviewProduct.size}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-gray-500">Purchase Price</p>
                          <p className="font-bold">{formatCurrency(livePreviewProduct.purchase_price, livePreviewProduct.purchase_price_currency)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Sale Price</p>
                          <p className="font-bold text-base">{formatCurrency(livePreviewProduct.sale_price, livePreviewProduct.sale_price_currency)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button onClick={handleAddProduct} className="mt-4">Add Product</Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Brand & Product Name</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Purchase Price</TableHead>
                  <TableHead>Sale Price</TableHead>
                  {actualCanDelete && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow
                    key={product.id}
                    className="hover:bg-gray-50 transition-colors duration-200"
                    data-product-id={product.id}
                  >
                    <TableCell className="font-mono">{product.product_code}</TableCell>
                    <TableCell>
                      <div className="font-medium">{product.brand_name}</div>
                      <div className="text-sm text-muted-foreground">{product.product_name}</div>
                    </TableCell>
                    <TableCell>{product.size || '-'}</TableCell>
                    <TableCell>{formatCurrency(product.purchase_price, product.purchase_price_currency)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(product.sale_price, product.sale_price_currency)}</TableCell>
                    {actualCanDelete && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteClick(product)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {products.map((product) => (
              <Card
                key={product.id}
                className="p-4 transition-colors duration-200"
                data-product-id={product.id}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{product.product_name}</h3>
                    <p className="text-sm text-gray-600 font-mono">{product.product_code}</p>
                  </div>
                  {actualCanDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600 -mr-2 -mt-2"
                      onClick={() => handleDeleteClick(product)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Brand</p>
                    <p className="font-medium">{product.brand_name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Size</p>
                    <p className="font-medium">{product.size || '-'}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Purchase Price</p>
                      <p className="font-bold">{formatCurrency(product.purchase_price, product.purchase_price_currency)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Sale Price</p>
                      <p className="font-bold text-base">{formatCurrency(product.sale_price, product.sale_price_currency)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {products.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No products found</p>
            </div>
          )}
        </CardContent>
      </Card>
      <SimpleConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting product "${productToDelete?.product_name}"?`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
