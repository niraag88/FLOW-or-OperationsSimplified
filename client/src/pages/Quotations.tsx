
import React, { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { Quotation } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities";
import QuotationList from "../components/quotations/QuotationList";
import QuotationForm from "../components/quotations/QuotationForm";
import QuotationFilters from "../components/quotations/QuotationFilters";
import ExportDropdown from "../components/common/ExportDropdown";
import QuotationQuickViewModal from "../components/quotations/QuotationQuickViewModal";


const STALE_3MIN = 3 * 60 * 1000;


interface CustomerEntity {
  id: number;
  name?: string;
  customer_name?: string;
  is_active?: boolean;
}

interface BrandEntity {
  id: number;
  name?: string;
  isActive?: boolean;
}

interface ProductEntity {
  id: number;
  name?: string;
  brandId?: number;
}

interface FinancialYear {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
}

interface DateRange extends Record<string, unknown> {
  type?: string;
  startDate?: string;
  endDate?: string;
}

export default function Quotations() {
  const [customers, setCustomers] = useState<CustomerEntity[]>([]);
  const [products, setProducts] = useState<ProductEntity[]>([]);
  const [brands, setBrands] = useState<BrandEntity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<Record<string, unknown> | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<string | DateRange>("all");
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [quickViewQuotationId, setQuickViewQuotationId] = useState<number | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const loadSupporting = async () => {
      try {
        const [customersData, productsData, brandsData, booksData] = await Promise.all([
          Customer.list().catch(() => []),
          Product.list().catch(() => []),
          Brand.list().catch(() => []),
          fetch('/api/books', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        setCustomers((customersData as CustomerEntity[]).filter((c) => c.is_active !== false));
        setProducts((productsData || []) as ProductEntity[]);
        setBrands((brandsData as BrandEntity[]).filter((b) => b.isActive !== false));
        setFinancialYears(booksData);
      } catch (error: unknown) {
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
    .filter((y: FinancialYear) => y.status === 'Closed')
    .map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`)
    .join(';');

  const { data: quotationResult, isLoading: loading } = useQuery({
    queryKey: ['/api/quotations', currentPage, itemsPerPage, debouncedSearch, selectedStatuses, selectedCustomers, dateRange, excludeYearsKey],
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
      const today = new Date();
      const toStr = (d: Date) => d.toISOString().split('T')[0];
      if (dateRange && dateRange !== 'all') {
        if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
        else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
        else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
        else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
        else if (typeof dateRange === 'object' && (dateRange as DateRange).type === 'custom') { params.set('dateFrom', toStr(new Date(String((dateRange as DateRange).startDate || '')))); params.set('dateTo', toStr(new Date(String((dateRange as DateRange).endDate || '')))); }
      }
      if (excludeYearsKey) params.set('excludeYears', excludeYearsKey);
      const r = await fetch(`/api/quotations?${params}`, { credentials: 'include' });
      return r.json();
    },
    staleTime: STALE_3MIN,
    placeholderData: keepPreviousData,
  });

  const quotations = Array.isArray(quotationResult) ? quotationResult : (quotationResult?.data || []);
  const totalCount = Array.isArray(quotationResult) ? quotations.length : (quotationResult?.total || 0);

  // Use preloaded customers data instead of extracting from quotations
  const availableCustomers = customers;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
  };

  const handleNewQuotation = () => {
    setEditingQuotation(null);
    setShowQuotationForm(true);
  };

  const handleEditQuotation = (quotation: Record<string, unknown>) => {
    setEditingQuotation(quotation);
    setShowQuotationForm(true);
  };

  const handleCloseQuotationForm = () => {
    setShowQuotationForm(false);
    setEditingQuotation(null);
  };

  const { user: currentUser } = useAuth();
  const canCreate = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role || '');
  const canEdit = ['Admin', 'Manager'].includes(currentUser?.role || '');
  const canOverride = true;

  const visibleQuotations = quotations;

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const resetPagination = () => setCurrentPage(1);

  const handleViewAndPrint = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    const today = new Date();
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && (dateRange as DateRange).type === 'custom') { params.set('dateFrom', toStr(new Date(String((dateRange as DateRange).startDate || '')))); params.set('dateTo', toStr(new Date(String((dateRange as DateRange).endDate || '')))); }
    }
    const closedYears = financialYears.filter((y: FinancialYear) => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`).join(';'));
    window.open(`/quotations-list-print?${params}`, '_blank');
  };

  const fetchAllForExport = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    const closedYears = financialYears.filter((y: FinancialYear) => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`).join(';'));
    const today = new Date();
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && (dateRange as DateRange).type === 'custom') { params.set('dateFrom', toStr(new Date(String((dateRange as DateRange).startDate || '')))); params.set('dateTo', toStr(new Date(String((dateRange as DateRange).endDate || '')))); }
    }
    const r = await fetch(`/api/quotations?${params}`, { credentials: 'include' });
    const result = await r.json();
    return Array.isArray(result) ? result : (result.data || []);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-600">Manage quotations (All amounts in AED)</p>
        </div>
        
        <div className="flex items-center gap-3">
          <ExportDropdown 
            data={visibleQuotations}
            fetchAllData={fetchAllForExport}
            totalCount={totalCount}
            type="Quotations"
            filename="quotations"
            columns={{
              quoteNumber: 'Quotation Number',
              customerName: 'Customer',
              quoteDate: { label: 'Quotation Date', transform: (date: unknown) => date ? format(new Date(String(date)), 'dd/MM/yy') : '' },
              reference: 'Reference',
              totalAmount: { label: 'Subtotal (AED)', transform: (val: unknown) => String(val || 0) },
              vatAmount: { label: 'VAT (AED)', transform: (val: unknown) => String(val || 0) },
              grandTotal: { label: 'Total (AED)', transform: (val: unknown) => String(val || 0) },
              status: 'Status'
            }}
            isLoading={loading}
            onViewAndPrint={handleViewAndPrint}
          />
          
          {canCreate && (
            <Button 
              onClick={handleNewQuotation}
              className="bg-sky-600 hover:bg-sky-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Quotation
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search quotation numbers, remarks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <QuotationFilters 
          selectedStatuses={selectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          selectedCustomers={selectedCustomers}
          setSelectedCustomers={setSelectedCustomers}
          dateRange={dateRange}
          setDateRange={setDateRange}
          resetPagination={resetPagination}
          customers={availableCustomers}
        />
      </div>

      <QuotationList 
        quotations={visibleQuotations}
        totalCount={totalCount}
        loading={loading}
        canCreate={canCreate}
        canEdit={canEdit}
        canOverride={canOverride}
        currentUser={currentUser}
        onEdit={handleEditQuotation}
        onRefresh={handleRefresh}
        onQuickView={(id: number) => setQuickViewQuotationId(id)}
      />

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing {startIndex + 1} to {startIndex + visibleQuotations.length} of {totalCount} quotations
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

      <QuotationForm
        open={showQuotationForm}
        onClose={handleCloseQuotationForm}
        editingQuotation={editingQuotation}
        currentUser={currentUser}
        canOverride={canOverride}
        onSuccess={handleRefresh}
        preloadedCustomers={customers}
        preloadedProducts={products}
        preloadedBrands={brands}
      />

      {/* Quotation Quick View Modal */}
      <QuotationQuickViewModal
        quotationId={quickViewQuotationId}
        open={!!quickViewQuotationId}
        onClose={() => setQuickViewQuotationId(null)}
        canEdit={canEdit}
        canOverride={canOverride}
        onEdit={(quotation: Record<string, unknown>) => {
          setQuickViewQuotationId(null);
          handleEditQuotation(quotation);
        }}
      />
    </div>
  );
}
