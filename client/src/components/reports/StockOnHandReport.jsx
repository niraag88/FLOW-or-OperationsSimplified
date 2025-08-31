
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, Package, AlertTriangle, MapPin } from "lucide-react";
import { exportToCsv } from "../utils/export"; // Changed path from "../../utils/export" to "../utils/export"

export default function StockOnHandReport({ products, lots, canExport }) {
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const stockData = useMemo(() => {
    const data = lots
      .filter(lot => lot.isActive && lot.qty_on_hand > 0)
      .map(lot => {
        const product = products.find(p => p.id === lot.product_id);
        if (!product) return null;
        
        // Ensure that product.qty_on_hand is based on the aggregated product quantity,
        // or ensure reorder_level logic is sound. For this component, product.qty_on_hand 
        // isn't directly used from 'products' prop for 'isLowStock' calculation,
        // it should probably be `lot.qty_on_hand < product.reorder_level`.
        // However, sticking to original logic if no other changes are requested.
        // Assuming 'product.qty_on_hand' within the 'products' prop is correct for reorder level check.
        const isLowStock = product.minStockLevel && (product.stockQuantity < product.minStockLevel);

        return {
          ...lot,
          product_name: product.name,
          product_sku: product.sku,
          reorder_level: product.minStockLevel,
          is_low_stock: isLowStock,
        };
      })
      .filter(Boolean); // Remove null entries
      
    if (showLowStockOnly) {
      return data.filter(item => item.is_low_stock);
    }
    return data;
  }, [products, lots, showLowStockOnly]);

  const handleExport = () => {
    const exportableData = stockData.map(item => ({
      'Product SKU': item.product_sku,
      'Product Name': item.product_name,
      'Location': item.location,
      'Batch No': item.batch_no,
      'Qty on Hand': item.qty_on_hand,
      'Expiry Date': item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : 'N/A',
      'Cost Per Unit': item.cost_per_unit,
      'Currency': item.currency,
      'Status': item.is_low_stock ? 'Low Stock' : 'In Stock'
    }));
    exportToCsv(exportableData, "stock_on_hand_report");
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Stock on Hand Report
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Current inventory levels by product and location.
          </p>
        </div>
        <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
                <Switch
                    id="low-stock-filter"
                    checked={showLowStockOnly}
                    onCheckedChange={setShowLowStockOnly}
                />
                <Label htmlFor="low-stock-filter">Show Low Stock Only</Label>
            </div>
            {canExport && (
                <Button onClick={handleExport} variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
            )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Batch No</TableHead>
                <TableHead>Qty on Hand</TableHead>
                <TableHead>Expiry Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockData.length > 0 ? (
                stockData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.product_name}</div>
                      <div className="text-sm text-gray-500">{item.product_sku}</div>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-gray-400" />
                            {item.location}
                        </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.batch_no}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{item.qty_on_hand}</TableCell>
                    <TableCell>
                      {item.expiry_date
                        ? new Date(item.expiry_date).toLocaleDateString()
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {item.is_low_stock ? (
                        <Badge variant="destructive" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">In Stock</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24">
                    No stock data available for the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
