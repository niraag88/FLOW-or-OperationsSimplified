import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import Layout from "@/pages/Layout.jsx";

const Dashboard = lazy(() => import("@/pages/Dashboard.jsx"));
const Inventory = lazy(() => import("@/pages/Inventory.jsx"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders.jsx"));
const DeliveryOrders = lazy(() => import("@/pages/DeliveryOrders.jsx"));
const Invoices = lazy(() => import("@/pages/Invoices.jsx"));
const Reports = lazy(() => import("@/pages/Reports.jsx"));
const Settings = lazy(() => import("@/pages/Settings.jsx"));
const AddProduct = lazy(() => import("@/pages/AddProduct.jsx"));
const BulkAddProduct = lazy(() => import("@/pages/BulkAddProduct.jsx"));
const EditProduct = lazy(() => import("@/pages/EditProduct.jsx"));
const StockCountNew = lazy(() => import("@/pages/StockCountNew.jsx"));
const GoodsReceipts = lazy(() => import("@/pages/GoodsReceipts.jsx"));
const Customers = lazy(() => import("@/pages/Customers.jsx"));
const BackupDrill = lazy(() => import("@/pages/BackupDrill.jsx"));
const Print = lazy(() => import("@/pages/Print.jsx"));
const Quotations = lazy(() => import("@/pages/Quotations.jsx"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const POPrintView = lazy(() => import("@/components/purchase-orders/POPrintView.jsx"));
const QuotationPrintView = lazy(() => import("@/components/quotations/QuotationPrintView.jsx"));
const InvoicePrintView = lazy(() => import("@/components/invoices/InvoicePrintView.jsx"));
const DOPrintView = lazy(() => import("@/components/delivery-orders/DOPrintView.jsx"));
const PrintSandboxPage = lazy(() => import("@/pages/PrintSandboxPage.jsx"));

const PageSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
  </div>
);

function PagesContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout currentPageName="Dashboard"><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Dashboard" element={
          <ProtectedRoute>
            <Layout currentPageName="Dashboard"><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Inventory" element={
          <ProtectedRoute>
            <Layout currentPageName="Inventory"><Inventory /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/purchase-orders" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="Purchase Orders"><PurchaseOrders /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/delivery-orders" element={
          <ProtectedRoute>
            <Layout currentPageName="Delivery Orders"><DeliveryOrders /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/invoices" element={
          <ProtectedRoute>
            <Layout currentPageName="Invoices"><Invoices /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Reports" element={
          <ProtectedRoute>
            <Layout currentPageName="Reports"><Reports /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Settings" element={
          <ProtectedRoute>
            <Layout currentPageName="Settings"><Settings /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/UserManagement" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="User Management"><UserManagement /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/AddProduct" element={
          <ProtectedRoute>
            <Layout currentPageName="Add Product"><AddProduct /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/BulkAddProduct" element={
          <ProtectedRoute>
            <Layout currentPageName="Bulk Add Products"><BulkAddProduct /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/products/edit/:id" element={
          <ProtectedRoute>
            <Layout currentPageName="Edit Product"><EditProduct /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/stock-count" element={
          <ProtectedRoute>
            <Layout currentPageName="Stock Count"><StockCountNew /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/StockCountNew" element={
          <ProtectedRoute>
            <Layout currentPageName="Stock Count"><StockCountNew /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/goods-receipts" element={
          <ProtectedRoute>
            <Layout currentPageName="Goods Receipts"><GoodsReceipts /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Customers" element={
          <ProtectedRoute>
            <Layout currentPageName="Customers"><Customers /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/BackupDrill" element={
          <ProtectedRoute requiredRoles={['Admin']}>
            <Layout currentPageName="Backup Drill"><BackupDrill /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Print" element={
          <ProtectedRoute>
            <Print />
          </ProtectedRoute>
        } />
        <Route path="/Quotations" element={
          <ProtectedRoute>
            <Layout currentPageName="Quotations"><Quotations /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/po-print" element={
          <ProtectedRoute>
            <POPrintView />
          </ProtectedRoute>
        } />
        <Route path="/quotation-print" element={
          <ProtectedRoute>
            <QuotationPrintView />
          </ProtectedRoute>
        } />
        <Route path="/quotations/:id/print" element={
          <ProtectedRoute>
            <QuotationPrintView />
          </ProtectedRoute>
        } />
        <Route path="/invoices/:id/print" element={
          <ProtectedRoute>
            <InvoicePrintView />
          </ProtectedRoute>
        } />
        <Route path="/delivery-orders/:id/print" element={
          <ProtectedRoute>
            <DOPrintView />
          </ProtectedRoute>
        } />
        <Route path="/dev/print-sandbox" element={
          <ProtectedRoute>
            <PrintSandboxPage />
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <AuthProvider>
            <PagesContent />
          </AuthProvider>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
