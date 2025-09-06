
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { Quotation } from "@/api/entities";
import { User } from "@/api/entities"; // Keep import for User entity, though User.me() will be removed.
import QuotationList from "../components/quotations/QuotationList";
import QuotationForm from "../components/quotations/QuotationForm";
import QuotationFilters from "../components/quotations/QuotationFilters";
import ExportDropdown from "../components/common/ExportDropdown";

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showQuotationForm, setShowQuotationForm] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    customer: "all",
    dateRange: "all",
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, [refreshTrigger]);

  const loadCurrentUser = async () => {
    // Always use mock user for public access
    setCurrentUser({ role: 'Admin', email: 'public@opsuite.com' });
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const quotationsData = await Quotation.list('-updated_date');
      setQuotations(quotationsData);
    } catch (error) {
      console.error("Error loading quotations data:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const filteredQuotations = quotations.filter(quotation => {
    const matchesSearch = quotation.quotation_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         quotation.remarks?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filters.status === "all" || quotation.status === filters.status;
    const matchesCustomer = filters.customer === "all" || quotation.customer_id === filters.customer;
    
    return matchesSearch && matchesStatus && matchesCustomer;
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
              quotation_number: 'Quotation Number',
              customer_name: 'Customer',
              quotation_date: { label: 'Quotation Date', transform: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '' },
              reference: 'Reference',
              status: 'Status',
              subtotal: { label: 'Subtotal (AED)', transform: (val) => `${val || 0}` },
              tax_amount: { label: 'VAT (AED)', transform: (val) => `${val || 0}` },
              total_amount: { label: 'Total (AED)', transform: (val) => `${val || 0}` },
              currency: 'Currency'
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
          filters={filters} 
          onFiltersChange={setFilters}
          onFilterChange={resetPagination}
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
      />
    </div>
  );
}
