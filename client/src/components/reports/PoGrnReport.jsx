import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth, isValid, parseISO } from "date-fns";
import { exportToCsv } from "../utils/export";
import { Brand } from "@/api/entities";

export default function PoGrnReport({ purchaseOrders, goodsReceipts, canExport }) {
  const [brands, setBrands] = useState([]);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      const brandsData = await Brand.list();
      setBrands(brandsData);
    } catch (error) {
      console.error("Error loading brands:", error);
    }
  };

  const getBrandName = (brandId) => {
    const brand = brands.find(s => s.id === brandId);
    return brand?.name || 'Unknown Brand';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'MMM dd, yyyy') : '-';
    } catch (error) {
      return '-';
    }
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const orderDate = new Date(po.order_date);
    return orderDate >= new Date(dateFrom) && orderDate <= new Date(dateTo);
  });

  const filteredGRNs = goodsReceipts.filter(grn => {
    const receiptDate = new Date(grn.receipt_date);
    return receiptDate >= new Date(dateFrom) && receiptDate <= new Date(dateTo);
  });

  const exportData = () => {
    const data = [];
    
    // Header - Removed AED column
    data.push({
      'Type': 'TYPE',
      'Document Number': 'DOCUMENT NUMBER',
      'Date': 'DATE',
      'Brand/Supplier': 'BRAND/SUPPLIER',
      'Currency': 'CURRENCY',
      'Total Amount': 'TOTAL AMOUNT',
      'Status': 'STATUS'
    });

    // Add PO data - Removed AED references
    filteredPOs.forEach(po => {
      data.push({
        'Type': 'Purchase Order',
        'Document Number': po.po_number,
        'Date': formatDate(po.order_date),
        'Brand/Supplier': getBrandName(po.supplier_id),
        'Currency': po.currency,
        'Total Amount': (po.total_amount || 0).toFixed(2),
        'Status': po.status
      });
    });

    // Add GRN data
    filteredGRNs.forEach(grn => {
      data.push({
        'Type': 'Goods Receipt',
        'Document Number': grn.grn_number,
        'Date': formatDate(grn.receipt_date),
        'Brand/Supplier': getBrandName(grn.supplier_id),
        'Currency': '-',
        'Total Amount': '-',
        'Status': 'Received'
      });
    });

    exportToCsv(data, `PO_GRN_Report_${dateFrom}_to_${dateTo}`);
  };

  const totals = {
    pos: filteredPOs.length,
    grns: filteredGRNs.length,
    totalValueOriginal: filteredPOs.reduce((sum, po) => sum + (po.total_amount || 0), 0)
    // Removed totalValueAED calculation
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Purchase Orders vs Goods Receipts</CardTitle>
            <p className="text-sm text-gray-500">Compare PO creation with actual goods receipts.</p>
          </div>
          {canExport && (
            <Button onClick={exportData} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Range Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {/* Summary Cards - Removed AED card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{totals.pos}</p>
                <p className="text-sm text-gray-600">Purchase Orders</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{totals.grns}</p>
                <p className="text-sm text-gray-600">Goods Receipts</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{totals.totalValueOriginal.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Total Value (Original Currency)</p>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders Table - Removed AED column */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders ({filteredPOs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Brand/Supplier</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{formatDate(po.order_date)}</TableCell>
                    <TableCell>{getBrandName(po.supplier_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{po.currency}</Badge>
                    </TableCell>
                    <TableCell>{(po.total_amount || 0).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={po.status === 'closed' ? 'default' : 'secondary'}>
                        {po.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Goods Receipts Table - unchanged */}
      <Card>
        <CardHeader>
          <CardTitle>Goods Receipts ({filteredGRNs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN Number</TableHead>
                  <TableHead>Receipt Date</TableHead>
                  <TableHead>Brand/Supplier</TableHead>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Received By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGRNs.map((grn) => {
                  const relatedPO = purchaseOrders.find(po => po.id === grn.purchase_order_id);
                  return (
                    <TableRow key={grn.id}>
                      <TableCell className="font-medium">{grn.grn_number}</TableCell>
                      <TableCell>{formatDate(grn.receipt_date)}</TableCell>
                      <TableCell>{getBrandName(grn.supplier_id)}</TableCell>
                      <TableCell>
                        {relatedPO ? (
                          <Badge variant="outline">{relatedPO.po_number}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{grn.received_by}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}