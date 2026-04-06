import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";
import { getRateToAed } from "@/utils/currency";

const fmt = (v) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function KpiTile({ icon: Icon, iconBg, label, value, sub, valueColor }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl ${iconBg} flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500 mb-0.5">{label}</p>
          <p className={`text-xl font-bold truncate ${valueColor}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function OverviewReport({ invoices, purchaseOrders, companySettings }) {
  const getFxRate = (po) => {
    const stored = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
    if (!isNaN(stored) && stored > 0) return stored;
    return getRateToAed(po.currency || "GBP", companySettings);
  };

  const kpis = useMemo(() => {
    const activeInvoices = invoices.filter(
      (inv) => !["cancelled", "draft"].includes((inv.status || "").toLowerCase())
    );

    const totalRevenue = activeInvoices.reduce(
      (sum, inv) => sum + Number(inv.total_amount || inv.totalAmount || inv.amount || 0),
      0
    );

    const totalOutstanding = activeInvoices
      .filter((inv) => {
        const ps = (inv.paymentStatus || inv.payment_status || "outstanding").toLowerCase();
        const st = (inv.status || "").toLowerCase();
        return ps !== "paid" && st !== "delivered";
      })
      .reduce(
        (sum, inv) => sum + Number(inv.total_amount || inv.totalAmount || inv.amount || 0),
        0
      );

    const totalPurchases = purchaseOrders.reduce((sum, po) => {
      const amt = Number(po.totalAmount || po.total_amount || 0);
      const cur = po.currency || "GBP";
      return sum + (cur === "AED" ? amt : amt * getFxRate(po));
    }, 0);

    const grossMargin =
      totalRevenue > 0
        ? ((totalRevenue - totalPurchases) / totalRevenue) * 100
        : 0;

    return { totalRevenue, totalPurchases, grossMargin, totalOutstanding };
  }, [invoices, purchaseOrders, companySettings]);

  const chartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), 11 - i);
      return format(startOfMonth(d), "yyyy-MM");
    });

    const salesMap = {};
    invoices
      .filter((inv) => !["cancelled", "draft"].includes((inv.status || "").toLowerCase()))
      .forEach((inv) => {
        const dateVal = inv.invoice_date || inv.invoiceDate;
        if (!dateVal) return;
        const d = new Date(dateVal);
        if (isNaN(d.getTime())) return;
        const m = format(d, "yyyy-MM");
        if (!salesMap[m]) salesMap[m] = 0;
        salesMap[m] += Number(inv.total_amount || inv.totalAmount || inv.amount || 0);
      });

    const purchasesMap = {};
    purchaseOrders.forEach((po) => {
      const dateVal = po.orderDate || po.order_date;
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return;
      const m = format(d, "yyyy-MM");
      if (!purchasesMap[m]) purchasesMap[m] = 0;
      const amt = Number(po.totalAmount || po.total_amount || 0);
      const cur = po.currency || "GBP";
      purchasesMap[m] += cur === "AED" ? amt : amt * getFxRate(po);
    });

    return months.map((m) => ({
      month: format(new Date(m + "-01"), "MMM yy"),
      sales: salesMap[m] || 0,
      purchases: purchasesMap[m] || 0,
    }));
  }, [invoices, purchaseOrders, companySettings]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          icon={TrendingUp}
          iconBg="bg-blue-50 text-blue-600"
          label="Total Revenue (AED)"
          value={`AED ${fmt(kpis.totalRevenue)}`}
          sub={`${invoices.filter(i => !["cancelled","draft"].includes((i.status||"").toLowerCase())).length} invoices`}
          valueColor="text-blue-700"
        />
        <KpiTile
          icon={TrendingDown}
          iconBg="bg-purple-50 text-purple-600"
          label="Total Purchases (AED)"
          value={`AED ${fmt(kpis.totalPurchases)}`}
          sub={`${purchaseOrders.length} purchase orders`}
          valueColor="text-purple-700"
        />
        <KpiTile
          icon={DollarSign}
          iconBg={kpis.grossMargin >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}
          label="Gross Margin"
          value={`${kpis.grossMargin.toFixed(1)}%`}
          sub="Revenue minus purchase cost"
          valueColor={kpis.grossMargin >= 0 ? "text-green-700" : "text-red-700"}
        />
        <KpiTile
          icon={AlertCircle}
          iconBg="bg-amber-50 text-amber-600"
          label="Outstanding Receivables"
          value={`AED ${fmt(kpis.totalOutstanding)}`}
          sub="Unpaid / not yet delivered invoices"
          valueColor="text-amber-700"
        />
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Sales vs Purchases — Last 12 Months</CardTitle>
          <p className="text-sm text-gray-500">
            Monthly revenue (invoiced) compared to purchase order spend (AED)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `AED ${fmt(v)}`} tick={{ fontSize: 11 }} width={110} />
                <Tooltip
                  formatter={(value, name) => [
                    `AED ${fmt(value)}`,
                    name === "sales" ? "Sales (Invoiced)" : "Purchases",
                  ]}
                />
                <Legend formatter={(v) => (v === "sales" ? "Sales (Invoiced)" : "Purchases")} />
                <Bar dataKey="sales" fill="#3b82f6" name="sales" radius={[2, 2, 0, 0]} />
                <Bar dataKey="purchases" fill="#8b5cf6" name="purchases" radius={[2, 2, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
