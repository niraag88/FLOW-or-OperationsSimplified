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
  LayoutDashboard,
  BookText,
} from "lucide-react";

import OverviewReport from "../components/reports/OverviewReport";
import PoGrnReport from "../components/reports/PoGrnReport";
import SalesAgedInvoicesReport from "../components/reports/SalesAgedInvoicesReport";
import PurchasesReport from "../components/reports/PurchasesReport";
import VATReportTab from "../components/reports/VATReportTab";
import PaymentsLedger from "../components/reports/PaymentsLedger";
import StatementsTab from "../components/reports/StatementsTab";
import StockOnHandReport from "../components/reports/StockOnHandReport";

function normalizeTaxTreatment(raw: any) {
  if (!raw) return 'StandardRated';
  const map: Record<string, string> = {
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

function normalizeInvoice(inv: any) {
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
    products: [] as any[],
    lots: [] as any[],
    purchaseOrders: [] as any[],
    goodsReceipts: [] as any[],
    invoices: [] as any[],
    customers: [] as any[],
    suppliers: [] as any[],
    books: [] as any[],
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

      let invoicesData: any[] = [];
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
        books: Array.isArray(booksData) ? booksData : [] as any[],
        companySettings: dashboardData.companySettings,
      });
    } catch (error: any) {
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
        <div className="w-full overflow-x-auto">
          <TabsList className="grid grid-cols-8 min-w-[720px] sm:min-w-0 sm:w-full">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="po_vs_grn" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span>PO vs GRN</span>
            </TabsTrigger>
            <TabsTrigger value="sales_and_aging" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <FileText className="w-4 h-4 shrink-0" />
              <span>Sales &amp; Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="purchases" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span>Purchases</span>
            </TabsTrigger>
            <TabsTrigger value="vat_report" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <FileText className="w-4 h-4 shrink-0" />
              <span>VAT Report</span>
            </TabsTrigger>
            <TabsTrigger value="payments" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Wallet className="w-4 h-4 shrink-0" />
              <span>Payments</span>
            </TabsTrigger>
            <TabsTrigger value="statements" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <BookText className="w-4 h-4 shrink-0" />
              <span>Statements</span>
            </TabsTrigger>
            <TabsTrigger value="stock" className="flex items-center gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
              <Package className="w-4 h-4 shrink-0" />
              <span>Stock</span>
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
        <TabsContent value="statements" className="mt-6">
          <StatementsTab
            invoices={data.invoices}
            purchaseOrders={data.purchaseOrders}
            customers={data.customers}
            suppliers={data.suppliers}
            companySettings={data.companySettings}
            books={data.books}
          />
        </TabsContent>
        <TabsContent value="stock" className="mt-6">
          <StockOnHandReport
            products={data.products}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
