
import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle, MapPin } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";

export default function StockOnHandReport({ products, lots, canExport }) {
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const stockData = useMemo(() => {
    const data = lots
      .filter(lot => lot.isActive && lot.qty_on_hand > 0)
      .map(lot => {
        const product = products.find(p => p.id === lot.product_id);
        if (!product) return null;
        
        return {
          ...lot,
          product_name: product.name,
          product_sku: product.sku,
          is_low_stock: false,
        };
      })
      .filter(Boolean); // Remove null entries
      
    if (showLowStockOnly) {
      return data.filter(item => item.is_low_stock);
    }
    return data;
  }, [products, lots, showLowStockOnly]);

  // Prepare data for standardized export format
  const exportData = stockData.map(item => ({
    product_sku: item.product_sku,
    product_name: item.product_name,
    location: item.location,
    batch_no: item.batch_no,
    qty_on_hand: item.qty_on_hand,
    expiry_date: item.expiry_date ? format(new Date(item.expiry_date), 'dd/MM/yy') : 'N/A',
    cost_per_unit: item.cost_per_unit,
    currency: item.currency,
    status: item.is_low_stock ? 'Low Stock' : 'In Stock'
  }));

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
                <ExportDropdown 
                  data={exportData}
                  type="Stock on Hand Report"
                  filename="stock_on_hand_report"
                  columns={{
                    product_sku: 'Product SKU',
                    product_name: 'Product Name',
                    location: 'Location',
                    batch_no: 'Batch No',
                    qty_on_hand: 'Qty on Hand',
                    expiry_date: 'Expiry Date',
                    cost_per_unit: 'Cost Per Unit',
                    currency: 'Currency',
                    status: 'Status'
                  }}
                />
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
                        ? format(new Date(item.expiry_date), 'dd/MM/yy')
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
