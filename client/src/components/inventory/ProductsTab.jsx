import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Package, Trash2, MoreHorizontal, Edit } from "lucide-react";
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

  const handleModifyClick = (product) => {
    // Navigate to edit product page or open edit modal
    window.location.href = `/products/edit/${product.id}`;
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
              {/* Desktop and Mobile Table */}
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Code</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Cost Price</TableHead>
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
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>{product.brand?.name || '-'}</TableCell>
                        <TableCell>
                          <div>{product.name}</div>
                        </TableCell>
                        <TableCell>{product.description || '-'}</TableCell>
                        <TableCell>£{product.costPrice}</TableCell>
                        <TableCell>AED {product.unitPrice}</TableCell>
                        {actualCanDelete && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleModifyClick(product)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Modify
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteClick(product)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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