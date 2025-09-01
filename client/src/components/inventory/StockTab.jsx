import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Package, Activity, AlertTriangle, History } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function StockTab({ products, loading, canEdit, currentUser, onRefresh, onStockSubTabChange }) {
  const [stockMovements, setStockMovements] = useState([]);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [companySettings, setCompanySettings] = useState(null);
  const [activeStockTab, setActiveStockTab] = useState("stock-levels");

  useEffect(() => {
    loadStockMovements();
    loadCompanySettings();
  }, []);

  // Initialize stock sub-tab data on mount
  useEffect(() => {
    if (onStockSubTabChange && stockMovements.length >= 0) {
      onStockSubTabChange(activeStockTab, stockMovements, lowStockProducts, outOfStockProducts);
    }
  }, [stockMovements, lowStockProducts, outOfStockProducts, activeStockTab, onStockSubTabChange]);

  const loadCompanySettings = async () => {
    try {
      const response = await fetch('/api/company-settings', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch company settings');
      const data = await response.json();
      setCompanySettings(data);
    } catch (error) {
      console.error("Error loading company settings:", error);
      setCompanySettings({ lowStockThreshold: 6, fxGbpToAed: 4.85 });
    }
  };

  const loadStockMovements = async () => {
    setLoadingMovements(true);
    try {
      const response = await fetch('/api/stock-movements', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stock movements');
      const data = await response.json();
      setStockMovements(data);
    } catch (error) {
      console.error("Error loading stock movements:", error);
      setStockMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  // Calculate stock summary with configurable threshold and AED conversion
  const stockSummary = products.reduce((acc, product) => {
    const stock = product.stockQuantity || 0;
    const lowStockThreshold = companySettings?.lowStockThreshold || 6;
    const fxRate = parseFloat(companySettings?.fxGbpToAed || 4.85);
    
    if (stock === 0) {
      acc.outOfStock++;
    } else if (stock <= lowStockThreshold) {
      acc.lowStock++;
    }
    
    // Convert cost price to AED if needed
    const costPrice = parseFloat(product.costPrice) || 0;
    const costPriceAed = costPrice * fxRate; // Assuming cost price is in GBP
    
    acc.totalValue += stock * costPriceAed;
    acc.totalProducts++;
    acc.totalQuantity += stock;
    
    return acc;
  }, {
    totalProducts: 0,
    totalQuantity: 0,
    totalValue: 0,
    lowStock: 0,
    outOfStock: 0
  });

  const lowStockProducts = products.filter(p => {
    const lowStockThreshold = companySettings?.lowStockThreshold || 6;
    return (p.stockQuantity || 0) > 0 && (p.stockQuantity || 0) <= lowStockThreshold;
  });

  const outOfStockProducts = products.filter(p => (p.stockQuantity || 0) === 0);

  const getMovementIcon = (type) => {
    switch (type) {
      case 'goods_receipt': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'sale': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'adjustment': return <Activity className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMovementTypeLabel = (type) => {
    switch (type) {
      case 'goods_receipt': return 'Stock In';
      case 'sale': return 'Sale';
      case 'adjustment': return 'Adjustment';
      default: return type;
    }
  };

  const formatMovementQuantity = (quantity, type) => {
    const isPositive = quantity > 0;
    const sign = isPositive ? '+' : '';
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    return (
      <span className={`font-semibold ${color}`}>
        {sign}{quantity}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <Package className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Products</p>
                <p className="text-2xl font-bold">{stockSummary.totalProducts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Stock</p>
                <p className="text-2xl font-bold">{stockSummary.totalQuantity.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Stock Value</p>
                <p className="text-2xl font-bold">AED {stockSummary.totalValue.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold text-amber-600">{stockSummary.lowStock}</p>
                <p className="text-xs text-gray-500">≤{companySettings?.lowStockThreshold || 6} units</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                <span className="text-red-600 font-bold">!</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600">{stockSummary.outOfStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock Details */}
      <Tabs defaultValue="stock-levels" className="w-full" onValueChange={(value) => {
        setActiveStockTab(value);
        if (onStockSubTabChange) {
          onStockSubTabChange(value, stockMovements, lowStockProducts, outOfStockProducts);
        }
      }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stock-levels">Current Stock</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
          <TabsTrigger value="out-of-stock">Out of Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="stock-levels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
              <p className="text-sm text-gray-600">Real-time stock quantities updated automatically</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => {
                    const stock = product.stockQuantity || 0;
                    const minStock = product.minStockLevel || 10;
                    const status = stock === 0 ? 'out' : stock <= minStock ? 'low' : 'ok';
                    
                    return (
                      <TableRow key={product.id}>
                        <TableCell>{product.brandName || '-'}</TableCell>
                        <TableCell className="font-mono">{product.sku}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.description || '-'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={status === 'out' ? 'destructive' : status === 'low' ? 'secondary' : 'default'}
                            className={status === 'ok' ? 'bg-green-100 text-green-800' : ''}
                          >
                            {stock.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>{minStock}</TableCell>
                        <TableCell>
                          {status === 'out' && <Badge variant="destructive">Out of Stock</Badge>}
                          {status === 'low' && <Badge variant="secondary">Low Stock</Badge>}
                          {status === 'ok' && <Badge className="bg-green-100 text-green-800">In Stock</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                Recent Stock Movements
              </CardTitle>
              <p className="text-sm text-gray-600">Automatic stock changes from goods receipts and sales</p>
            </CardHeader>
            <CardContent>
              {loadingMovements ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Previous</TableHead>
                      <TableHead>New Stock</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="text-sm">
                          {format(new Date(movement.createdAt), 'MMM dd, yyyy h:mm a')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{movement.productName}</p>
                            <p className="text-xs text-gray-500">{movement.productSku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getMovementIcon(movement.movementType)}
                            <span className="text-sm">{getMovementTypeLabel(movement.movementType)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatMovementQuantity(movement.quantity, movement.movementType)}
                        </TableCell>
                        <TableCell>{movement.previousStock}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{movement.newStock}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {movement.notes}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {stockMovements.length === 0 && !loadingMovements && (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No stock movements recorded yet</p>
                  <p className="text-sm mt-2">Stock changes will appear here automatically</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                Low Stock Products ({lowStockProducts.length})
              </CardTitle>
              <p className="text-sm text-gray-600">Products at or below minimum stock level</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Reorder Needed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockProducts.map((product) => {
                    const reorderQty = (product.maxStockLevel || 50) - (product.stockQuantity || 0);
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.sku} • {product.brandName}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-amber-600">
                            {product.stockQuantity || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>{product.minStockLevel || 10}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {reorderQty} units
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {lowStockProducts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No products with low stock</p>
                  <p className="text-sm mt-2">All products are above minimum stock levels</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out-of-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Out of Stock Products ({outOfStockProducts.length})
              </CardTitle>
              <p className="text-sm text-gray-600">Products with zero stock quantity</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Last Sale Price</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Suggested Reorder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outOfStockProducts.map((product) => {
                    const reorderQty = product.maxStockLevel || 50;
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.sku} • {product.brandName}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          ${parseFloat(product.unitPrice).toFixed(2)}
                        </TableCell>
                        <TableCell>{product.minStockLevel || 10}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-red-600">
                            {reorderQty} units
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {outOfStockProducts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No products out of stock</p>
                  <p className="text-sm mt-2">All products have stock available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}