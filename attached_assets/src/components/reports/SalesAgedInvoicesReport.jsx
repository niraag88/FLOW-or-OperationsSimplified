
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download, FileText, BarChart2 } from "lucide-react";
import { exportToCsv } from "../utils/export";
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function SalesAgedInvoicesReport({ invoices, customers, canExport }) {
  // Only include submitted invoices for sales reporting
  const submittedInvoices = invoices.filter(inv => inv.status === 'submitted');

  const agingData = useMemo(() => {
    const buckets = {
      current: { total: 0, count: 0 },
      '0-30': { total: 0, count: 0 },
      '31-60': { total: 0, count: 0 },
      '61-90': { total: 0, count: 0 },
      '90+': { total: 0, count: 0 },
    };

    const today = new Date();
    submittedInvoices
      .filter(inv => inv.status !== 'cancelled')
      .forEach(inv => {
        const outstanding = (inv.total_amount || 0) - (inv.paid_amount || 0);
        if (outstanding <= 0) return;

        const dueDate = new Date(inv.invoice_date);
        // Add 30 days to invoice date for due date calculation
        dueDate.setDate(dueDate.getDate() + 30);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        
        let bucketKey = 'current';
        if (daysOverdue > 90) bucketKey = '90+';
        else if (daysOverdue > 60) bucketKey = '61-90';
        else if (daysOverdue > 30) bucketKey = '31-60';
        else if (daysOverdue > 0) bucketKey = '0-30';
        
        buckets[bucketKey].total += outstanding;
        buckets[bucketKey].count += 1;
      });

    return buckets;
  }, [submittedInvoices]);
  
  const salesByMonth = useMemo(() => {
    const sales = {};
    submittedInvoices.forEach(inv => {
      const month = format(new Date(inv.invoice_date), 'yyyy-MM');
      if (!sales[month]) {
        sales[month] = { total: 0, paid: 0 };
      }
      sales[month].total += inv.total_amount || 0;
      if (inv.paid_amount > 0) {
        sales[month].paid += inv.paid_amount || 0;
      }
    });
    return Object.entries(sales).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [submittedInvoices]);

  // Prepare chart data
  const chartData = salesByMonth.map(([month, values]) => ({
    month: format(new Date(month), 'MMM yyyy'),
    totalInvoiced: values.total,
    totalPaid: values.paid,
    outstanding: values.total - values.paid
  })).reverse(); // Show chronologically

  const handleAgingExport = () => {
    const data = Object.entries(agingData).map(([bucket, values]) => ({
      'Aging Bucket': bucket,
      'Outstanding Amount (AED)': values.total.toFixed(2),
      'Invoice Count': values.count,
    }));
    exportToCsv(data, "aged_invoices_report");
  };
  
  const handleSalesExport = () => {
    const data = salesByMonth.map(([month, values]) => ({
        'Month': format(new Date(month), 'MMMM yyyy'),
        'Total Invoiced (AED)': values.total.toFixed(2),
        'Total Paid (AED)': values.paid.toFixed(2),
        'Outstanding (AED)': (values.total - values.paid).toFixed(2)
    }));
    exportToCsv(data, "monthly_sales_report");
  };

  return (
    <div className="space-y-6">
      {/* Monthly Sales Summary */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
            <div>
                <CardTitle className="flex items-center gap-2">
                    <BarChart2 className="w-5 h-5" />
                    Monthly Sales Summary (Submitted Invoices Only)
                </CardTitle>
                <p className="text-sm text-gray-500 mt-1">Total invoiced and paid amounts per month.</p>
            </div>
            {canExport && <Button onClick={handleSalesExport} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Export CSV</Button>}
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead>Total Invoiced (AED)</TableHead>
                            <TableHead>Total Paid (AED)</TableHead>
                            <TableHead>Outstanding (AED)</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {salesByMonth.map(([month, data]) => (
                            <TableRow key={month}>
                                <TableCell className="font-medium">{format(new Date(month), 'MMMM yyyy')}</TableCell>
                                <TableCell>{data.total.toFixed(2)}</TableCell>
                                <TableCell className="text-green-600">{data.paid.toFixed(2)}</TableCell>
                                <TableCell className="text-amber-600">{(data.total - data.paid).toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
      
      {/* Sales Chart */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            Monthly Sales Overview
          </CardTitle>
          <p className="text-sm text-gray-500">Visual representation of monthly sales performance</p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`AED ${value.toFixed(2)}`, '']} />
                <Bar dataKey="totalInvoiced" fill="#3b82f6" name="Total Invoiced" />
                <Bar dataKey="totalPaid" fill="#10b981" name="Total Paid" />
                <Bar dataKey="outstanding" fill="#f59e0b" name="Outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Aged Invoices */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Aged Invoices
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Outstanding amounts by aging buckets.</p>
          </div>
          {canExport && <Button onClick={handleAgingExport} variant="outline" size="sm"><Download className="w-4 h-4 mr-2" />Export CSV</Button>}
        </CardHeader>
        <CardContent>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Bucket</TableHead>
                        <TableHead>Outstanding (AED)</TableHead>
                        <TableHead># Invoices</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {Object.entries(agingData).map(([bucket, data]) => (
                        <TableRow key={bucket}>
                        <TableCell className="font-medium">{bucket}</TableCell>
                        <TableCell className="font-semibold text-amber-700">{data.total.toFixed(2)}</TableCell>
                        <TableCell>{data.count}</TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
