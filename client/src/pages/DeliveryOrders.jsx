
import React, { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react";
import { DeliveryOrder } from "@/api/entities";
import { Customer } from "@/api/entities";
import DOList from "../components/delivery-orders/DOList";
import DOForm from "../components/delivery-orders/DOForm";
import DOFilters from "../components/delivery-orders/DOFilters";
import DOQuickViewModal from "../components/delivery-orders/DOQuickViewModal";
import CreateFromExistingDialog from "../components/delivery-orders/CreateFromExistingDialog";
import ExportDropdown from "../components/common/ExportDropdown";

const STALE_3MIN = 3 * 60 * 1000;

export default function DeliveryOrders() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDOForm, setShowDOForm] = useState(false);
  const [editingDO, setEditingDO] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedTaxTreatments, setSelectedTaxTreatments] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [financialYears, setFinancialYears] = useState([]);
  const [quickViewDoId, setQuickViewDoId] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { user: currentUser } = useAuth();

  useEffect(() => {
    const loadSupporting = async () => {
      try {
        const [customersData, booksData] = await Promise.all([
          Customer.list().catch(() => []),
          fetch('/api/books', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        setCustomers(customersData.filter(c => c.isActive !== false));
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

  const excludeYearsKey = financialYears
    .filter(y => y.status === 'Closed')
    .map(cy => `${cy.startDate},${cy.endDate}`)
    .join(';');

  const { data: doResult, isLoading: loading } = useQuery({
    queryKey: ['/api/delivery-orders', currentPage, itemsPerPage, debouncedSearch, selectedStatuses, selectedCustomers, selectedTaxTreatments, dateRange, excludeYearsKey],
    queryFn: async () => {
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
      if (excludeYearsKey) params.set('excludeYears', excludeYearsKey);
      const r = await fetch(`/api/delivery-orders?${params}`, { credentials: 'include' });
      return r.json();
    },
    staleTime: STALE_3MIN,
    placeholderData: keepPreviousData,
  });

  const deliveryOrders = Array.isArray(doResult) ? doResult : (doResult?.data || []);
  const totalCount = Array.isArray(doResult) ? deliveryOrders.length : (doResult?.total || 0);

  // Use preloaded customers for better performance
  const availableCustomers = React.useMemo(() => {
    return customers.map(customer => ({
      ...customer,
      name: customer.name || customer.customer_name // Fallback for reliable display
    }));
  }, [customers]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/delivery-orders'] });
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
    if (documentType !== 'quotation') return;

    // Fetch the full quotation with line items, and the live customer list in parallel
    let fullQuotation = document;
    let availableCustomers = [];
    try {
      const [quotRes, customersData] = await Promise.all([
        fetch(`/api/quotations/${document.id}`, { credentials: 'include' }),
        Customer.list().catch(() => []),
      ]);
      if (quotRes.ok) fullQuotation = await quotRes.json();
      availableCustomers = customersData;
    } catch (_) { /* use list-level data and empty customer list as fallback */ }

    // Validate the customer ID against the live customer list (mirrors Invoices.jsx pattern)
    const rawCustomerId = fullQuotation.customerId ?? fullQuotation.customer_id ?? null;
    const validCustomer = rawCustomerId != null
      ? availableCustomers.find(c => c.id === rawCustomerId)
      : null;
    if (rawCustomerId != null && !validCustomer) {
      console.warn(`⚠️ DO handleDocumentSelect: Customer ID ${rawCustomerId} not found in customer list.`);
    }

    const vatAmount = parseFloat(fullQuotation.vatAmount || fullQuotation.vat_amount || 0);
    const taxTreatment = vatAmount > 0 ? 'StandardRated' : 'ZeroRated';
    const taxRate = vatAmount > 0 ? 0.05 : 0;

    const doData = {
      do_number: '',
      customer_id: validCustomer ? rawCustomerId : null,
      order_date: new Date().toISOString().split('T')[0],
      reference: fullQuotation.reference || '',
      reference_date: fullQuotation.referenceDate ? String(fullQuotation.referenceDate).split('T')[0] : (fullQuotation.reference_date || ''),
      status: 'draft',
      currency: fullQuotation.currency || 'AED',
      tax_treatment: taxTreatment,
      tax_rate: taxRate,
      subtotal: parseFloat(fullQuotation.totalAmount || fullQuotation.subtotal || 0),
      tax_amount: vatAmount,
      total_amount: parseFloat(fullQuotation.grandTotal || fullQuotation.total_amount || 0),
      remarks: `Based on Quotation #${fullQuotation.quoteNumber || fullQuotation.quotation_number || ''}\n${fullQuotation.notes || ''}`.trim(),
      show_remarks: false,
      items: (fullQuotation.items || []).map(item => ({
        product_id: item.productId ?? item.product_id ?? null,
        brand_id: item.brandId ?? item.brand_id ?? null,
        brand_name: item.brandName || item.brand_name || '',
        product_code: item.productCode || item.product_code || '',
        description: item.description || '',
        size: item.size || '',
        quantity: Number(item.quantity) || 1,
        unit_price: parseFloat(item.unitPrice ?? item.unit_price ?? 0),
        line_total: parseFloat(item.lineTotal ?? item.line_total ?? 0),
      })),
      attachments: []
    };

    setEditingDO(doData);
    setShowCreateFromExistingDialog(false);
    setShowDOForm(true);
  };

  const canEdit = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);

  const visibleDOs = deliveryOrders;

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
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
              status: { label: 'Status', transform: (val) => val?.toLowerCase() === 'submitted' ? 'Confirmed' : val ? val.charAt(0).toUpperCase() + val.slice(1) : '' },
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
        onQuickView={(id) => setQuickViewDoId(id)}
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

      {/* DO Quick View Modal */}
      <DOQuickViewModal
        doId={quickViewDoId}
        open={!!quickViewDoId}
        onClose={() => setQuickViewDoId(null)}
        canEdit={canEdit}
        onEdit={(doData) => {
          setQuickViewDoId(null);
          handleEditDO(doData);
        }}
      />

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
