import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import UserManagement from "@/pages/UserManagement";

// Import all pages from Base44 export
import Layout from "@/pages/Layout.jsx";
import Dashboard from "@/pages/Dashboard.jsx";
import Inventory from "@/pages/Inventory.jsx";
import PurchaseOrders from "@/pages/PurchaseOrders.jsx";
import DeliveryOrders from "@/pages/DeliveryOrders.jsx";
import Invoices from "@/pages/Invoices.jsx";
import Reports from "@/pages/Reports.jsx";
import Settings from "@/pages/Settings.jsx";
import AddProduct from "@/pages/AddProduct.jsx";
import EditProduct from "@/pages/EditProduct.jsx";
import StockCount from "@/pages/StockCount.jsx";
import StockCountNew from "@/pages/StockCountNew.jsx";
import GoodsReceipts from "@/pages/GoodsReceipts.jsx";
import Customers from "@/pages/Customers.jsx";
import BackupDrill from "@/pages/BackupDrill.jsx";
import Print from "@/pages/Print.jsx";
import Quotations from "@/pages/Quotations.jsx";

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
      <Route path="/PurchaseOrders" element={
        <ProtectedRoute requiredRoles={['Admin', 'Manager']}>
          <Layout currentPageName="Purchase Orders"><PurchaseOrders /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/DeliveryOrders" element={
        <ProtectedRoute>
          <Layout currentPageName="Delivery Orders"><DeliveryOrders /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/Invoices" element={
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
        <ProtectedRoute requiredRoles={['Admin']}>
          <Layout currentPageName="User Management"><UserManagement /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/AddProduct" element={
        <ProtectedRoute>
          <Layout currentPageName="Add Product"><AddProduct /></Layout>
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
    </Routes>
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
