import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Save, X, ChevronLeft, ChevronRight } from "lucide-react";

export default function AddStockCountDialog({ open, onClose, products, onSuccess }) {
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const handleQuantityChange = (productId, quantity) => {
    const numQuantity = parseInt(quantity) || 0;
    const limitedQuantity = Math.min(Math.max(0, numQuantity), 9999);
    
    setQuantities(prev => ({
      ...prev,
      [productId]: limitedQuantity
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const items = products.map(product => ({
        product_id: product.id,
        product_code: product.product_code,
        brand_name: product.brand_name,
        product_name: product.product_name,
        size: product.size || '',
        quantity: quantities[product.id] || 0
      }));

      await onSuccess({ items });
      
      setQuantities({});
      setSearchTerm("");
      setCurrentPage(1);
    } catch (error) {
      console.error("Error creating stock count:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brandName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalProductsWithStock = Object.values(quantities).filter(qty => qty > 0).length;
  const totalQuantity = Object.values(quantities).reduce((sum, qty) => sum + (qty || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Add Manual Stock Count</DialogTitle>
          <p className="text-sm text-gray-600 mt-1">
            Enter quantities for each product. Items with zero quantity will be excluded from the count.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Search and Summary */}
          <div className="p-6 border-b bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1); // Reset to first page on search
                  }}
                  className="pl-10"
                />
              </div>
              
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-500">Products with Stock</p>
                  <Badge variant="outline" className="mt-1">{totalProductsWithStock}</Badge>
                </div>
                <div className="text-center">
                  <p className="text-gray-500">Total Quantity</p>
                  <Badge className="bg-blue-100 text-blue-800 mt-1">
                    {totalQuantity.toLocaleString()}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="flex-1 overflow-auto p-6">
            {/* Desktop Table */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead className="w-32">Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="w-24">Size</TableHead>
                    <TableHead className="w-32">Quantity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="text-sm">{product.brandName || '-'}</TableCell>
                      <TableCell className="text-sm">{product.sku}</TableCell>
                      <TableCell className="text-sm">{product.name}</TableCell>
                      <TableCell className="text-sm">{product.description || '-'}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="9999"
                          value={quantities[product.id] || 0}
                          onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                          className="w-24"
                          placeholder="0"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4">
              {paginatedProducts.map((product) => (
                <Card key={product.id} className="p-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{product.name}</h3>
                      <p className="text-sm text-gray-600">{product.sku}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Brand</p>
                        <p className="font-medium">{product.brandName || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Size</p>
                        <p className="font-medium">{product.description || '-'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-500 text-sm mb-2">Quantity</p>
                      <Input
                        type="number"
                        min="0"
                        max="9999"
                        value={quantities[product.id] || 0}
                        onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                        className="w-24"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p>No products found matching your search</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions & Pagination */}
        <div className="p-6 border-t bg-gray-50 space-y-4">
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={loading || totalProductsWithStock === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Confirming..." : "Confirm"}
            </Button>
          </div>
          {totalProductsWithStock === 0 && !loading && (
            <p className="text-sm text-amber-600 mt-2 text-center">
              Enter quantities for at least one product to create a stock count
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}