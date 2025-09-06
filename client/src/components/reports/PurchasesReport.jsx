
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, BarChart2 } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PurchasesReport({ purchaseOrders, suppliers, canExport }) {
  // Include all purchase orders regardless of status
  const allPurchaseOrders = purchaseOrders;

  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    return supplier?.name || 'Unknown Supplier';
  };

  const purchasesByMonth = useMemo(() => {
    const purchases = {};
    allPurchaseOrders.forEach(po => {
      // Handle potential date field variations and null values
      const dateValue = po.orderDate || po.order_date;
      if (!dateValue) return; // Skip if no date
      
      try {
        const month = format(new Date(dateValue), 'yyyy-MM');
      if (!purchases[month]) {
        purchases[month] = { 
          total: 0, 
          totalAED: 0,
          count: 0,
          gbpAmount: 0,
          aedAmount: 0
        };
      }
      
      const amount = po.totalAmount || po.total_amount || 0;
      purchases[month].total += amount;
      purchases[month].count += 1;
      
      if (po.currency === 'GBP') {
        purchases[month].gbpAmount += amount;
        purchases[month].totalAED += amount * (po.fxRateToAed || po.fx_rate_to_aed || 4.85);
      } else {
        purchases[month].aedAmount += amount;
        purchases[month].totalAED += amount;
      }
      } catch (error) {
        console.warn('Invalid date in purchase order:', po.poNumber || po.po_number, dateValue);
        return; // Skip this PO if date is invalid
      }
    });
    return Object.entries(purchases).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [allPurchaseOrders]);

  // Prepare chart data
  const chartData = purchasesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMM yyyy'),
    totalAED: values.totalAED,
    gbpAmount: values.gbpAmount * 4.85, // Convert to AED for chart
    aedAmount: values.aedAmount,
    count: values.count
  })).reverse(); // Show chronologically

  // Prepare data for export in standard internal document format
  const exportData = purchasesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMMM yyyy'),
    total_orders: values.count,
    total_gbp: values.gbpAmount.toFixed(2),
    total_aed: values.totalAED.toFixed(2)
  }));

  // Calculate totals
  const totals = allPurchaseOrders.reduce((acc, po) => {
    acc.totalOrders += 1;
    const amount = po.totalAmount || po.total_amount || 0;
    if (po.currency === 'GBP') {
      acc.totalGBP += amount;
      acc.totalAED += amount * (po.fxRateToAed || po.fx_rate_to_aed || 4.85);
    } else {
      acc.totalAED += amount;
    }
    return acc;
  }, { totalOrders: 0, totalGBP: 0, totalAED: 0 });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{totals.totalOrders}</p>
            <p className="text-sm text-gray-600">Total Purchase Orders</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{totals.totalGBP.toFixed(2)} GBP</p>
            <p className="text-sm text-gray-600">Total in GBP</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{totals.totalAED.toFixed(2)} AED</p>
            <p className="text-sm text-gray-600">Total Value (AED)</p>
          </div>
        </Card>
      </div>

      {/* Monthly Purchases Table */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Monthly Purchases Summary (All Purchase Orders)
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Purchase orders breakdown by month and currency.</p>
          </div>
          {canExport && (
            <ExportDropdown 
              data={exportData}
              type="Monthly Purchases Report"
              filename="monthly_purchases_report"
              columns={{
                month: 'Month',
                total_orders: 'Total Orders',
                total_gbp: 'Total (GBP)',
                total_aed: 'Total (AED)'
              }}
            />
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Orders</TableHead>
                  <TableHead>Total (GBP)</TableHead>
                  <TableHead>Total (AED)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesByMonth.map(([month, data]) => (
                  <TableRow key={month}>
                    <TableCell className="font-medium">
                      {format(new Date(month + '-01'), 'MMMM yyyy')}
                    </TableCell>
                    <TableCell>{data.count}</TableCell>
                    <TableCell className="text-blue-600">{data.gbpAmount.toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">{data.totalAED.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Purchases Chart */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            Monthly Purchases Overview
          </CardTitle>
          <p className="text-sm text-gray-500">Visual representation of monthly purchase orders</p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value, name) => [
                  name === 'count' ? value : `AED ${value.toFixed(2)}`,
                  name === 'totalAED' ? 'Total (AED)' : 
                  name === 'count' ? 'Order Count' : name
                ]} />
                <Bar dataKey="totalAED" fill="#8b5cf6" name="Total Value (AED)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
