import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

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
import Customers from "@/pages/Customers.jsx";
import BackupDrill from "@/pages/BackupDrill.jsx";
import Print from "@/pages/Print.jsx";
import Quotations from "@/pages/Quotations.jsx";

function PagesContent() {
  return (
    <Routes>
      <Route path="/" element={<Layout currentPageName="Dashboard"><Dashboard /></Layout>} />
      <Route path="/Dashboard" element={<Layout currentPageName="Dashboard"><Dashboard /></Layout>} />
      <Route path="/Inventory" element={<Layout currentPageName="Inventory"><Inventory /></Layout>} />
      <Route path="/PurchaseOrders" element={<Layout currentPageName="Purchase Orders"><PurchaseOrders /></Layout>} />
      <Route path="/DeliveryOrders" element={<Layout currentPageName="Delivery Orders"><DeliveryOrders /></Layout>} />
      <Route path="/Invoices" element={<Layout currentPageName="Invoices"><Invoices /></Layout>} />
      <Route path="/Reports" element={<Layout currentPageName="Reports"><Reports /></Layout>} />
      <Route path="/Settings" element={<Layout currentPageName="Settings"><Settings /></Layout>} />
      <Route path="/AddProduct" element={<Layout currentPageName="Add Product"><AddProduct /></Layout>} />
      <Route path="/Customers" element={<Layout currentPageName="Customers"><Customers /></Layout>} />
      <Route path="/BackupDrill" element={<Layout currentPageName="Backup Drill"><BackupDrill /></Layout>} />
      <Route path="/Print" element={<Print />} />
      <Route path="/Quotations" element={<Layout currentPageName="Quotations"><Quotations /></Layout>} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <PagesContent />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
