import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { format, startOfMonth, endOfMonth, isValid, parseISO } from "date-fns";
import ExportDropdown from "../common/ExportDropdown";
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
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      return '-';
    }
  };

  const filteredPOs = purchaseOrders.filter(po => {
    const dateValue = po.orderDate || po.order_date;
    if (!dateValue) return false;
    const orderDate = new Date(dateValue);
    return orderDate >= new Date(dateFrom) && orderDate <= new Date(dateTo);
  });

  const filteredGRNs = goodsReceipts.filter(grn => {
    const dateValue = grn.receiptDate || grn.receipt_date;
    if (!dateValue) return false;
    const receiptDate = new Date(dateValue);
    return receiptDate >= new Date(dateFrom) && receiptDate <= new Date(dateTo);
  });

  // Prepare data for standardized export format
  const exportData = [
    // Add PO data
    ...filteredPOs.map(po => ({
      type: 'Purchase Order',
      document_number: po.poNumber || po.po_number,
      date: formatDate(po.orderDate || po.order_date),
      brand_supplier: getBrandName(po.supplierId || po.supplier_id),
      currency: po.currency,
      total_amount: (po.totalAmount || po.total_amount || 0).toFixed(2),
      status: po.status
    })),
    // Add GRN data
    ...filteredGRNs.map(grn => ({
      type: 'Goods Receipt',
      document_number: grn.grnNumber || grn.grn_number,
      date: formatDate(grn.receiptDate || grn.receipt_date),
      brand_supplier: getBrandName(grn.supplierId || grn.supplier_id),
      currency: '-',
      total_amount: '-',
      status: 'Received'
    }))
  ];

  const totals = {
    pos: filteredPOs.length,
    grns: filteredGRNs.length,
    totalValueOriginal: filteredPOs.reduce((sum, po) => sum + (po.totalAmount || po.total_amount || 0), 0)
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
            <ExportDropdown 
              data={exportData}
              type="PO vs GRN Report"
              filename={`PO_GRN_Report_${dateFrom}_to_${dateTo}`}
              columns={{
                type: 'Type',
                document_number: 'Document Number',
                date: 'Date',
                brand_supplier: 'Brand/Supplier',
                currency: 'Currency',
                total_amount: 'Total Amount',
                status: 'Status'
              }}
            />
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
                    <TableCell className="font-medium">{po.poNumber || po.po_number}</TableCell>
                    <TableCell>{formatDate(po.orderDate || po.order_date)}</TableCell>
                    <TableCell>{getBrandName(po.supplierId || po.supplier_id)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{po.currency}</Badge>
                    </TableCell>
                    <TableCell>{(po.totalAmount || po.total_amount || 0).toFixed(2)}</TableCell>
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
                      <TableCell className="font-medium">{grn.grnNumber || grn.grn_number}</TableCell>
                      <TableCell>{formatDate(grn.receiptDate || grn.receipt_date)}</TableCell>
                      <TableCell>{getBrandName(grn.supplierId || grn.supplier_id)}</TableCell>
                      <TableCell>
                        {relatedPO ? (
                          <Badge variant="outline">{relatedPO.poNumber || relatedPO.po_number}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{grn.receivedBy || grn.received_by}</TableCell>
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