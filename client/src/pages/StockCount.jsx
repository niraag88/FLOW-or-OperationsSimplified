import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Save, X, Package } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Product } from "@/api/entities";
import { StockCount as StockCountEntity } from "@/api/entities";
import { createPageUrl } from "@/utils";
import { logAuditAction } from "../components/utils/auditLogger";

export default function StockCount() {
  const [products, setProducts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
    
    const loadProducts = async () => {
      try {
        const productsData = await Product.list();
        setProducts(productsData);
        
        // Initialize all quantities to 0
        const initialQuantities = {};
        productsData.forEach(product => {
          initialQuantities[product.id] = 0;
        });
        setQuantities(initialQuantities);
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

      await StockCountEntity.create({ items: itemsWithStock });
      
      await logAuditAction("StockCount", "bulk", "create", currentUser.email, { 
        itemCount: itemsWithStock.length,
        totalQuantity: itemsWithStock.reduce((sum, item) => sum + item.quantity, 0)
      });
      
      toast({
        title: "Success",
        description: `Stock count created with ${itemsWithStock.length} products.`,
      });

      navigate(createPageUrl('Inventory'));
      
    } catch (error) {
      console.error("Error creating stock count:", error);
      toast({
        title: "Error",
        description: "Failed to create stock count.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brandName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalProductsWithStock = Object.values(quantities).filter(qty => qty > 0).length;
  const totalQuantity = Object.values(quantities).reduce((sum, qty) => sum + (qty || 0), 0);

  if (loadingProducts) {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-96 mb-6"></div>
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-6 h-6" />
          Add Manual Stock Count
        </h1>
        <p className="text-gray-600 mt-1">
          Enter quantities for each product. Items with zero quantity will be excluded from the count.
        </p>
      </div>

      {/* Search and Summary */}
      <Card>
        <CardContent className="p-6">
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
                  <TableCell className="font-mono">{product.sku}</TableCell>
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
          onClick={() => navigate(createPageUrl('Inventory'))} 
          disabled={loading}
          data-testid="button-cancel"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={loading || totalProductsWithStock === 0}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="button-confirm"
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