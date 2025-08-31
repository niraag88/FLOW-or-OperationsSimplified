import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Package, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Product } from "@/api/entities";
import { logAuditAction } from "../utils/auditLogger";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function ProductsTab({ products, loading, canEdit, canDelete, onRefresh }) {
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
              <div key={i} className="flex justify-between items-center p-4 border rounded-lg">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-8 rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Products ({products.length})
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-6">
          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No products yet</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first product.</p>
            </div>
          ) : (
            <>
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
                          className="text-red-500 hover:text-red-600 -mt-1 -mr-1"
                          onClick={() => handleDeleteClick(product)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-gray-500">Description</p>
                        <p className="font-medium">{product.description || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Stock</p>
                        <p className="font-medium">{product.stockQuantity}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Cost Price</p>
                        <p className="font-medium">${product.costPrice}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Unit Price</p>
                        <p className="font-semibold text-green-600">${product.unitPrice}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <SimpleConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Delete Product"
        description={productToDelete ? `Are you sure you want to delete "${productToDelete.name}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
      />
    </>
  );
}