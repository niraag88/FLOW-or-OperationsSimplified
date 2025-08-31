
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
  const [newSku, setNewSku] = useState("");
  const [newBrandId, setNewBrandId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newCostPrice, setNewCostPrice] = useState("");
  const [newStockQuantity, setNewStockQuantity] = useState(0);
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
    if (!newSku || !newBrandId || !newName || !newUnitPrice) {
      alert("Please fill in all required fields: SKU, Brand, Product Name, and Unit Price.");
      return;
    }

    const productData = {
      sku: newSku,
      brandId: parseInt(newBrandId),
      name: newName,
      description: newDescription || null,
      unitPrice: parseFloat(newUnitPrice),
      costPrice: parseFloat(newCostPrice) || 0,
      stockQuantity: parseInt(newStockQuantity) || 0,
    };

    try {
      const createdProduct = await Product.create(productData);
      const user = await User.me();
      await logAuditAction("Product", createdProduct.id, "create", user.email, { created_product: createdProduct });
      onRefresh();
      // Reset form fields
      setNewSku("");
      setNewBrandId("");
      setNewName("");
      setNewDescription("");
      setNewUnitPrice("");
      setNewCostPrice("");
      setNewStockQuantity(0);
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
    sku: newSku || 'PREVIEWSKU',
    name: newName || 'Preview Product',
    description: newDescription || 'Preview description',
    unitPrice: parseFloat(newUnitPrice) || 0,
    costPrice: parseFloat(newCostPrice) || 0,
    stockQuantity: parseInt(newStockQuantity) || 0,
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
                      <Label htmlFor="sku">SKU *</Label>
                      <Input
                        id="sku"
                        value={newSku}
                        onChange={(e) => setNewSku(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., ABC-123"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="brandId">Brand ID *</Label>
                      <Input
                        id="brandId"
                        value={newBrandId}
                        onChange={(e) => setNewBrandId(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="Brand ID"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="name">Product Name *</Label>
                      <Input
                        id="name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., Widget Deluxe 5000"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="Product description"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="unitPrice">Unit Price *</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        step="0.01"
                        value={newUnitPrice}
                        onChange={(e) => setNewUnitPrice(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 19.99"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="costPrice">Cost Price</Label>
                      <Input
                        id="costPrice"
                        type="number"
                        step="0.01"
                        value={newCostPrice}
                        onChange={(e) => setNewCostPrice(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 15.00"
                      />
                    </div>
                    <div className="grid grid-cols-3 items-center gap-4">
                      <Label htmlFor="stockQuantity">Stock Quantity</Label>
                      <Input
                        id="stockQuantity"
                        type="number"
                        value={newStockQuantity}
                        onChange={(e) => setNewStockQuantity(e.target.value)}
                        className="col-span-2 h-8"
                        placeholder="e.g., 100"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    <h5 className="font-medium text-sm leading-none">Live Preview</h5>
                    <div className="border rounded-md hidden md:block">
                      <Table>
                        <TableBody>
                          <TableRow className="bg-gray-50/50">
                            <TableCell className="font-mono text-xs py-2 px-2">{livePreviewProduct.sku}</TableCell>
                            <TableCell className="text-xs py-2 px-2">
                              <div className="font-medium">{livePreviewProduct.name}</div>
                              <div className="text-muted-foreground">{livePreviewProduct.description}</div>
                            </TableCell>
                            <TableCell className="text-xs py-2 px-2">{livePreviewProduct.stockQuantity}</TableCell>
                            <TableCell className="text-xs py-2 px-2">${livePreviewProduct.costPrice}</TableCell>
                            <TableCell className="font-semibold text-xs py-2 px-2">${livePreviewProduct.unitPrice}</TableCell>
                            <TableCell className="text-xs py-2 px-2"><Plus className="w-3 h-3 text-gray-400" /></TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                    <div className="border rounded-md md:hidden p-2 text-sm bg-gray-50/50">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-semibold">{livePreviewProduct.name}</h3>
                        <Plus className="w-3 h-3 text-gray-400" />
                      </div>
                      <p className="text-xs text-gray-600 font-mono mb-2">{livePreviewProduct.sku}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500">Description</p>
                          <p className="font-medium">{livePreviewProduct.description}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Stock</p>
                          <p className="font-medium">{livePreviewProduct.stockQuantity}</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-gray-500">Cost Price</p>
                          <p className="font-bold">${livePreviewProduct.costPrice}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Unit Price</p>
                          <p className="font-bold text-base">${livePreviewProduct.unitPrice}</p>
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
                  <TableHead>SKU</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Stock</TableHead>
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
                    <TableCell className="font-mono">{product.sku}</TableCell>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                    </TableCell>
                    <TableCell>{product.description || '-'}</TableCell>
                    <TableCell>${product.costPrice}</TableCell>
                    <TableCell className="font-semibold">${product.unitPrice}</TableCell>
                    <TableCell>{product.stockQuantity}</TableCell>
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
                    <h3 className="font-semibold text-gray-900">{product.name}</h3>
                    <p className="text-sm text-gray-600 font-mono">{product.sku}</p>
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
                    <p className="text-gray-500">Description</p>
                    <p className="font-medium">{product.description || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Stock</p>
                    <p className="font-medium">{product.stockQuantity}</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Cost Price</p>
                      <p className="font-bold">${product.costPrice}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Unit Price</p>
                      <p className="font-bold text-base">${product.unitPrice}</p>
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
        description={`Do you wish to confirm deleting product "${productToDelete?.name}"?`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
