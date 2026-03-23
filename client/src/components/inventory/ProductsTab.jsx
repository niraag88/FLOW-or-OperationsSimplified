import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Package, Trash2, MoreHorizontal, Edit, Search, Filter, ChevronDown, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Product, RecycleBin, AuditLog, User } from "@/api/entities";
import { formatCurrency } from "@/utils/currency";
import { logAuditAction } from "../utils/auditLogger";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function ProductsTab({ 
  products, 
  paginatedProducts, 
  loading, 
  canEdit, 
  canDelete, 
  onRefresh,
  searchTerm,
  setSearchTerm,
  selectedBrands,
  setSelectedBrands,
  selectedSizes,
  setSelectedSizes,
  uniqueBrands,
  uniqueSizes,
  resetPagination,
  currentPage,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  totalPages,
  startIndex,
  endIndex
}) {
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
      const user = await User.me();
      
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'Product',
        document_id: productToDelete.id,
        document_number: productToDelete.name,
        document_data: productToDelete,
        deleted_by: user?.email || 'unknown',
        deleted_date: new Date().toISOString(),
        reason: 'Deleted from UI',
        original_status: productToDelete.isActive ? 'Active' : 'Inactive',
        can_restore: true
      });

      // Log the deletion
      await AuditLog.create({
        entity_type: 'Product',
        entity_id: productToDelete.id,
        action: 'deleted',
        user_email: user?.email || 'unknown',
        changes: { 
          product_name: productToDelete.name,
          deletion_reason: 'Deleted from UI',
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Delete from main table
      await Product.delete(productToDelete.id);
      
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
            Products ({products?.length || 0})
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-6">
          {/* Search and Filters */}
          <div className="space-y-4 mb-6">
            {/* Search Bar */}
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search product code, brand, name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  resetPagination();
                }}
                className="max-w-sm"
              />
            </div>

            {/* Advanced Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <Filter className="w-4 h-4 text-gray-400" />
              
              {/* Brand Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between w-40">
                    {selectedBrands.length === 0 ? "All Brands" : `${selectedBrands.length} selected`}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-4">
                  <div className="space-y-3">
                    <h4 className="font-medium leading-none">Select Brands</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {uniqueBrands.map(brand => (
                        <div key={brand} className="flex items-center space-x-2">
                          <Checkbox
                            id={`product-brand-${brand}`}
                            checked={selectedBrands.includes(brand)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBrands(prev => [...prev, brand]);
                              } else {
                                setSelectedBrands(prev => prev.filter(b => b !== brand));
                              }
                              resetPagination();
                            }}
                          />
                          <label
                            htmlFor={`product-brand-${brand}`}
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {brand}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Size Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between w-40">
                    {selectedSizes.length === 0 ? "All Sizes" : `${selectedSizes.length} selected`}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-4">
                  <div className="space-y-3">
                    <h4 className="font-medium leading-none">Select Sizes</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {uniqueSizes.map(size => (
                        <div key={size} className="flex items-center space-x-2">
                          <Checkbox
                            id={`product-size-${size}`}
                            checked={selectedSizes.includes(size)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSizes(prev => [...prev, size]);
                              } else {
                                setSelectedSizes(prev => prev.filter(s => s !== size));
                              }
                              resetPagination();
                            }}
                          />
                          <label
                            htmlFor={`product-size-${size}`}
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {size}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Clear Filters Button */}
              {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedBrands([]);
                    setSelectedSizes([]);
                    resetPagination();
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Active Filter Badges */}
            {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600">Active filters:</span>
                {selectedBrands.map(brand => (
                  <Badge key={brand} variant="secondary" className="gap-1">
                    Brand: {brand}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => {
                        setSelectedBrands(prev => prev.filter(b => b !== brand));
                        resetPagination();
                      }}
                    />
                  </Badge>
                ))}
                {selectedSizes.map(size => (
                  <Badge key={size} variant="secondary" className="gap-1">
                    Size: {size}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => {
                        setSelectedSizes(prev => prev.filter(s => s !== size));
                        resetPagination();
                      }}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No products yet</h3>
              <p className="text-gray-600 mb-4">Get started by adding your first product.</p>
            </div>
          ) : (
            <>
              {/* Desktop and Mobile Table */}
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product Code</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Cost Price</TableHead>
                      <TableHead>Sale Price</TableHead>
                      {actualCanDelete && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedProducts.map((product) => (
                      <TableRow
                        key={product.id}
                        className="hover:bg-gray-50 transition-colors duration-200"
                        data-product-id={product.id}
                      >
                        <TableCell>{product.brandName || '-'}</TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>
                          <div>{product.name}</div>
                        </TableCell>
                        <TableCell>{product.description || '-'}</TableCell>
                        <TableCell>{formatCurrency(product.costPrice, product.costPriceCurrency || 'GBP')}</TableCell>
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

              {/* Pagination Controls */}
              {products.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">
                      Showing {startIndex + 1} to {Math.min(endIndex, products.length)} of {products.length} products
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    {/* Items per page selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">Show:</span>
                      <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                        setItemsPerPage(Number(value));
                        setCurrentPage(1);
                      }}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value={products.length.toString()}>All</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Page navigation */}
                    {totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          Previous
                        </Button>
                        
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNumber;
                            if (totalPages <= 5) {
                              pageNumber = i + 1;
                            } else if (currentPage <= 3) {
                              pageNumber = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNumber = totalPages - 4 + i;
                            } else {
                              pageNumber = currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNumber}
                                variant={currentPage === pageNumber ? "default" : "outline"}
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => setCurrentPage(pageNumber)}
                              >
                                {pageNumber}
                              </Button>
                            );
                          })}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <SimpleConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Product"
        description={productToDelete ? `Are you sure you want to delete "${productToDelete.name}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        confirmVariant="destructive"
      />
    </>
  );
}