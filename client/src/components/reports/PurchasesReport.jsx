import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart, BarChart2, Building2 } from "lucide-react";
import ExportDropdown from "../common/ExportDropdown";
import { format, startOfMonth, endOfMonth, startOfYear, subMonths, subYears } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { getRateToAed } from "@/utils/currency";

const fmt = (value) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

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

function SummaryTile({ label, value, sub, color }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </Card>
  );
}

export default function PurchasesReport({ purchaseOrders, suppliers, companySettings, canExport }) {
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const getSupplierName = (supplierId) => {
    const supplier = (suppliers || []).find(
      (s) => s.id === supplierId || s.id === Number(supplierId)
    );
    return supplier?.name || "Unknown Supplier";
  };

  const getFxRate = (po) => {
    const storedRate = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
    if (!isNaN(storedRate) && storedRate > 0) return storedRate;
    const currency = po.currency || "GBP";
    return getRateToAed(currency, companySettings);
  };

  const getAedAmount = (po) => {
    const amount = Number(po.totalAmount || po.total_amount || 0);
    const currency = po.currency || "GBP";
    return currency === "AED" ? amount : amount * getFxRate(po);
  };

  const filteredPOs = useMemo(() => {
    const bounds = getPeriodBounds(period, customFrom, customTo);
    if (!bounds) return purchaseOrders;
    return purchaseOrders.filter((po) => {
      const d = new Date(po.orderDate || po.order_date);
      return d >= bounds.from && d <= bounds.to;
    });
  }, [purchaseOrders, period, customFrom, customTo]);

  const summary = useMemo(() => {
    let totalAED = 0;
    let outstandingAED = 0;
    let paidAED = 0;
    filteredPOs.forEach((po) => {
      const aed = getAedAmount(po);
      totalAED += aed;
      const ps = (po.paymentStatus || po.payment_status || "outstanding").toLowerCase();
      if (ps === "paid") paidAED += aed;
      else outstandingAED += aed;
    });
    return { totalOrders: filteredPOs.length, totalAED, outstandingAED, paidAED };
  }, [filteredPOs, companySettings]);

  const purchasesByMonth = useMemo(() => {
    const purchases = {};
    filteredPOs.forEach((po) => {
      const dateValue = po.orderDate || po.order_date;
      if (!dateValue) return;
      const d = new Date(dateValue);
      if (isNaN(d.getTime())) return;
      const month = format(d, "yyyy-MM");
      if (!purchases[month]) purchases[month] = { totalAED: 0, count: 0 };
      purchases[month].totalAED += getAedAmount(po);
      purchases[month].count += 1;
    });
    return Object.entries(purchases).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  }, [filteredPOs, companySettings]);

  const chartData = purchasesByMonth
    .map(([month, values]) => ({
      month: format(new Date(month + "-01"), "MMM yy"),
      totalAED: values.totalAED,
      count: values.count,
    }))
    .reverse();

  const topSuppliers = useMemo(() => {
    const supplierTotals = {};
    filteredPOs.forEach((po) => {
      const suppId = po.supplierId || po.supplier_id;
      const name = getSupplierName(suppId);
      const aed = getAedAmount(po);
      if (!supplierTotals[name]) supplierTotals[name] = 0;
      supplierTotals[name] += aed;
    });
    return Object.entries(supplierTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, total]) => ({ name, total }));
  }, [filteredPOs, suppliers, companySettings]);

  const currencyBreakdown = useMemo(() => {
    const byCurrency = {};
    filteredPOs.forEach((po) => {
      const cur = po.currency || "GBP";
      const aed = getAedAmount(po);
      if (!byCurrency[cur]) byCurrency[cur] = 0;
      byCurrency[cur] += aed;
    });
    return Object.entries(byCurrency).sort(([, a], [, b]) => b - a);
  }, [filteredPOs, companySettings]);

  const exportData = purchasesByMonth.map(([month, values]) => ({
    month: format(new Date(month + "-01"), "MMMM yyyy"),
    total_orders: values.count,
    total_aed: values.totalAED.toFixed(2),
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
          {filteredPOs.length} purchase orders — {periodLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryTile
          label="Total Purchase Orders"
          value={filteredPOs.length.toString()}
          color="text-blue-700"
        />
        <SummaryTile
          label="Total Spend (AED)"
          value={`AED ${fmt(summary.totalAED)}`}
          color="text-purple-700"
        />
        <SummaryTile
          label="Outstanding Payables (AED)"
          value={`AED ${fmt(summary.outstandingAED)}`}
          sub={`Paid: AED ${fmt(summary.paidAED)}`}
          color="text-amber-700"
        />
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Monthly Purchases Summary
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Purchase orders by month — converted to AED at stored FX rate — {periodLabel}
            </p>
          </div>
          {canExport && (
            <ExportDropdown
              data={exportData}
              type="Monthly Purchases Report"
              filename="monthly_purchases_report"
              columns={{
                month: "Month",
                total_orders: "Total Orders",
                total_aed: "Total (AED)",
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
                    <TableCell colSpan={3} className="text-center py-8 text-gray-500">
                      No purchase order data for this period
                    </TableCell>
                  </TableRow>
                ) : (
                  purchasesByMonth.map(([month, data]) => (
                    <TableRow key={month}>
                      <TableCell className="font-medium">
                        {format(new Date(month + "-01"), "MMMM yyyy")}
                      </TableCell>
                      <TableCell>{data.count}</TableCell>
                      <TableCell className="font-semibold">AED {fmt(data.totalAED)}</TableCell>
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
            Monthly Purchases Overview
          </CardTitle>
          <p className="text-sm text-gray-500">Visual representation of monthly purchase spend</p>
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
                    name === "count" ? value : `AED ${fmt(value)}`,
                    name === "totalAED" ? "Total (AED)" : "Order Count",
                  ]}
                />
                <Bar dataKey="totalAED" fill="#8b5cf6" name="totalAED" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Top 10 Suppliers by Spend
            </CardTitle>
            <p className="text-sm text-gray-500">— {periodLabel}</p>
          </CardHeader>
          <CardContent>
            {topSuppliers.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No data for this period</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topSuppliers} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `AED ${fmt(v)}`}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`AED ${fmt(v)}`, "Spend"]} />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Spend by Currency
            </CardTitle>
            <p className="text-sm text-gray-500">All amounts converted to AED — {periodLabel}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {currencyBreakdown.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No data for this period</p>
              ) : (
                currencyBreakdown.map(([currency, aedTotal]) => {
                  const totalAed = summary.totalAED;
                  const pct = totalAed > 0 ? (aedTotal / totalAed) * 100 : 0;
                  const COLORS = {
                    GBP: "bg-blue-500",
                    USD: "bg-green-500",
                    INR: "bg-orange-500",
                    AED: "bg-purple-500",
                  };
                  const barColor = COLORS[currency] || "bg-gray-400";
                  return (
                    <div key={currency}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{currency}</span>
                        <span className="text-sm font-semibold text-gray-900">
                          AED {fmt(aedTotal)}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div
                          className={`${barColor} h-2.5 rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{pct.toFixed(1)}% of total spend</p>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
