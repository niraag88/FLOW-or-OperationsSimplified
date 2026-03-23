
import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, BarChart2 } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { format } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const EXCLUDED_STATUSES = new Set(['cancelled']);

const fmt = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export default function SalesAgedInvoicesReport({ invoices, customers, canExport }) {
  const submittedInvoices = invoices.filter(inv => !EXCLUDED_STATUSES.has(inv.status));

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
        const totalAmount = Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
        const paidAmount = Number(inv.paidAmount || inv.paid_amount || 0);
        const outstanding = totalAmount - paidAmount;
        if (outstanding <= 0) return;

        const dateValue = inv.invoice_date || inv.invoiceDate;
        if (!dateValue) return;
        const dueDate = new Date(dateValue);
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
      const dateValue = inv.invoice_date || inv.invoiceDate;
      if (!dateValue) return;
      const month = format(new Date(dateValue), 'yyyy-MM');
      if (!sales[month]) sales[month] = { total: 0, paid: 0 };
      sales[month].total += Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
      const paidAmount = Number(inv.paidAmount || inv.paid_amount || 0);
      if (paidAmount > 0) sales[month].paid += paidAmount;
    });
    return Object.entries(sales).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [submittedInvoices]);

  const chartData = salesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMM yyyy'),
    totalInvoiced: values.total,
    totalPaid: values.paid,
    outstanding: values.total - values.paid
  })).reverse();

  const agingExportData = Object.entries(agingData).map(([bucket, values]) => ({
    aging_bucket: bucket,
    outstanding_amount: values.total.toFixed(2),
    invoice_count: values.count,
  }));

  const salesExportData = salesByMonth.map(([month, values]) => ({
    month: format(new Date(month + '-01'), 'MMMM yyyy'),
    total_invoiced: values.total.toFixed(2),
    total_paid: values.paid.toFixed(2),
    outstanding: (values.total - values.paid).toFixed(2)
  }));

  return (
    <div className="space-y-6">
      {/* Monthly Sales Summary */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Monthly Sales Summary
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Invoiced and paid amounts per month ({submittedInvoices.length} invoices).
            </p>
          </div>
          {canExport && (
            <ExportDropdown
              data={salesExportData}
              type="Monthly Sales Report"
              filename="monthly_sales_report"
              columns={{
                month: 'Month',
                total_invoiced: 'Total Invoiced (AED)',
                total_paid: 'Total Paid (AED)',
                outstanding: 'Outstanding (AED)'
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
                  <TableHead>Total Invoiced (AED)</TableHead>
                  <TableHead>Total Paid (AED)</TableHead>
                  <TableHead>Outstanding (AED)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesByMonth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">No invoice data found</TableCell>
                  </TableRow>
                ) : salesByMonth.map(([month, data]) => (
                  <TableRow key={month}>
                    <TableCell className="font-medium">{format(new Date(month + '-01'), 'MMMM yyyy')}</TableCell>
                    <TableCell>{fmt(data.total)}</TableCell>
                    <TableCell className="text-green-600">{fmt(data.paid)}</TableCell>
                    <TableCell className="text-amber-600">{fmt(data.total - data.paid)}</TableCell>
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
                <YAxis tickFormatter={(v) => `AED ${fmt(v)}`} />
                <Tooltip formatter={(value) => [`AED ${fmt(value)}`, '']} />
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
          {canExport && (
            <ExportDropdown
              data={agingExportData}
              type="Aged Invoices Report"
              filename="aged_invoices_report"
              columns={{
                aging_bucket: 'Aging Bucket',
                outstanding_amount: 'Outstanding Amount (AED)',
                invoice_count: 'Invoice Count'
              }}
            />
          )}
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
                    <TableCell className="font-semibold text-amber-700">AED {fmt(data.total)}</TableCell>
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
