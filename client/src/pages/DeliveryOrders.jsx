
import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react"; // Added FileText
import { DeliveryOrder } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities";
import { User } from "@/api/entities";
import DOList from "../components/delivery-orders/DOList";
import DOForm from "../components/delivery-orders/DOForm";
import DOFilters from "../components/delivery-orders/DOFilters";
import CreateFromExistingDialog from "../components/delivery-orders/CreateFromExistingDialog"; // New import
import ExportDropdown from "../components/common/ExportDropdown";

import DOTemplate from "../components/print/DOTemplate";
import { createRoot } from 'react-dom/client';

export default function DeliveryOrders() {
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDOForm, setShowDOForm] = useState(false);
  const [editingDO, setEditingDO] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedTaxTreatments, setSelectedTaxTreatments] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [financialYears, setFinancialYears] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { user: currentUser } = useAuth();

  useEffect(() => {
    const loadSupporting = async () => {
      try {
        const [customersData, productsData, brandsData, booksData] = await Promise.all([
          Customer.list().catch(() => []),
          Product.list().catch(() => []),
          Brand.list().catch(() => []),
          fetch('/api/books', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        setCustomers(customersData.filter(c => c.is_active !== false));
        setProducts(productsData);
        setBrands(brandsData.filter(b => b.isActive !== false));
        setFinancialYears(booksData);
      } catch (error) {
        console.error("Error loading supporting data:", error);
      }
    };
    loadSupporting();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const params = new URLSearchParams();
    const isAll = itemsPerPage === 9999;
    if (!isAll) {
      params.set('page', String(currentPage));
      params.set('pageSize', String(itemsPerPage));
    }
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    if (selectedTaxTreatments.length) params.set('taxTreatment', selectedTaxTreatments.join(','));
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && dateRange.type === 'custom') { params.set('dateFrom', toStr(new Date(dateRange.startDate))); params.set('dateTo', toStr(new Date(dateRange.endDate))); }
    }
    const closedYears = financialYears.filter(y => y.status === 'Closed');
    if (closedYears.length > 0) {
      params.set('excludeYears', closedYears.map(cy => `${cy.startDate},${cy.endDate}`).join(';'));
    }
    setLoading(true);
    fetch(`/api/delivery-orders?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(result => {
        const data = Array.isArray(result) ? result : (result.data || []);
        setDeliveryOrders(data);
        setTotalCount(Array.isArray(result) ? data.length : (result.total || 0));
      })
      .catch(err => console.error('Error loading delivery orders:', err))
      .finally(() => setLoading(false));
  }, [currentPage, itemsPerPage, debouncedSearch, selectedStatuses, selectedCustomers, selectedTaxTreatments, dateRange, financialYears, refreshTrigger]);

  // Use preloaded customers for better performance
  const availableCustomers = React.useMemo(() => {
    return customers.map(customer => ({
      ...customer,
      name: customer.name || customer.customer_name // Fallback for reliable display
    }));
  }, [customers]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewDO = () => {
    setEditingDO(null);
    setShowDOForm(true);
  };

  const handleEditDO = (doOrder) => {
    setEditingDO(doOrder);
    setShowDOForm(true);
  };

  const handleCloseDOForm = () => {
    setShowDOForm(false);
    setEditingDO(null);
  };

  const handleDocumentSelect = async (document, documentType) => {
    let doData;
    
    // Generate DO number first
    const timestamp = Date.now().toString().slice(-6);
    const doNumber = `DO-${timestamp}`;
    
    if (documentType === 'quotation') {
      // Fetch the full quotation (with line items) since the list API omits items
      let fullQuotation = document;
      try {
        const res = await fetch(`/api/quotations/${document.id}`, { credentials: 'include' });
        if (res.ok) fullQuotation = await res.json();
      } catch (_) { /* use list-level data as fallback */ }

      // Transform quotation to delivery order
      doData = {
        do_number: doNumber,
        customer_id: fullQuotation.customer_id ?? fullQuotation.customerId,
        order_date: new Date().toISOString().split('T')[0],
        reference: fullQuotation.reference,
        reference_date: fullQuotation.reference_date ?? fullQuotation.referenceDate,
        status: 'draft',
        currency: fullQuotation.currency,
        tax_treatment: fullQuotation.tax_treatment ?? fullQuotation.taxTreatment,
        tax_rate: fullQuotation.tax_rate ?? fullQuotation.taxRate,
        subtotal: fullQuotation.subtotal ?? fullQuotation.totalAmount,
        tax_amount: fullQuotation.tax_amount ?? fullQuotation.vatAmount,
        total_amount: fullQuotation.total_amount ?? fullQuotation.grandTotal,
        remarks: `Based on Quotation #${fullQuotation.quotation_number || fullQuotation.quoteNumber}\n${fullQuotation.remarks || fullQuotation.notes || ''}`.trim(),
        items: (fullQuotation.items || []).map(item => ({ ...item })),
        attachments: []
      };
    } else if (documentType === 'invoice') {
      // Fetch the full invoice (with line items) since the list API omits items
      let fullInvoice = document;
      try {
        const res = await fetch(`/api/invoices/${document.id}`, { credentials: 'include' });
        if (res.ok) fullInvoice = await res.json();
      } catch (_) { /* use list-level data as fallback */ }

      // Transform invoice to delivery order
      doData = {
        do_number: doNumber,
        customer_id: fullInvoice.customer_id ?? fullInvoice.customerId,
        order_date: new Date().toISOString().split('T')[0],
        reference: fullInvoice.reference,
        reference_date: fullInvoice.reference_date ?? fullInvoice.referenceDate,
        status: 'draft',
        currency: fullInvoice.currency,
        tax_treatment: fullInvoice.tax_treatment ?? fullInvoice.taxTreatment,
        tax_rate: fullInvoice.tax_rate ?? fullInvoice.taxRate,
        subtotal: fullInvoice.subtotal,
        tax_amount: fullInvoice.tax_amount ?? fullInvoice.vatAmount,
        total_amount: fullInvoice.total_amount ?? fullInvoice.amount,
        remarks: `Based on Invoice #${fullInvoice.invoice_number || fullInvoice.invoiceNumber}\n${fullInvoice.remarks || ''}`.trim(),
        items: (fullInvoice.items || []).map(item => ({ ...item })),
        attachments: []
      };
    }
    
    setEditingDO(doData);
    setShowCreateFromExistingDialog(false);
    setShowDOForm(true);
  };

  const canEdit = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);

  const visibleDOs = deliveryOrders;

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const resetPagination = () => setCurrentPage(1);

  const fetchAllForExport = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    if (selectedTaxTreatments.length) params.set('taxTreatment', selectedTaxTreatments.join(','));
    const closedYears = financialYears.filter(y => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map(cy => `${cy.startDate},${cy.endDate}`).join(';'));
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && dateRange.type === 'custom') { params.set('dateFrom', toStr(new Date(dateRange.startDate))); params.set('dateTo', toStr(new Date(dateRange.endDate))); }
    }
    const r = await fetch(`/api/delivery-orders?${params}`, { credentials: 'include' });
    const result = await r.json();
    return Array.isArray(result) ? result : (result.data || []);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Orders</h1>
          <p className="text-gray-600">Manage delivery orders and shipments (All amounts in AED)</p>
        </div>
        
        <div className="flex items-center gap-3">
          <ExportDropdown 
            data={visibleDOs}
            fetchAllData={fetchAllForExport}
            totalCount={totalCount}
            type="Delivery Orders"
            filename="delivery-orders"
            columns={{
              do_number: 'DO Number',
              customer_name: 'Customer',
              order_date: { label: 'Order Date', transform: (date) => date ? format(new Date(date), 'dd/MM/yy') : '' },
              reference: 'Reference',
              status: 'Status',
              subtotal: { label: 'Subtotal (AED)', transform: (val) => `${val || 0}` },
              tax_amount: { label: 'VAT (AED)', transform: (val) => `${val || 0}` },
              total_amount: { label: 'Total (AED)', transform: (val) => `${val || 0}` }
            }}
            isLoading={loading}
          />
          
          {canEdit && (
            <>
              <Button 
                variant="outline"
                onClick={() => setShowCreateFromExistingDialog(true)}
              >
                <FileText className="w-4 h-4 mr-2" />
                Create from Existing
              </Button>
              <Button 
                onClick={handleNewDO}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Delivery Order
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search DO numbers, remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <DOFilters 
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          selectedCustomers={selectedCustomers}
          setSelectedCustomers={setSelectedCustomers}
          selectedTaxTreatments={selectedTaxTreatments}
          setSelectedTaxTreatments={setSelectedTaxTreatments}
          dateRange={dateRange}
          setDateRange={setDateRange}
          resetPagination={resetPagination}
          customers={availableCustomers}
        />
      </div>

      {/* Delivery Orders List */}
      <DOList 
        deliveryOrders={visibleDOs}
        totalCount={totalCount}
        loading={loading}
        canEdit={canEdit}
        currentUser={currentUser}
        onEdit={handleEditDO}
        onRefresh={handleRefresh}
      />

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing {startIndex + 1} to {startIndex + visibleDOs.length} of {totalCount} delivery orders
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Items per page selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700">Show:</span>
              <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="9999">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNumber}
                        variant={currentPage === pageNumber ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0"
                        onClick={() => setCurrentPage(pageNumber)}
                      >
                        {pageNumber}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DO Form Modal */}
      <DOForm
        open={showDOForm}
        onClose={handleCloseDOForm}
        editingDO={editingDO}
        currentUser={currentUser}
        onSuccess={handleRefresh}
      />
      
      {/* Create from Existing Dialog */}
      <CreateFromExistingDialog
        open={showCreateFromExistingDialog}
        onClose={() => setShowCreateFromExistingDialog(false)}
        onDocumentSelected={handleDocumentSelect}
      />
    </div>
  );
}
