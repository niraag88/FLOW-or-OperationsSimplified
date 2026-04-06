import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Package,
  ShoppingCart,
  BarChart3,
  Wallet,
  LayoutDashboard
} from "lucide-react";

import OverviewReport from "../components/reports/OverviewReport";
import PoGrnReport from "../components/reports/PoGrnReport";
import SalesAgedInvoicesReport from "../components/reports/SalesAgedInvoicesReport";
import PurchasesReport from "../components/reports/PurchasesReport";
import VATReportTab from "../components/reports/VATReportTab";
import PaymentsLedger from "../components/reports/PaymentsLedger";
import StockOnHandReport from "../components/reports/StockOnHandReport";

function normalizeTaxTreatment(raw) {
  if (!raw) return 'StandardRated';
  const map = {
    standard: 'StandardRated',
    standardrated: 'StandardRated',
    zero_rated: 'ZeroRated',
    zerorated: 'ZeroRated',
    exempt: 'Exempt',
    out_of_scope: 'OutOfScope',
    outofscope: 'OutOfScope',
  };
  return map[raw.toLowerCase().replace(/-/g, '_')] || raw;
}

function normalizeInvoice(inv) {
  const amount = parseFloat(inv.amount || inv.total_amount || 0);
  const vatAmount = parseFloat(inv.vatAmount || inv.tax_amount || 0);
  const subtotal = amount - vatAmount;
  return {
    ...inv,
    status: (inv.status || '').toLowerCase(),
    invoice_number: inv.invoice_number || inv.invoiceNumber,
    invoice_date: inv.invoice_date || inv.invoiceDate,
    customer_id: inv.customer_id ?? inv.customerId,
    customer_name: inv.customer_name || inv.customerName,
    tax_treatment: normalizeTaxTreatment(inv.tax_treatment || inv.taxTreatment),
    subtotal,
    tax_amount: vatAmount,
    total_amount: amount,
  };
}

export default function Reports() {
  const [data, setData] = useState({
    products: [],
    lots: [],
    purchaseOrders: [],
    goodsReceipts: [],
    invoices: [],
    customers: [],
    suppliers: [],
    books: [],
    companySettings: null,
  });
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [dashboardRes, invoicesRes, booksRes] = await Promise.all([
        fetch('/api/dashboard', { credentials: 'include' }),
        fetch('/api/invoices', { credentials: 'include' }),
        fetch('/api/books', { credentials: 'include' }),
      ]);

      if (!dashboardRes.ok) throw new Error('Failed to fetch dashboard data');
      const dashboardData = await dashboardRes.json();

      let invoicesData = [];
      if (invoicesRes.ok) {
        const raw = await invoicesRes.json();
        const rawList = Array.isArray(raw) ? raw : (raw.data || []);
        invoicesData = rawList.map(normalizeInvoice);
      }

      const booksData = booksRes.ok ? await booksRes.json() : [];

      setData({
        products: dashboardData.products,
        lots: dashboardData.lots,
        purchaseOrders: dashboardData.purchaseOrders,
        goodsReceipts: dashboardData.goodsReceipts,
        invoices: invoicesData,
        customers: dashboardData.customers,
        suppliers: dashboardData.suppliers,
        books: Array.isArray(booksData) ? booksData : [],
        companySettings: dashboardData.companySettings,
      });
    } catch (error) {
      console.error("Error loading reporting data:", error);
    } finally {
      setLoading(false);
    }
  };

  const companySettings = data.companySettings;
  const canEdit = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Manager');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-12 w-full" />
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <Skeleton className="h-6 w-1/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Reports & Analytics
          </h1>
          <p className="text-gray-600">
            Analyze inventory, procurement, sales and VAT data.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex min-w-max w-full">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <LayoutDashboard className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="po_vs_grn" className="flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" />
              PO vs GRN
            </TabsTrigger>
            <TabsTrigger value="sales_and_aging" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Sales
            </TabsTrigger>
            <TabsTrigger value="purchases" className="flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" />
              Purchases
            </TabsTrigger>
            <TabsTrigger value="vat_report" className="flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              VAT Report
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-1.5">
              <Wallet className="w-4 h-4" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-1.5">
              <Package className="w-4 h-4" />
              Stock
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-6">
          <OverviewReport
            invoices={data.invoices}
            purchaseOrders={data.purchaseOrders}
            companySettings={companySettings}
          />
        </TabsContent>
        <TabsContent value="po_vs_grn" className="mt-6">
          <PoGrnReport
            purchaseOrders={data.purchaseOrders}
            goodsReceipts={data.goodsReceipts}
            suppliers={data.suppliers}
            companySettings={companySettings}
            canExport={!!currentUser}
          />
        </TabsContent>
        <TabsContent value="sales_and_aging" className="mt-6">
          <SalesAgedInvoicesReport
            invoices={data.invoices}
            customers={data.customers}
            canExport={!!currentUser}
          />
        </TabsContent>
        <TabsContent value="purchases" className="mt-6">
          <PurchasesReport
            purchaseOrders={data.purchaseOrders}
            suppliers={data.suppliers}
            companySettings={companySettings}
            canExport={!!currentUser}
          />
        </TabsContent>
        <TabsContent value="vat_report" className="mt-6">
          <VATReportTab 
            invoices={data.invoices}
            customers={data.customers}
            books={data.books}
            companySettings={data.companySettings}
            currentUser={currentUser}
            loading={loading}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-6">
          <PaymentsLedger
            invoices={data.invoices}
            purchaseOrders={data.purchaseOrders}
            suppliers={data.suppliers}
            companySettings={data.companySettings}
            canExport={!!currentUser}
          />
        </TabsContent>
        <TabsContent value="stock" className="mt-6">
          <StockOnHandReport
            products={data.products}
            lots={data.lots}
            canExport={!!currentUser}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
