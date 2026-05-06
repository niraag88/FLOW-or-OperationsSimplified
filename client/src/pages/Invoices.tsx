
import React, { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react";
import { Invoice } from "@/api/entities";
import { Customer } from "@/api/entities";
import { Product } from "@/api/entities";
import { Brand } from "@/api/entities";
import { User } from "@/api/entities";
import InvoiceList from "../components/invoices/InvoiceList";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceFilters from "../components/invoices/InvoiceFilters";
import CreateFromExistingDialog from "../components/invoices/CreateFromExistingDialog";
import InvoiceQuickViewModal from "../components/invoices/InvoiceQuickViewModal";
import ExportDropdown from "../components/common/ExportDropdown";
import { format } from "date-fns";

import { useToast } from '@/hooks/use-toast';

const STALE_3MIN = 3 * 60 * 1000;


interface CustomerEntity {
  id: number;
  name?: string;
  customer_name?: string;
  is_active?: boolean;
  vatTreatment?: string;
  type?: string;
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
  isActive?: boolean;
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

export default function Invoices() {
  const [customers, setCustomers] = useState<CustomerEntity[]>([]);
  const [products, setProducts] = useState<ProductEntity[]>([]);
  const [brands, setBrands] = useState<BrandEntity[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Record<string, unknown> | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<string | DateRange>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [quickViewInvoiceId, setQuickViewInvoiceId] = useState<number | null>(null);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [sourceQuotationId, setSourceQuotationId] = useState<number | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Toast hook for error handling
  const { toast } = useToast();
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
        setCustomers((customersData as CustomerEntity[]).filter((c) => c.is_active !== false));
        setProducts(productsData as ProductEntity[]);
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

  const { data: invoiceResult, isLoading: loading } = useQuery({
    queryKey: ['/api/invoices', currentPage, itemsPerPage, debouncedSearch, selectedStatuses, selectedCustomers, dateRange, excludeYearsKey, paymentStatusFilter],
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
      if (paymentStatusFilter && paymentStatusFilter !== 'all') params.set('paymentStatus', paymentStatusFilter);
      const today = new Date();
      const toStr = (d: Date) => d.toISOString().split('T')[0];
      if (dateRange && dateRange !== 'all') {
        if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
        else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
        else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
        else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
        else if (typeof dateRange === 'object' && dateRange.type === 'custom') { params.set('dateFrom', toStr(new Date((dateRange as DateRange).startDate!))); params.set('dateTo', toStr(new Date((dateRange as DateRange).endDate!))); }
      }
      if (excludeYearsKey) params.set('excludeYears', excludeYearsKey);
      const r = await fetch(`/api/invoices?${params}`, { credentials: 'include' });
      return r.json();
    },
    staleTime: STALE_3MIN,
    placeholderData: keepPreviousData,
  });

  const invoices = Array.isArray(invoiceResult) ? invoiceResult : (invoiceResult?.data || []);
  const totalCount = Array.isArray(invoiceResult) ? invoices.length : (invoiceResult?.total || 0);

  // Use preloaded customers for better performance
  const availableCustomers = React.useMemo(() => {
    return customers.map((customer: CustomerEntity) => ({
      ...customer,
      name: customer.name || customer.customer_name // Fallback for reliable display
    }));
  }, [customers]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
  };

  const handleInvoiceSaveSuccess = async (saved?: { id?: number | string } | null) => {
    handleRefresh();
    if (sourceQuotationId) {
      const quotationId = sourceQuotationId;
      setSourceQuotationId(null);
      // Task #420 (B5): the convert endpoint now requires the id of
      // the invoice that was actually created from this quotation, so
      // it can never silently mark a quote as 'converted' without a
      // matching invoice. If we don't have an id (e.g. on edit-save
      // where the quote was already converted), skip the call.
      const invoiceId = saved?.id;
      if (invoiceId === undefined || invoiceId === null) return;
      try {
        await fetch(`/api/quotations/${quotationId}/convert`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invoiceId }),
        });
      } catch {
        // non-critical: quotation conversion status is best-effort
      }
    }
  };

  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setShowInvoiceForm(true);
  };

  const handleEditInvoice = async (invoice: Record<string, unknown>) => {
    try {
      // Fetch complete invoice data with line items
      const response = await fetch(`/api/invoices/${invoice.id}`);
      if (response.ok) {
        const fullInvoice = await response.json();
        setEditingInvoice(fullInvoice);
      } else {
        setEditingInvoice(invoice);
      }
      setShowInvoiceForm(true);
    } catch (error: unknown) {
      console.error("Error fetching invoice details:", error);
      setEditingInvoice(invoice);
      setShowInvoiceForm(true);
    }
  };

  const handleCloseInvoiceForm = () => {
    setShowInvoiceForm(false);
    setEditingInvoice(null);
    setSourceQuotationId(null);
  };

  // Robust document-to-invoice normalizer function
  const normalizeDocumentToInvoice = (document: Record<string, unknown>, documentType: string, dropdownData: Record<string, unknown> = {}) => {
    
    const availableCustomers = (dropdownData.availableCustomers || []) as CustomerEntity[];
    const availableBrands = (dropdownData.availableBrands || []) as BrandEntity[];
    const availableProducts = (dropdownData.availableProducts || []) as ProductEntity[];
    
    // Helper function to safely get numeric value
    const safeNumber = (value: unknown) => {
      if (value === null || value === undefined || value === '') return 0;
      const num = parseFloat(String(value));
      return isNaN(num) ? 0 : num;
    };
    
    // Helper function to safely get string value
    const safeString = (value: unknown, fallback = '') => {
      return value !== null && value !== undefined ? String(value) : fallback;
    };
    
    // Helper function to format date
    const formatDate = (dateValue: unknown) => {
      if (!dateValue) return '';
      try {
        return new Date(String(dateValue)).toISOString().split('T')[0];
      } catch {
        return '';
      }
    };

    // Extract common fields with fallbacks for both camelCase and snake_case
    const rawCustomerId = document.customer_id || document.customerId;
    
    // Validate customer exists in current dropdown options
    const validCustomer = availableCustomers.find((c: CustomerEntity) => c.id === rawCustomerId);
    
    const normalizedData: Record<string, unknown> = {
      // Customer ID - only use if it exists in current dropdown options
      customer_id: validCustomer ? rawCustomerId : null,
      
      // Invoice metadata
      invoice_date: new Date().toISOString().split('T')[0],
      status: 'draft',
      
      // Reference information
      reference: safeString(document.reference),
      reference_date: formatDate(document.reference_date || document.referenceDate),
      
      // Financial defaults
      currency: document.currency || 'AED',
      tax_treatment: (() => {
        if (document.tax_treatment || document.taxTreatment) {
          return document.tax_treatment || document.taxTreatment;
        }
        const isZeroRated = validCustomer &&
          (validCustomer.vatTreatment === 'ZeroRated' ||
           validCustomer.vatTreatment === 'International');
        return isZeroRated ? 'ZeroRated' : 'StandardRated';
      })(),
      tax_rate: safeNumber(document.tax_rate ?? document.taxRate ?? 0.05), // Default 5% VAT; use ?? to preserve explicit 0
      
      // Amounts - handle multiple possible field names
      subtotal: safeNumber(document.subtotal || document.totalAmount || document.subTotal),
      tax_amount: safeNumber(document.tax_amount || document.vatAmount || document.taxAmount),
      total_amount: safeNumber(document.total_amount || document.grandTotal || document.totalAmount),
      
      // Payment fields
      paid_amount: 0,
      payment_date: "",
      payment_reference: "",
      
      // Attachments
      attachments: document.attachments || []
    };

    // Document-specific fields
    if (documentType === 'quotation') {
      const quotationNumber = document.quotation_number || document.quoteNumber || 'Unknown';
      const notes = document.remarks || document.notes || '';
      normalizedData.remarks = `Based on Quotation #${quotationNumber}${notes ? '\n' + notes : ''}`.trim();
      
      // Handle quotation-specific items - map field names to what InvoiceForm expects
      const quotationItems = document.items || document.lineItems || [];
      normalizedData.items = (quotationItems as Record<string, unknown>[]).map((item) => {
        const productId = item.productId || item.product_id;
        const brandName: string = String(item.brandName || item.brand_name || '');
        
        // Lookup brand_id from brand name
        let brandId = item.brandId || item.brand_id;
        if (!brandId && brandName && availableBrands.length > 0) {
          const foundBrand = availableBrands.find((b: BrandEntity) => 
            b.name && b.name.toLowerCase() === brandName.toLowerCase()
          );
          if (foundBrand) {
            brandId = foundBrand.id;
          }
        }
        
        return {
          product_id: productId,
          brand_id: brandId,
          brand_name: brandName,
          product_code: item.productCode || item.product_code || '',
          description: item.description || '',
          quantity: parseInt(String(item.quantity)) || 0,
          unit_price: parseFloat(String(item.unitPrice ?? item.unit_price ?? 0)) || 0,
          line_total: parseFloat(String(item.lineTotal ?? item.line_total ?? 0)) || 0
        };
      });
      
    } else if (documentType === 'delivery_order') {
      const doNumber = document.do_number || document.deliveryOrderNumber || 'Unknown';
      const notes = document.remarks || document.notes || '';
      normalizedData.remarks = `Based on Delivery Order #${doNumber}${notes ? '\n' + notes : ''}`.trim();
      
      // Handle delivery order-specific items - map field names to what InvoiceForm expects
      const deliveryOrderItems = (document.items || document.lineItems || []) as Record<string, unknown>[];
      normalizedData.items = (deliveryOrderItems as Record<string, unknown>[]).map((item) => ({
        product_id: item.productId || item.product_id || null,
        brand_id: item.brandId || item.brand_id || null,
        brand_name: item.brandName || item.brand_name || '',
        product_code: item.productCode || item.product_code || '',
        description: item.description || '',
        size: item.size || item.productSize || '',
        quantity: parseInt(String(item.quantity)) || 0,
        unit_price: parseFloat(String(item.unitPrice ?? item.unit_price ?? 0)) || 0,
        line_total: parseFloat(String(item.lineTotal ?? item.line_total ?? 0)) || 0
      }));
    }

    return normalizedData;
  };

  const handleDocumentSelect = async (document: Record<string, any>, documentType: string = '') => {
    try {
      let fullDocument = document;
      
      // For quotations, fetch the complete data with line items
      if (documentType === 'quotation') {
        const response = await fetch(`/api/quotations/${document.id}`, { credentials: 'include' });
        if (response.ok) {
          fullDocument = await response.json();
        }
        // Track source quotation so we can mark it 'converted' after save
        setSourceQuotationId(typeof document.id === 'number' ? document.id : null);
      }

      // For delivery orders: only fetch from API if the passed document lacks items
      // (the CreateFromExistingDialog already fetches the full DO and may have adjusted quantities)
      if (documentType === 'delivery_order') {
        if (!document.items || document.items.length === 0) {
          const response = await fetch(`/api/delivery-orders/${document.id}`, { credentials: 'include' });
          if (response.ok) {
            fullDocument = await response.json();
          }
        }
        // If document already has items (from partial-quantity adjustment), use it as-is
      }
      
      // Load current dropdown data for validation and mapping
      const [currentCustomers, currentBrands, currentProducts] = await Promise.all([
        Customer.list().catch(() => []),
        Brand.list().catch(() => []),
        Product.list().catch(() => [])
      ]);
      
      // Use the robust normalizer with full document data and validation
      const newInvoiceData = normalizeDocumentToInvoice(fullDocument, documentType, {
        availableCustomers: currentCustomers,
        availableBrands: currentBrands,
        availableProducts: currentProducts
      });
      
      setEditingInvoice(newInvoiceData);
      setShowCreateFromExistingDialog(false);
      setShowInvoiceForm(true);
      
    } catch (error: unknown) {
      console.error("Error processing document selection:", error);
      toast({
        title: "Error",
        description: "Failed to process the selected document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleViewAndPrint = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    if (paymentStatusFilter && paymentStatusFilter !== 'all') params.set('paymentStatus', paymentStatusFilter);
    const today = new Date();
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && (dateRange as DateRange).type === 'custom') { params.set('dateFrom', toStr(new Date((dateRange as DateRange).startDate!))); params.set('dateTo', toStr(new Date((dateRange as DateRange).endDate!))); }
    }
    const closedYears = financialYears.filter((y: FinancialYear) => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`).join(';'));
    window.open(`/invoices-list-print?${params}`, '_blank');
  };

  const canEdit = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role || '');
  const canOverride = true;

  const visibleInvoices = invoices;

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);
  const resetPagination = () => setCurrentPage(1);

  const fetchAllForExport = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedStatuses.length) params.set('status', selectedStatuses.join(','));
    if (selectedCustomers.length) params.set('customerId', selectedCustomers.join(','));
    if (paymentStatusFilter && paymentStatusFilter !== 'all') params.set('paymentStatus', paymentStatusFilter);
    const closedYears = financialYears.filter((y: FinancialYear) => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`).join(';'));
    const today = new Date();
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && (dateRange as DateRange).type === 'custom') { params.set('dateFrom', toStr(new Date((dateRange as DateRange).startDate!))); params.set('dateTo', toStr(new Date((dateRange as DateRange).endDate!))); }
    }
    const r = await fetch(`/api/invoices?${params}`, { credentials: 'include' });
    const result = await r.json();
    return Array.isArray(result) ? result : (result.data || []);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600">Manage invoices and track payments (All amounts in AED)</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <ExportDropdown 
            data={visibleInvoices}
            fetchAllData={fetchAllForExport}
            totalCount={totalCount}
            type="Invoices"
            filename="invoices"
            columns={{
              invoiceNumber: 'Invoice Number',
              customerName: 'Customer',
              invoiceDate: { label: 'Invoice Date', transform: (date: unknown) => date ? format(new Date(String(date)), 'dd/MM/yy') : '' },
              reference: 'Reference',
              subtotal: { label: 'Subtotal (AED)', transform: (val: unknown) => parseFloat(String(val || 0)).toFixed(2) },
              vatAmount: { label: 'VAT (AED)', transform: (val: unknown) => parseFloat(String(val || 0)).toFixed(2) },
              amount: { label: 'Total (AED)', transform: (val: unknown) => parseFloat(String(val || 0)).toFixed(2) },
              status: { label: 'Status', transform: (val: unknown) => val && typeof val === 'string' ? val.charAt(0).toUpperCase() + val.slice(1) : '' },
              paymentStatus: { label: 'Payment Status', transform: (val: unknown) => val && typeof val === 'string' ? val.charAt(0).toUpperCase() + val.slice(1) : 'Outstanding' },
              paymentReceivedDate: { label: 'Payment Date', transform: (val: unknown) => val ? format(new Date(String(val)), 'dd/MM/yy') : '' },
              paymentRemarks: { label: 'Payment Remarks', transform: (val: unknown) => String(val || '') }
            }}
            isLoading={loading}
            onViewAndPrint={handleViewAndPrint}
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
                onClick={handleNewInvoice}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Invoice
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
            placeholder="Search invoice numbers, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="overflow-x-auto">
          <InvoiceFilters 
            selectedStatuses={selectedStatuses}
            setSelectedStatuses={setSelectedStatuses}
            selectedCustomers={selectedCustomers}
            setSelectedCustomers={setSelectedCustomers}
            dateRange={dateRange}
            setDateRange={setDateRange}
            resetPagination={resetPagination}
            customers={availableCustomers.map(c => ({ ...c, name: c.name || '' }))}
            paymentStatusFilter={paymentStatusFilter}
            setPaymentStatusFilter={setPaymentStatusFilter}
          />
        </div>
      </div>

      {/* Invoices List */}
      <InvoiceList 
        invoices={visibleInvoices}
        totalCount={totalCount}
        loading={loading}
        canEdit={canEdit}
        canOverride={canOverride}
        currentUser={currentUser}
        onEdit={handleEditInvoice}
        onRefresh={handleRefresh}
        onQuickView={(id: number) => setQuickViewInvoiceId(id)}
      />

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-sm text-gray-700">
              Showing {startIndex + 1} to {startIndex + visibleInvoices.length} of {totalCount} invoices
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
                
                <span className="sm:hidden text-sm text-gray-700">
                  Page {currentPage} of {totalPages}
                </span>
                
                <div className="hidden sm:flex items-center gap-1">
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

      {/* Invoice Form Modal */}
      <InvoiceForm
        open={showInvoiceForm}
        onClose={handleCloseInvoiceForm}
        editingInvoice={editingInvoice}
        currentUser={currentUser}
        canOverride={canOverride}
        onSuccess={handleInvoiceSaveSuccess}
      />
      
      {/* Create from Existing Dialog */}
      <CreateFromExistingDialog
        open={showCreateFromExistingDialog}
        onClose={() => setShowCreateFromExistingDialog(false)}
        onDocumentSelected={handleDocumentSelect}
      />

      {/* Invoice Quick View Modal */}
      <InvoiceQuickViewModal
        invoiceId={quickViewInvoiceId}
        open={!!quickViewInvoiceId}
        onClose={() => setQuickViewInvoiceId(null)}
        canEdit={canEdit}
        canOverride={canOverride}
        onEdit={(invoice: Record<string, unknown>) => {
          setQuickViewInvoiceId(null);
          handleEditInvoice(invoice);
        }}
      />
    </div>
  );
}
