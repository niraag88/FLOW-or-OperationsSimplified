
import React, { useState, useEffect, useRef } from "react";
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
import YearSelector from "../components/common/YearSelector";
import QuotationTemplate from "../components/print/QuotationTemplate";
import { createRoot } from 'react-dom/client';

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState(null);
  const yearInitializedRef = useRef(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    console.time('🚀 Quotations Page - Total Load Time');
    setLoading(true);
    try {
      console.time('📡 API Calls - Parallel Loading');
      // Load all necessary data in parallel like the optimized PO page
      const [quotationsData, customersData, productsData, brandsData, booksData] = await Promise.all([
        Quotation.list('-updated_date'),
        Customer.list().catch(() => []),
        Product.list().catch(() => []),
        Brand.list().catch(() => []),
        fetch('/api/books').then(r => r.json()).catch(() => []),
      ]);
      console.timeEnd('📡 API Calls - Parallel Loading');

      console.time('⚡ State Updates');
      setQuotations(quotationsData);
      setCustomers(customersData.filter(c => c.is_active !== false));
      setProducts(productsData);
      setBrands(brandsData.filter(b => b.isActive !== false));
      setFinancialYears(booksData);
      if (!yearInitializedRef.current) {
        const openBook = booksData.find(b => b.status === 'Open');
        setSelectedYearId(openBook ? openBook.id : null);
        yearInitializedRef.current = true;
      }
      console.timeEnd('⚡ State Updates');

      console.log(`📊 Data loaded: ${quotationsData.length} quotations, ${customersData.length} customers, ${productsData.length} products, ${brandsData.length} brands`);
    } catch (error) {
      console.error("Error loading quotations data:", error);
    } finally {
      setLoading(false);
      console.timeEnd('🚀 Quotations Page - Total Load Time');
    }
  };

  // Use preloaded customers data instead of extracting from quotations
  const availableCustomers = customers;

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewQuotation = () => {
    setEditingQuotation(null);
    setShowQuotationForm(true);
  };

  const handleEditQuotation = (quotation) => {
    setEditingQuotation(quotation);
    setShowQuotationForm(true);
  };

  const handleCloseQuotationForm = () => {
    setShowQuotationForm(false);
    setEditingQuotation(null);
  };

  const canEdit = true;
  const canOverride = true;
  const currentUser = { role: 'Admin', email: 'public@opsuite.com' }; // Mock user for optimization

  const filteredQuotations = quotations.filter(quotation => {
    // Year filter
    if (selectedYearId !== null) {
      const selectedBook = financialYears.find(b => b.id === selectedYearId);
      if (selectedBook) {
        const startDate = new Date(selectedBook.startDate);
        const endDate = new Date(selectedBook.endDate);
        endDate.setHours(23, 59, 59, 999);
        const d = new Date(quotation.quoteDate);
        if (d < startDate || d > endDate) return false;
      }
    }
    const matchesSearch = quotation.quoteNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quotation.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(quotation.status);
    const matchesCustomer = selectedCustomers.length === 0 || selectedCustomers.includes(quotation.customerId);
    
    // Date range filtering
    let matchesDateRange = true;
    if (dateRange !== "all") {
      const quotationDate = new Date(quotation.quoteDate);
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      if (dateRange === "today") {
        const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        matchesDateRange = quotationDate >= startOfToday && quotationDate <= endOfToday;
      } else if (dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        matchesDateRange = quotationDate >= startOfWeek;
      } else if (dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        matchesDateRange = quotationDate >= startOfMonth;
      } else if (dateRange === "quarter") {
        const quarter = Math.floor(today.getMonth() / 3);
        const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
        matchesDateRange = quotationDate >= startOfQuarter;
      } else if (typeof dateRange === "object" && dateRange.type === "custom") {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        matchesDateRange = quotationDate >= startDate && quotationDate <= endDate;
      }
    }
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesDateRange;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedQuotations = filteredQuotations.slice(startIndex, endIndex);

  // Reset pagination when filters/search change
  const resetPagination = () => {
    setCurrentPage(1);
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
            data={filteredQuotations}
            type="Quotations"
            filename="quotations"
            columns={{
              quoteNumber: 'Quotation Number',
              customerName: 'Customer',
              quoteDate: { label: 'Quotation Date', transform: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '' },
              reference: 'Reference',
              status: 'Status',
              totalAmount: { label: 'Subtotal (AED)', transform: (val) => `${val || 0}` },
              vatAmount: { label: 'VAT (AED)', transform: (val) => `${val || 0}` },
              grandTotal: { label: 'Total (AED)', transform: (val) => `${val || 0}` }
            }}
            isLoading={loading}
          />
          
          {canEdit && (
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

      {financialYears.length > 0 && (
        <YearSelector
          financialYears={financialYears}
          selectedYearId={selectedYearId}
          onYearChange={(id) => { setSelectedYearId(id); resetPagination(); }}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search quotation numbers, remarks..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              resetPagination();
            }}
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
        quotations={paginatedQuotations}
        totalCount={filteredQuotations.length}
        loading={loading}
        canEdit={canEdit}
        canOverride={canOverride}
        currentUser={currentUser}
        onEdit={handleEditQuotation}
        onRefresh={handleRefresh}
      />

      {/* Pagination Controls */}
      {!loading && filteredQuotations.length > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredQuotations.length)} of {filteredQuotations.length} quotations
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
                  <SelectItem value={filteredQuotations.length.toString()}>All</SelectItem>
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
    </div>
  );
}
