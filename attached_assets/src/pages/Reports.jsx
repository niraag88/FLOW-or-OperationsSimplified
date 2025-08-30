import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Package,
  ShoppingCart,
  BarChart3
} from "lucide-react";
import { Product } from "@/api/entities";
import { InventoryLot } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { GoodsReceipt } from "@/api/entities";
import { Invoice } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Supplier } from "@/api/entities";
import { User } from "@/api/entities";
import { Books } from "@/api/entities";
import { CompanySettings } from "@/api/entities";

// Import Report Components
import StockOnHandReport from "../components/reports/StockOnHandReport";
import PoGrnReport from "../components/reports/PoGrnReport";
import SalesAgedInvoicesReport from "../components/reports/SalesAgedInvoicesReport";
import PurchasesReport from "../components/reports/PurchasesReport";
import VATReportTab from "../components/reports/VATReportTab";

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
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadAllData();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      // Always use mock user for public access
      setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
    } catch (error) {
      console.error("Error loading current user:", error);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        productsData,
        lotsData,
        posData,
        grnsData,
        invoicesData,
        customersData,
        suppliersData,
        booksData,
        settingsData
      ] = await Promise.all([
        Product.list("-updated_date"),
        InventoryLot.list("-updated_date"),
        PurchaseOrder.list("-updated_date"),
        GoodsReceipt.list("-updated_date"),
        Invoice.list("-updated_date"),
        Customer.list("-updated_date"),
        Supplier.list("-updated_date"),
        Books.list(),
        CompanySettings.list(),
      ]);

      setData({
        products: productsData,
        lots: lotsData,
        purchaseOrders: posData,
        goodsReceipts: grnsData,
        invoices: invoicesData,
        customers: customersData,
        suppliers: suppliersData,
        books: booksData,
        companySettings: settingsData[0] || null,
      });
    } catch (error) {
      console.error("Error loading reporting data:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const canEdit = currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Ops');

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

      <Tabs defaultValue="stock_on_hand" className="w-full">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="stock_on_hand">
            <Package className="w-4 h-4 mr-2" />
            Stock Report
          </TabsTrigger>
          <TabsTrigger value="po_vs_grn">
            <ShoppingCart className="w-4 h-4 mr-2" />
            PO vs GRN
          </TabsTrigger>
          <TabsTrigger value="sales_and_aging">
            <FileText className="w-4 h-4 mr-2" />
            Sales & Invoices
          </TabsTrigger>
          <TabsTrigger value="purchases">
            <ShoppingCart className="w-4 h-4 mr-2" />
            Purchases
          </TabsTrigger>
          <TabsTrigger value="vat_report">
            <FileText className="w-4 h-4 mr-2" />
            VAT Report
          </TabsTrigger>
        </TabsList>
        <TabsContent value="stock_on_hand" className="mt-6">
          <StockOnHandReport 
            products={data.products} 
            lots={data.lots}
            canExport={!!currentUser} 
          />
        </TabsContent>
        <TabsContent value="po_vs_grn" className="mt-6">
          <PoGrnReport
            purchaseOrders={data.purchaseOrders}
            goodsReceipts={data.goodsReceipts}
            suppliers={data.suppliers}
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
      </Tabs>
    </div>
  );
}