import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, Link } from 'react-router-dom';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import LoginPage from "@/pages/LoginPage";
import Layout from "@/pages/Layout";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const DeliveryOrders = lazy(() => import("@/pages/DeliveryOrders"));
const Invoices = lazy(() => import("@/pages/Invoices"));
const Reports = lazy(() => import("@/pages/Reports"));
const Settings = lazy(() => import("@/pages/Settings"));
const AddProduct = lazy(() => import("@/pages/AddProduct"));
const BulkAddProduct = lazy(() => import("@/pages/BulkAddProduct"));
const EditProduct = lazy(() => import("@/pages/EditProduct"));
const StockCountNew = lazy(() => import("@/pages/StockCountNew"));
const GoodsReceipts = lazy(() => import("@/pages/GoodsReceipts"));
const Print = lazy(() => import("@/pages/Print"));
const Quotations = lazy(() => import("@/pages/Quotations"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const POPrintView = lazy(() => import("@/components/purchase-orders/POPrintView"));
const QuotationPrintView = lazy(() => import("@/components/quotations/QuotationPrintView"));
const QuotationsListPrintView = lazy(() => import("@/components/quotations/QuotationsListPrintView"));
const InvoicePrintView = lazy(() => import("@/components/invoices/InvoicePrintView"));
const InvoicesListPrintView = lazy(() => import("@/components/invoices/InvoicesListPrintView"));
const DOPrintView = lazy(() => import("@/components/delivery-orders/DOPrintView"));

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
    <ErrorBoundary>
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout currentPageName="Dashboard"><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout currentPageName="Dashboard"><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Dashboard" element={<Navigate to="/dashboard" replace />} />
        <Route path="/inventory" element={
          <ProtectedRoute>
            <Layout currentPageName="Inventory"><Inventory /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/purchase-orders" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="Purchase Orders"><PurchaseOrders /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/PurchaseOrders" element={<Navigate to="/purchase-orders" replace />} />
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
        <Route path="/reports" element={
          <ProtectedRoute>
            <Layout currentPageName="Reports"><Reports /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <Layout currentPageName="Settings"><Settings /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/user-management" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="User Management"><UserManagement /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/UserManagement" element={<Navigate to="/user-management" replace />} />
        <Route path="/add-product" element={
          <ProtectedRoute>
            <Layout currentPageName="Add Product"><AddProduct /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/AddProduct" element={<Navigate to="/add-product" replace />} />
        <Route path="/bulk-add-product" element={
          <ProtectedRoute>
            <Layout currentPageName="Bulk Add Products"><BulkAddProduct /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/BulkAddProduct" element={<Navigate to="/bulk-add-product" replace />} />
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
        <Route path="/goods-receipts" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="Goods Receipts"><GoodsReceipts /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/audit-log" element={
          <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
            <Layout currentPageName="Audit Log"><AuditLog /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/print" element={
          <ProtectedRoute>
            <Print />
          </ProtectedRoute>
        } />
        <Route path="/Print" element={<Navigate to="/print" replace />} />
        <Route path="/quotations" element={
          <ProtectedRoute>
            <Layout currentPageName="Quotations"><Quotations /></Layout>
          </ProtectedRoute>
        } />
        <Route path="/Quotations" element={<Navigate to="/quotations" replace />} />
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
        <Route path="/quotations-list-print" element={
          <ProtectedRoute>
            <QuotationsListPrintView />
          </ProtectedRoute>
        } />
        <Route path="/quotations/:id/print" element={
          <ProtectedRoute>
            <QuotationPrintView />
          </ProtectedRoute>
        } />
        <Route path="/invoices-list-print" element={
          <ProtectedRoute>
            <InvoicesListPrintView />
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
        <Route path="*" element={
          <Layout currentPageName="Not Found">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              <p className="text-6xl font-bold text-gray-200 dark:text-gray-700 mb-4">404</p>
              <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Page not found</h1>
              <p className="text-gray-500 dark:text-gray-400 mb-6">The page you're looking for doesn't exist or has been moved.</p>
              <Link to="/dashboard" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                Go to Dashboard
              </Link>
            </div>
          </Layout>
        } />
      </Routes>
    </Suspense>
    </ErrorBoundary>
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
