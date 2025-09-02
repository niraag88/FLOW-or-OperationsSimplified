import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Save, X, Package } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

export default function StockCountNew() {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load products on component mount
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const response = await fetch('/api/products', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch products');
        const data = await response.json();
        setProducts(data);
      } catch (error) {
        console.error("Error loading products:", error);
        toast({
          title: "Error",
          description: "Failed to load products.",
          variant: "destructive",
        });
      } finally {
        setLoadingProducts(false);
      }
    };

    loadProducts();
  }, [toast]);

  const handleQuantityChange = (productId, value) => {
    const numQuantity = parseInt(value) || 0;
    const limitedQuantity = Math.min(Math.max(0, numQuantity), 9999);
    
    setQuantities(prev => ({
      ...prev,
      [productId]: limitedQuantity
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Prepare items for submission
      const items = products.map(product => ({
        product_id: product.id,
        product_code: product.sku,
        brand_name: product.brandName,
        product_name: product.name,
        size: product.description || '',
        quantity: quantities[product.id] || 0
      }));

      // Filter out items with zero quantity
      const itemsWithStock = items.filter(item => item.quantity > 0);
      
      if (itemsWithStock.length === 0) {
        toast({
          title: "No Items",
          description: "Please enter quantities for at least one product.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Submit to API
      const response = await fetch('/api/stock-counts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: itemsWithStock })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create stock count');
      }

      const result = await response.json();
      
      toast({
        title: "Success",
        description: result.message || `Stock count created with ${itemsWithStock.length} products.`,
      });

      // Navigate back to inventory
      navigate('/Inventory');
      
    } catch (error) {
      console.error("Error creating stock count:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create stock count.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/Inventory');
  };

  const filteredProducts = products.filter(product =>
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brandName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate totals
  const totalProductsWithStock = Object.values(quantities).filter(qty => qty > 0).length;
  const totalQuantity = Object.values(quantities).reduce((sum, qty) => sum + (qty || 0), 0);

  if (loadingProducts) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Stock Count</h1>
          <p className="text-gray-600">Enter quantities for your products</p>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-products"
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
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <CardTitle>Products ({filteredProducts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Brand</TableHead>
                <TableHead>Product Code</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="w-32">Quantity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>{product.brandName || '-'}</TableCell>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.description || '-'}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="9999"
                      value={quantities[product.id] || 0}
                      onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                      className="w-24"
                      placeholder="0"
                      data-testid={`input-quantity-${product.id}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p>No products found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 sticky bottom-6 bg-white p-4 rounded-lg shadow-lg border">
        <Button 
          variant="outline" 
          onClick={handleCancel}
          disabled={loading}
          data-testid="button-cancel"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit}
          disabled={loading || totalProductsWithStock === 0}
          data-testid="button-create-stock-count"
        >
          <Save className="w-4 h-4 mr-2" />
          {loading ? "Creating..." : "Create Stock Count"}
        </Button>
      </div>
      
      {totalProductsWithStock === 0 && !loading && (
        <div className="text-center py-4">
          <p className="text-sm text-amber-600">
            Enter quantities for at least one product to create a stock count
          </p>
        </div>
      )}
    </div>
  );
}