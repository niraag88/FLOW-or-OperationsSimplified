
import React, { useState, useEffect, useRef } from "react";
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
import YearSelector from "../components/common/YearSelector";
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
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [selectedTaxTreatments, setSelectedTaxTreatments] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedYearId, setSelectedYearId] = useState(null);
  const yearInitializedRef = useRef(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50); // New state

  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, [refreshTrigger]);

  const loadCurrentUser = async () => {
    // Always use mock user for public access
    setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
  };

  const loadData = async () => {
    console.time('🚀 Delivery Orders Page - Total Load Time');
    setLoading(true);
    try {
      console.time('📡 API Calls - Parallel Loading');
      // Load all necessary data in parallel like the optimized quotations page
      const [dosData, customersData, productsData, brandsData, booksData] = await Promise.all([
        DeliveryOrder.list('-updated_date'),
        Customer.list().catch(() => []),
        Product.list().catch(() => []),
        Brand.list().catch(() => []),
        fetch('/api/books').then(r => r.json()).catch(() => []),
      ]);
      console.timeEnd('📡 API Calls - Parallel Loading');

      console.time('⚡ State Updates');
      setDeliveryOrders(dosData);
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
      
      console.log('📊 Data loaded:', dosData.length, 'delivery orders,', customersData.length, 'customers,', productsData.length, 'products,', brandsData.length, 'brands');
    } catch (error) {
      console.error("Error loading delivery orders data:", error);
    } finally {
      setLoading(false);
      console.timeEnd('🚀 Delivery Orders Page - Total Load Time');
    }
  };

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
      // Transform quotation to delivery order
      doData = {
        do_number: doNumber, // Add generated DO number
        customer_id: document.customer_id,
        order_date: new Date().toISOString().split('T')[0],
        reference: document.reference,
        reference_date: document.reference_date,
        status: 'draft',
        currency: document.currency,
        tax_treatment: document.tax_treatment,
        tax_rate: document.tax_rate,
        subtotal: document.subtotal,
        tax_amount: document.tax_amount,
        total_amount: document.total_amount,
        remarks: `Based on Quotation #${document.quotation_number}\n${document.remarks || ''}`.trim(),
        items: document.items.map(item => ({ ...item })),
        attachments: []
      };
    } else if (documentType === 'invoice') {
      // Transform invoice to delivery order
      doData = {
        do_number: doNumber, // Add generated DO number
        customer_id: document.customer_id,
        order_date: new Date().toISOString().split('T')[0],
        reference: document.reference,
        reference_date: document.reference_date,
        status: 'draft',
        currency: document.currency,
        tax_treatment: document.tax_treatment,
        tax_rate: document.tax_rate,
        subtotal: document.subtotal,
        tax_amount: document.tax_amount,
        total_amount: document.total_amount,
        remarks: `Based on Invoice #${document.invoice_number}\n${document.remarks || ''}`.trim(),
        items: document.items.map(item => ({ ...item })),
        attachments: []
      };
    }
    
    setEditingDO(doData);
    setShowCreateFromExistingDialog(false);
    setShowDOForm(true);
  };

  const canEdit = true;

  const filteredDOs = deliveryOrders.filter(doOrder => {
    // Year filter
    if (selectedYearId !== null) {
      const selectedBook = financialYears.find(b => b.id === selectedYearId);
      if (selectedBook) {
        const startDate = new Date(selectedBook.startDate);
        const endDate = new Date(selectedBook.endDate);
        endDate.setHours(23, 59, 59, 999);
        const d = new Date(doOrder.order_date);
        if (d < startDate || d > endDate) return false;
      }
    }
    const matchesSearch = doOrder.do_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doOrder.remarks?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(doOrder.status);
    const matchesCustomer = selectedCustomers.length === 0 || selectedCustomers.includes(doOrder.customer_id);
    const matchesTaxTreatment = selectedTaxTreatments.length === 0 || selectedTaxTreatments.includes(doOrder.tax_treatment);
    
    // Date range filtering
    let matchesDateRange = true;
    if (dateRange !== "all") {
      const doDate = new Date(doOrder.order_date);
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      if (dateRange === "today") {
        const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        matchesDateRange = doDate >= startOfToday && doDate <= endOfToday;
      } else if (dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        matchesDateRange = doDate >= startOfWeek;
      } else if (dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        matchesDateRange = doDate >= startOfMonth;
      } else if (dateRange === "quarter") {
        const quarter = Math.floor(today.getMonth() / 3);
        const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
        matchesDateRange = doDate >= startOfQuarter;
      } else if (typeof dateRange === "object" && dateRange.type === "custom") {
        const startDate = new Date(dateRange.startDate);
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        matchesDateRange = doDate >= startDate && doDate <= endDate;
      }
    }
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesTaxTreatment && matchesDateRange;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredDOs.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDOs = filteredDOs.slice(startIndex, endIndex);

  // Reset pagination when filters/search change
  const resetPagination = () => {
    setCurrentPage(1);
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
            data={filteredDOs}
            type="Delivery Orders"
            filename="delivery-orders"
            columns={{
              do_number: 'DO Number',
              customer_name: 'Customer',
              order_date: { label: 'Order Date', transform: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '' },
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

      {financialYears.length > 0 && (
        <YearSelector
          financialYears={financialYears}
          selectedYearId={selectedYearId}
          onYearChange={(id) => { setSelectedYearId(id); resetPagination(); }}
        />
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search DO numbers, remarks..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              resetPagination();
            }}
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
        deliveryOrders={paginatedDOs}
        totalCount={filteredDOs.length}
        loading={loading}
        canEdit={canEdit}
        currentUser={currentUser}
        onEdit={handleEditDO}
        onRefresh={handleRefresh}
      />

      {/* Pagination Controls */}
      {!loading && filteredDOs.length > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredDOs.length)} of {filteredDOs.length} delivery orders
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
                  <SelectItem value={filteredDOs.length.toString()}>All</SelectItem>
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
