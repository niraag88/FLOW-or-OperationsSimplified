import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, BarChart2, TrendingUp, Globe, Users } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { format, startOfMonth, endOfMonth, startOfYear, subMonths, subYears } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const EXCLUDED_STATUSES = new Set(["cancelled"]);

const fmt = (value) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function isLocalCustomer(customer) {
  if (!customer) return true;
  const vat = (customer.vatTreatment || '').toLowerCase();
  return vat !== 'international';
}

function getPeriodBounds(period, customFrom, customTo) {
  const now = new Date();
  if (period === "this_month") return { from: startOfMonth(now), to: endOfMonth(now) };
  if (period === "last_3") return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
  if (period === "last_6") return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
  if (period === "this_year") return { from: startOfYear(now), to: now };
  if (period === "last_year") {
    const ly = subYears(now, 1);
    return { from: startOfYear(ly), to: new Date(ly.getFullYear(), 11, 31, 23, 59, 59) };
  }
  if (period === "custom") {
    if (!customFrom || !customTo) return null;
    return { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") };
  }
  return null;
}

function SummaryTile({ label, value, color }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  );
}

export default function SalesAgedInvoicesReport({ invoices, customers, canExport }) {
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const activeInvoices = useMemo(
    () => invoices.filter((inv) => !EXCLUDED_STATUSES.has(inv.status)),
    [invoices]
  );

  const filteredInvoices = useMemo(() => {
    const bounds = getPeriodBounds(period, customFrom, customTo);
    if (!bounds) return activeInvoices;
    return activeInvoices.filter((inv) => {
      const d = new Date(inv.invoice_date || inv.invoiceDate);
      return d >= bounds.from && d <= bounds.to;
    });
  }, [activeInvoices, period, customFrom, customTo]);

  const isSettled = (inv) => {
    const ps = (inv.paymentStatus || inv.payment_status || "").toLowerCase();
    const st = (inv.status || "").toLowerCase();
    return ps === "paid" || st === "delivered";
  };

  const summary = useMemo(() => {
    const totalInvoiced = filteredInvoices.reduce(
      (sum, inv) => sum + Number(inv.total_amount || inv.totalAmount || inv.amount || 0),
      0
    );
    const totalCollected = filteredInvoices
      .filter(isSettled)
      .reduce(
        (sum, inv) => sum + Number(inv.total_amount || inv.totalAmount || inv.amount || 0),
        0
      );
    return { totalInvoiced, totalCollected, outstanding: totalInvoiced - totalCollected };
  }, [filteredInvoices]);

  const agingData = useMemo(() => {
    const buckets = {
      current: { total: 0, count: 0 },
      "0-30": { total: 0, count: 0 },
      "31-60": { total: 0, count: 0 },
      "61-90": { total: 0, count: 0 },
      "90+": { total: 0, count: 0 },
    };
    const today = new Date();
    filteredInvoices
      .filter((inv) => !isSettled(inv))
      .forEach((inv) => {
        const totalAmount = Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
        if (totalAmount <= 0) return;
        const dateValue = inv.invoice_date || inv.invoiceDate;
        if (!dateValue) return;
        const dueDate = new Date(dateValue);
        dueDate.setDate(dueDate.getDate() + 30);
        const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
        let bucketKey = "current";
        if (daysOverdue > 90) bucketKey = "90+";
        else if (daysOverdue > 60) bucketKey = "61-90";
        else if (daysOverdue > 30) bucketKey = "31-60";
        else if (daysOverdue > 0) bucketKey = "0-30";
        buckets[bucketKey].total += totalAmount;
        buckets[bucketKey].count += 1;
      });
    return buckets;
  }, [filteredInvoices]);

  const salesByMonth = useMemo(() => {
    const sales = {};
    filteredInvoices.forEach((inv) => {
      const dateValue = inv.invoice_date || inv.invoiceDate;
      if (!dateValue) return;
      const month = format(new Date(dateValue), "yyyy-MM");
      if (!sales[month]) sales[month] = { total: 0, collected: 0 };
      const total = Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
      sales[month].total += total;
      if (isSettled(inv)) sales[month].collected += total;
    });
    return Object.entries(sales).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [filteredInvoices]);

  const chartData = salesByMonth
    .map(([month, values]) => ({
      month: format(new Date(month + "-01"), "MMM yy"),
      totalInvoiced: values.total,
      collected: values.collected,
      outstanding: values.total - values.collected,
    }))
    .reverse();

  const topCustomers = useMemo(() => {
    const customerTotals = {};
    filteredInvoices.forEach((inv) => {
      const name =
        inv.customer_name ||
        inv.customerName ||
        customers.find((c) => c.id === (inv.customer_id ?? inv.customerId))?.name ||
        "Unknown";
      const total = Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
      if (!customerTotals[name]) customerTotals[name] = 0;
      customerTotals[name] += total;
    });
    return Object.entries(customerTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, total]) => ({ name, total }));
  }, [filteredInvoices, customers]);

  const regionSplit = useMemo(() => {
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    let local = 0;
    let international = 0;
    filteredInvoices.forEach((inv) => {
      const total = Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
      const custId = inv.customer_id ?? inv.customerId;
      const customer = customerMap.get(custId);
      if (isLocalCustomer(customer)) local += total;
      else international += total;
    });
    return { local, international, total: local + international };
  }, [filteredInvoices, customers]);

  const agingExportData = Object.entries(agingData).map(([bucket, values]) => ({
    aging_bucket: bucket,
    outstanding_amount: values.total.toFixed(2),
    invoice_count: values.count,
  }));

  const salesExportData = salesByMonth.map(([month, values]) => ({
    month: format(new Date(month + "-01"), "MMMM yyyy"),
    total_invoiced: values.total.toFixed(2),
    total_collected: values.collected.toFixed(2),
    outstanding: (values.total - values.collected).toFixed(2),
  }));

  const periodLabel =
    period === "all"
      ? "All Time"
      : period === "this_month"
      ? "This Month"
      : period === "last_3"
      ? "Last 3 Months"
      : period === "last_6"
      ? "Last 6 Months"
      : period === "this_year"
      ? "This Year"
      : period === "last_year"
      ? "Last Year"
      : customFrom && customTo
      ? `${customFrom} to ${customTo}`
      : "Custom Range";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-600">Period:</span>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_3">Last 3 Months</SelectItem>
            <SelectItem value="last_6">Last 6 Months</SelectItem>
            <SelectItem value="this_year">This Year</SelectItem>
            <SelectItem value="last_year">Last Year</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">From</label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 whitespace-nowrap">To</label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-40"
              />
            </div>
          </>
        )}
        <span className="text-sm text-gray-500">
          {filteredInvoices.length} invoices — {periodLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryTile
          label="Total Invoiced (AED)"
          value={`AED ${fmt(summary.totalInvoiced)}`}
          color="text-blue-700"
        />
        <SummaryTile
          label="Collected (AED)"
          value={`AED ${fmt(summary.totalCollected)}`}
          color="text-green-700"
        />
        <SummaryTile
          label="Outstanding (AED)"
          value={`AED ${fmt(summary.outstanding)}`}
          color="text-amber-700"
        />
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5" />
              Monthly Sales Summary
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Invoiced and collected amounts — {periodLabel}
            </p>
          </div>
          {canExport && (
            <ExportDropdown
              data={salesExportData}
              type="Monthly Sales Report"
              filename="monthly_sales_report"
              columns={{
                month: "Month",
                total_invoiced: "Total Invoiced (AED)",
                total_collected: "Total Collected (AED)",
                outstanding: "Outstanding (AED)",
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
                  <TableHead>Collected (AED)</TableHead>
                  <TableHead>Outstanding (AED)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesByMonth.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                      No invoice data for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  salesByMonth.map(([month, data]) => (
                    <TableRow key={month}>
                      <TableCell className="font-medium">
                        {format(new Date(month + "-01"), "MMMM yyyy")}
                      </TableCell>
                      <TableCell>{fmt(data.total)}</TableCell>
                      <TableCell className="text-green-600">{fmt(data.collected)}</TableCell>
                      <TableCell className="text-amber-600">
                        {fmt(data.total - data.collected)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5" />
            Monthly Sales Overview
          </CardTitle>
          <p className="text-sm text-gray-500">Visual breakdown of invoiced vs collected by month</p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `AED ${fmt(v)}`} tick={{ fontSize: 11 }} width={110} />
                <Tooltip
                  formatter={(value, name) => [
                    `AED ${fmt(value)}`,
                    name === "totalInvoiced"
                      ? "Total Invoiced"
                      : name === "collected"
                      ? "Collected"
                      : "Outstanding",
                  ]}
                />
                <Legend />
                <Bar dataKey="totalInvoiced" fill="#3b82f6" name="totalInvoiced" radius={[2, 2, 0, 0]} />
                <Bar dataKey="collected" fill="#10b981" name="collected" radius={[2, 2, 0, 0]} />
                <Bar dataKey="outstanding" fill="#f59e0b" name="outstanding" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Top 10 Customers by Revenue
            </CardTitle>
            <p className="text-sm text-gray-500">— {periodLabel}</p>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No data for this period</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCustomers} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `AED ${fmt(v)}`}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={130}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(v) => [`AED ${fmt(v)}`, "Revenue"]}
                    />
                    <Bar dataKey="total" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Local vs International Revenue
            </CardTitle>
            <p className="text-sm text-gray-500">
              Based on customer VAT treatment — {periodLabel}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-5 pt-2">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">Local</span>
                  <span className="text-sm font-semibold text-blue-700">
                    AED {fmt(regionSplit.local)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all"
                    style={{
                      width:
                        regionSplit.total > 0
                          ? `${(regionSplit.local / regionSplit.total) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {regionSplit.total > 0
                    ? `${((regionSplit.local / regionSplit.total) * 100).toFixed(1)}% of total`
                    : "—"}
                </p>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">International</span>
                  <span className="text-sm font-semibold text-purple-700">
                    AED {fmt(regionSplit.international)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className="bg-purple-500 h-3 rounded-full transition-all"
                    style={{
                      width:
                        regionSplit.total > 0
                          ? `${(regionSplit.international / regionSplit.total) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {regionSplit.total > 0
                    ? `${((regionSplit.international / regionSplit.total) * 100).toFixed(1)}% of total`
                    : "—"}
                </p>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700">Total</span>
                  <span className="text-sm font-bold text-gray-900">
                    AED {fmt(regionSplit.total)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Aged Invoices (Outstanding Only)
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Invoices not paid and not yet delivered, grouped by days overdue (30-day terms).
            </p>
          </div>
          {canExport && (
            <ExportDropdown
              data={agingExportData}
              type="Aged Invoices Report"
              filename="aged_invoices_report"
              columns={{
                aging_bucket: "Aging Bucket",
                outstanding_amount: "Outstanding Amount (AED)",
                invoice_count: "Invoice Count",
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
                    <TableCell className="font-semibold text-amber-700">
                      AED {fmt(data.total)}
                    </TableCell>
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
