
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, BarChart2 } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getRateToAed } from "@/utils/currency";

const fmt = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function PurchasesReport({ purchaseOrders, suppliers, companySettings, canExport }) {
  const allPurchaseOrders = purchaseOrders;

  const getSupplierName = (supplierId) => {
    const supplier = (suppliers || []).find(s => s.id === supplierId || s.id === Number(supplierId));
    return supplier?.name || 'Unknown Supplier';
  };

  const getFxRate = (po) => {
    const storedRate = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
    if (!isNaN(storedRate) && storedRate > 0) return storedRate;
    const currency = po.currency || 'GBP';
    return getRateToAed(currency, companySettings);
  };

  const purchasesByMonth = useMemo(() => {
    const purchases = {};
    allPurchaseOrders.forEach(po => {
      const dateValue = po.orderDate || po.order_date;
      if (!dateValue) return;
      try {
        const month = format(new Date(dateValue), 'yyyy-MM');
        if (!purchases[month]) {
          purchases[month] = { total: 0, totalAED: 0, count: 0, nonAedAmount: 0, aedAmount: 0 };
        }
        const amount = Number(po.totalAmount || po.total_amount || 0);
        const currency = po.currency || 'GBP';
        const rate = getFxRate(po);

        purchases[month].total += amount;
        purchases[month].count += 1;

        if (currency === 'AED') {
          purchases[month].aedAmount += amount;
          purchases[month].totalAED += amount;
        } else {
          purchases[month].nonAedAmount += amount;
          purchases[month].totalAED += amount * rate;
        }
      } catch (error) {
        console.warn('Invalid date in PO:', po.poNumber || po.po_number, dateValue);
      }
    });
    return Object.entries(purchases).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [allPurchaseOrders, companySettings]);

  const chartData = purchasesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMM yyyy'),
    totalAED: values.totalAED,
    count: values.count
  })).reverse();

  const exportData = purchasesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMMM yyyy'),
    total_orders: values.count,
    total_aed: values.totalAED.toFixed(2)
  }));

  const totals = allPurchaseOrders.reduce((acc, po) => {
    acc.totalOrders += 1;
    const amount = Number(po.totalAmount || po.total_amount || 0);
    const currency = po.currency || 'GBP';
    const rate = getFxRate(po);
    if (currency === 'AED') {
      acc.totalAED += amount;
    } else {
      acc.totalAED += amount * rate;
    }
    return acc;
  }, { totalOrders: 0, totalAED: 0 });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{totals.totalOrders}</p>
            <p className="text-sm text-gray-600">Total Purchase Orders</p>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">AED {fmt(totals.totalAED)}</p>
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
            <p className="text-sm text-gray-500 mt-1">Purchase orders breakdown by month — all amounts converted to AED at each PO's stored FX rate.</p>
          </div>
          {canExport && (
            <ExportDropdown
              data={exportData}
              type="Monthly Purchases Report"
              filename="monthly_purchases_report"
              columns={{
                month: 'Month',
                total_orders: 'Total Orders',
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
                  <TableHead>Total (AED)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesByMonth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500">No purchase order data found</TableCell>
                  </TableRow>
                ) : purchasesByMonth.map(([month, data]) => (
                  <TableRow key={month}>
                    <TableCell className="font-medium">{format(new Date(month + '-01'), 'MMMM yyyy')}</TableCell>
                    <TableCell>{data.count}</TableCell>
                    <TableCell className="font-semibold">AED {fmt(data.totalAED)}</TableCell>
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
                <YAxis tickFormatter={(v) => `AED ${fmt(v)}`} />
                <Tooltip formatter={(value, name) => [
                  name === 'count' ? value : `AED ${fmt(value)}`,
                  name === 'totalAED' ? 'Total (AED)' : name === 'count' ? 'Order Count' : name
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
