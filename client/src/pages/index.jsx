import Layout from "./Layout.jsx";

import Dashboard from "./Dashboard";

import Inventory from "./Inventory";

import PurchaseOrders from "./PurchaseOrders";

import DeliveryOrders from "./DeliveryOrders";

import Invoices from "./Invoices";

import Reports from "./Reports";

import Settings from "./Settings";

import AddProduct from "./AddProduct";

import Customers from "./Customers";

import BackupDrill from "./BackupDrill";

import Print from "./Print";

import Quotations from "./Quotations";

import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    Inventory: Inventory,
    
    PurchaseOrders: PurchaseOrders,
    
    DeliveryOrders: DeliveryOrders,
    
    Invoices: Invoices,
    
    Reports: Reports,
    
    Settings: Settings,
    
    AddProduct: AddProduct,
    
    Customers: Customers,
    
    BackupDrill: BackupDrill,
    
    Print: Print,
    
    Quotations: Quotations,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Layout currentPageName={currentPage}>
            <Routes>            
                
                    <Route path="/" element={<Dashboard />} />
                
                
                <Route path="/Dashboard" element={<Dashboard />} />
                
                <Route path="/Inventory" element={<Inventory />} />
                
                <Route path="/PurchaseOrders" element={<PurchaseOrders />} />
                
                <Route path="/DeliveryOrders" element={<DeliveryOrders />} />
                
                <Route path="/Invoices" element={<Invoices />} />
                
                <Route path="/Reports" element={<Reports />} />
                
                <Route path="/Settings" element={<Settings />} />
                
                <Route path="/AddProduct" element={<AddProduct />} />
                
                <Route path="/Customers" element={<Customers />} />
                
                <Route path="/BackupDrill" element={<BackupDrill />} />
                
                <Route path="/Print" element={<Print />} />
                
                <Route path="/Quotations" element={<Quotations />} />
                
            </Routes>
        </Layout>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}