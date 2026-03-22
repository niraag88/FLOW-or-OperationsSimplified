
import React, { useState, useEffect } from "react";
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
import { getDerivedInvoiceStatus } from "../components/invoices/invoiceUtils";
import ExportDropdown from "../components/common/ExportDropdown";

import InvoiceTemplate from "../components/print/InvoiceTemplate";
import { createRoot } from 'react-dom/client';
import { useToast } from '@/hooks/use-toast';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedTaxTreatments, setSelectedTaxTreatments] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [financialYears, setFinancialYears] = useState([]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Toast hook for error handling
  const { toast } = useToast();

  const loadCurrentUser = async () => {
    setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
  };

  useEffect(() => {
    loadCurrentUser();
    const loadSupporting = async () => {
      try {
        const [customersData, productsData, brandsData, booksData] = await Promise.all([
          Customer.list().catch(() => []),
          Product.list().catch(() => []),
          Brand.list().catch(() => []),
          fetch('/api/books').then(r => r.json()).catch(() => []),
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
    fetch(`/api/invoices?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(result => {
        const data = Array.isArray(result) ? result : (result.data || []);
        setInvoices(data);
        setTotalCount(Array.isArray(result) ? data.length : (result.total || 0));
      })
      .catch(err => console.error('Error loading invoices:', err))
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
    console.log('🔄 handleRefresh called - triggering data reload');
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setShowInvoiceForm(true);
  };

  const handleEditInvoice = async (invoice) => {
    try {
      // Fetch complete invoice data with line items
      const response = await fetch(`/api/invoices/${invoice.id}`);
      if (response.ok) {
        const fullInvoice = await response.json();
        console.log("✅ Full invoice data retrieved:", fullInvoice);
        setEditingInvoice(fullInvoice);
      } else {
        console.warn("⚠️ Failed to fetch full invoice, using basic data");
        setEditingInvoice(invoice);
      }
      setShowInvoiceForm(true);
    } catch (error) {
      console.error("❌ Error fetching invoice details:", error);
      setEditingInvoice(invoice);
      setShowInvoiceForm(true);
    }
  };

  const handleCloseInvoiceForm = () => {
    setShowInvoiceForm(false);
    setEditingInvoice(null);
  };

  // Robust document-to-invoice normalizer function
  const normalizeDocumentToInvoice = (document, documentType, dropdownData = {}) => {
    console.log("🔄 Normalizing document:", documentType, document);
    
    const { availableCustomers = [], availableBrands = [], availableProducts = [] } = dropdownData;
    
    // Helper function to safely get numeric value
    const safeNumber = (value) => {
      if (value === null || value === undefined || value === '') return 0;
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    };
    
    // Helper function to safely get string value
    const safeString = (value, fallback = '') => {
      return value !== null && value !== undefined ? String(value) : fallback;
    };
    
    // Helper function to format date
    const formatDate = (dateValue) => {
      if (!dateValue) return '';
      try {
        return new Date(dateValue).toISOString().split('T')[0];
      } catch {
        return '';
      }
    };

    // Extract common fields with fallbacks for both camelCase and snake_case
    const rawCustomerId = document.customer_id || document.customerId;
    
    // Validate customer exists in current dropdown options
    const validCustomer = availableCustomers.find(c => c.id === rawCustomerId);
    if (!validCustomer && rawCustomerId) {
      console.warn(`⚠️ Customer ID ${rawCustomerId} not found in current customers. Available:`, 
        availableCustomers.map(c => ({ id: c.id, name: c.name || c.customer_name })));
    }
    
    const normalizedData = {
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
      normalizedData.items = quotationItems.map(item => {
        const productId = item.productId || item.product_id;
        const brandName = item.brandName || item.brand_name;
        
        // Lookup brand_id from brand name
        let brandId = item.brandId || item.brand_id;
        if (!brandId && brandName && availableBrands.length > 0) {
          const foundBrand = availableBrands.find(b => 
            b.name && b.name.toLowerCase() === brandName.toLowerCase()
          );
          if (foundBrand) {
            brandId = foundBrand.id;
            console.log(`✅ Mapped brand "${brandName}" to ID ${brandId}`);
          } else {
            console.warn(`⚠️ Brand "${brandName}" not found in available brands:`, 
              availableBrands.map(b => b.name));
          }
        }
        
        return {
          product_id: productId,
          brand_id: brandId,
          brand_name: brandName,
          product_code: item.productCode || item.product_code || '',
          description: item.description || '',
          quantity: parseInt(item.quantity) || 0,
          unit_price: parseFloat(item.unitPrice || item.unit_price) || 0,
          line_total: parseFloat(item.lineTotal || item.line_total) || 0
        };
      });
      
    } else if (documentType === 'delivery_order') {
      const doNumber = document.do_number || document.deliveryOrderNumber || 'Unknown';
      const notes = document.remarks || document.notes || '';
      normalizedData.remarks = `Based on Delivery Order #${doNumber}${notes ? '\n' + notes : ''}`.trim();
      
      // Handle delivery order-specific items - map field names to what InvoiceForm expects
      const deliveryOrderItems = document.items || document.lineItems || [];
      normalizedData.items = deliveryOrderItems.map(item => ({
        product_id: item.productId || item.product_id || null,
        brand_id: item.brandId || item.brand_id || null,
        brand_name: item.brandName || item.brand_name || '',
        product_code: item.productCode || item.product_code || '',
        description: item.description || '',
        quantity: parseInt(item.quantity) || 0,
        unit_price: parseFloat(item.unitPrice || item.unit_price) || 0,
        line_total: parseFloat(item.lineTotal || item.line_total) || 0
      }));
    }

    // Log the transformation for debugging
    console.log("✅ Normalized invoice data:", {
      customer_id: normalizedData.customer_id,
      reference_date: normalizedData.reference_date,
      subtotal: normalizedData.subtotal,
      tax_amount: normalizedData.tax_amount,
      total_amount: normalizedData.total_amount,
      remarks: normalizedData.remarks,
      items_count: normalizedData.items.length
    });

    return normalizedData;
  };

  const handleDocumentSelect = async (document, documentType) => {
    console.log("📄 Document selected for invoice creation:", documentType, document);
    
    try {
      let fullDocument = document;
      
      // For quotations, fetch the complete data with line items
      if (documentType === 'quotation') {
        console.log("🔍 Fetching full quotation with line items for ID:", document.id);
        const response = await fetch(`/api/quotations/${document.id}`);
        if (response.ok) {
          fullDocument = await response.json();
          console.log("✅ Full quotation data retrieved:", fullDocument);
        } else {
          console.warn("⚠️ Failed to fetch full quotation, using basic data");
        }
      }
      
      // Load current dropdown data for validation and mapping
      const [currentCustomers, currentBrands, currentProducts] = await Promise.all([
        Customer.list().catch(() => []),
        Brand.list().catch(() => []),
        Product.list().catch(() => [])
      ]);
      
      console.log("🔍 Current dropdown data:", {
        customers: currentCustomers.map(c => ({ id: c.id, name: c.name || c.customer_name })),
        brands: currentBrands.map(b => ({ id: b.id, name: b.name }))
      });
      
      // Use the robust normalizer with full document data and validation
      const newInvoiceData = normalizeDocumentToInvoice(fullDocument, documentType, {
        availableCustomers: currentCustomers,
        availableBrands: currentBrands,
        availableProducts: currentProducts
      });
      
      console.log("🎯 Final invoice data being passed to form:", newInvoiceData);
      
      setEditingInvoice(newInvoiceData);
      setShowCreateFromExistingDialog(false);
      setShowInvoiceForm(true);
      
    } catch (error) {
      console.error("❌ Error processing document selection:", error);
      toast({
        title: "Error",
        description: "Failed to process the selected document. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Remove permission restrictions
  const canEdit = true;
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
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dateRange === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dateRange === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dateRange === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dateRange === 'object' && dateRange.type === 'custom') { params.set('dateFrom', toStr(new Date(dateRange.startDate))); params.set('dateTo', toStr(new Date(dateRange.endDate))); }
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
        
        <div className="flex items-center gap-3">
          <ExportDropdown 
            data={visibleInvoices}
            fetchAllData={fetchAllForExport}
            type="Invoices"
            filename="invoices"
            columns={{
              invoice_number: 'Invoice Number',
              customer_name: 'Customer',
              invoice_date: { label: 'Invoice Date', transform: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '' },
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
        
        <InvoiceFilters 
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
      />

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
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

      {/* Invoice Form Modal */}
      <InvoiceForm
        open={showInvoiceForm}
        onClose={handleCloseInvoiceForm}
        editingInvoice={editingInvoice}
        currentUser={currentUser}
        canOverride={canOverride}
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
