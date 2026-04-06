
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Package, Search } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";

const fmt = (value) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function StockOnHandReport({ products, canExport }) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const categories = useMemo(() => {
    const cats = [...new Set((products || []).map(p => p.category).filter(Boolean))].sort();
    return cats;
  }, [products]);

  const stockData = useMemo(() => {
    return (products || [])
      .filter(p => p.isActive !== false)
      .filter(p => {
        if (selectedCategory !== "all" && p.category !== selectedCategory) return false;
        if (search) {
          const q = search.toLowerCase();
          return (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
        }
        return true;
      })
      .map(p => ({
        id: p.id,
        sku: p.sku || "-",
        name: p.name || "-",
        category: p.category || "-",
        stockQty: Number(p.stockQuantity || 0),
        costPrice: Number(p.costPrice || 0),
        costCurrency: p.costPriceCurrency || "GBP",
        sellingPrice: Number(p.sellingPrice || 0),
        stockValueAED: Number(p.sellingPrice || 0) * Number(p.stockQuantity || 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, selectedCategory]);

  const totals = useMemo(() => ({
    totalProducts: stockData.length,
    totalUnits: stockData.reduce((s, p) => s + p.stockQty, 0),
    totalValueAED: stockData.reduce((s, p) => s + p.stockValueAED, 0),
    inStock: stockData.filter(p => p.stockQty > 0).length,
    outOfStock: stockData.filter(p => p.stockQty === 0).length,
  }), [stockData]);

  const exportData = stockData.map(item => ({
    sku: item.sku,
    product_name: item.name,
    category: item.category,
    stock_qty: item.stockQty,
    cost_price: item.costPrice,
    cost_currency: item.costCurrency,
    selling_price_aed: item.sellingPrice.toFixed(2),
    stock_value_aed: item.stockValueAED.toFixed(2),
    status: item.stockQty > 0 ? 'In Stock' : 'Out of Stock',
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total Products</p>
          <p className="text-2xl font-bold text-blue-600">{totals.totalProducts}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Total Units</p>
          <p className="text-2xl font-bold text-green-600">{totals.totalUnits.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">In Stock</p>
          <p className="text-2xl font-bold text-green-600">{totals.inStock}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-500">Out of Stock</p>
          <p className="text-2xl font-bold text-red-500">{totals.outOfStock}</p>
        </Card>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Stock on Hand
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Current inventory levels by product. Selling price used for stock value.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search product / SKU…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-48"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="border rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="all">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {canExport && (
              <ExportDropdown
                data={exportData}
                type="Stock on Hand Report"
                filename="stock_on_hand_report"
                columns={{
                  sku: 'SKU',
                  product_name: 'Product Name',
                  category: 'Category',
                  stock_qty: 'Stock Qty',
                  cost_price: 'Cost Price',
                  cost_currency: 'Cost Currency',
                  selling_price_aed: 'Selling Price (AED)',
                  stock_value_aed: 'Stock Value (AED)',
                  status: 'Status',
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
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock Qty</TableHead>
                  <TableHead className="text-right">Selling Price (AED)</TableHead>
                  <TableHead className="text-right">Stock Value (AED)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockData.length > 0 ? (
                  stockData.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.sku}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{item.stockQty.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{fmt(item.sellingPrice)}</TableCell>
                      <TableCell className="text-right font-medium">AED {fmt(item.stockValueAED)}</TableCell>
                      <TableCell>
                        {item.stockQty > 0 ? (
                          <Badge className="bg-green-100 text-green-800 border-0 text-xs">In Stock</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 border-0 text-xs">Out of Stock</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-gray-500">
                      No products found for the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
