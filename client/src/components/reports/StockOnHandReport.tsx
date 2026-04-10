
import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Search, Package, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportToXLSX } from "../utils/export";

const LOW_STOCK_THRESHOLD = 6;

const escapeHtml = (str: any) => {
  if (str == null) return '-';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const getStatus = (qty: any) => {
  if (qty === 0) return 'Out of Stock';
  if (qty <= LOW_STOCK_THRESHOLD) return 'Low Stock';
  return 'In Stock';
};

export default function StockOnHandReport({ products }: any) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<any>("all");
  const [selectedStatus, setSelectedStatus] = useState<any>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const activeProducts = useMemo(() =>
    (products || []).filter((p: any) => p.isActive === true),
    [products]
  );

  const brands = useMemo(() => {
    const set = new Set(activeProducts.map((p: any) => p.brandName).filter(Boolean));
    return [...set].sort();
  }, [activeProducts]);

  const summary = useMemo(() => ({
    total: activeProducts.length,
    inStock: activeProducts.filter((p: any) => (p.stockQuantity || 0) > LOW_STOCK_THRESHOLD).length,
    lowStock: activeProducts.filter((p: any) => (p.stockQuantity || 0) > 0 && (p.stockQuantity || 0) <= LOW_STOCK_THRESHOLD).length,
    outOfStock: activeProducts.filter((p: any) => (p.stockQuantity || 0) === 0).length,
  }), [activeProducts]);

  const filtered = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return activeProducts.filter((p: any) => {
      if (search && ![
        p.name, p.sku, p.brandName
      ].some((v: any) => (v || '').toLowerCase().includes(search))) return false;
      if (selectedBrand !== 'all' && p.brandName !== selectedBrand) return false;
      const status = getStatus(p.stockQuantity || 0);
      if (selectedStatus !== 'all' && status !== selectedStatus) return false;
      return true;
    });
  }, [activeProducts, searchTerm, selectedBrand, selectedStatus]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetPage = () => setCurrentPage(1);

  const handleViewAndPrint = () => {
    const now = format(new Date(), 'dd/MM/yy');
    const headerCells = `<th>Product Code</th><th>Brand</th><th>Product</th><th>Size</th><th style="text-align:right">Qty</th><th>Status</th>`;
    const bodyRows = filtered.map((p: any) => {
      const qty = p.stockQuantity || 0;
      const status = getStatus(qty);
      return `<tr>
        <td>${escapeHtml(p.sku)}</td>
        <td>${escapeHtml(p.brandName)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.size)}</td>
        <td style="text-align:right">${qty}</td>
        <td>${escapeHtml(status)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Stock Report</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; color: #333; }
  .print-header { text-align: center; margin-bottom: 30px; }
  .print-header h1 { font-size: 24px; margin-bottom: 5px; }
  .print-header h2 { font-size: 18px; color: #666; margin-top: 0; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  td { font-size: 12px; }
  .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
  @media print { body { margin: 0; } table { font-size: 10px; } }
</style>
</head>
<body>
<div class="print-header">
  <h1>Business Operations</h1>
  <h2>Stock Report</h2>
</div>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="print-footer">
  <p>Generated: ${now} &nbsp;|&nbsp; Total records: ${filtered.length}</p>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const pw = window.open(url, '_blank');
    if (!pw) alert('Please allow popups to use View & Print.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleExportXLSX = () => {
    const rows = filtered.map((p: any) => ({
      'Brand': p.brandName || '-',
      'Product Code': p.sku || '-',
      'Product': p.name || '-',
      'Size': p.size || '-',
      'Qty': p.stockQuantity || 0,
      'Status': getStatus(p.stockQuantity || 0),
    }));
    exportToXLSX(rows, `Stock_Report_${format(new Date(), 'ddMMyy')}`, 'Stock Report');
  };

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-gray-500">Total Products</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-gray-500">In Stock</p>
            <p className="text-2xl font-bold text-green-600">{summary.inStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-gray-500">Low Stock</p>
            <p className="text-2xl font-bold text-orange-500">{summary.lowStock}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-gray-500">Out of Stock</p>
            <p className="text-2xl font-bold text-red-600">{summary.outOfStock}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter + results card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Package className="w-5 h-5" />
              Stock Report
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Current inventory levels by product.</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleViewAndPrint}>
                <Eye className="w-4 h-4 mr-2" />
                View &amp; Print
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportXLSX}>
                <Download className="w-4 h-4 mr-2" />
                Export to XLSX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Product, code or brand"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); resetPage(); }}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Brand</Label>
              <Select value={selectedBrand} onValueChange={v => { setSelectedBrand(v); resetPage(); }}>
                <SelectTrigger><SelectValue placeholder="All brands" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map((b: any) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={v => { setSelectedStatus(v); resetPage(); }}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="In Stock">In Stock</SelectItem>
                  <SelectItem value="Low Stock">Low Stock</SelectItem>
                  <SelectItem value="Out of Stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                      No products match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : paginated.map((p: any) => {
                  const qty = p.stockQuantity || 0;
                  const status = getStatus(qty);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.brandName || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-700">{p.sku || '-'}</TableCell>
                      <TableCell>{p.name || '-'}</TableCell>
                      <TableCell>{p.size || '-'}</TableCell>
                      <TableCell className={`text-right font-medium ${qty === 0 ? 'text-red-600' : ''}`}>
                        {qty}
                      </TableCell>
                      <TableCell>
                        {status === 'In Stock'     && <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">In Stock</Badge>}
                        {status === 'Low Stock'    && <Badge className="bg-orange-100 text-orange-800 border border-orange-300 text-xs">Low Stock</Badge>}
                        {status === 'Out of Stock' && <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">Out of Stock</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} results
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline"  onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                <span className="text-sm">Page {currentPage} of {totalPages}</span>
                <Button variant="outline"  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
