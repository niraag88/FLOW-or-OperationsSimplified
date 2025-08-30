
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { Quotation } from "@/api/entities";
import { User } from "@/api/entities"; // Keep import for User entity, though User.me() will be removed.
import QuotationList from "../components/quotations/QuotationList";
import QuotationForm from "../components/quotations/QuotationForm";
import QuotationFilters from "../components/quotations/QuotationFilters";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-600">Manage quotations (All amounts in AED)</p>
        </div>
        
        <div className="flex items-center gap-3">
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
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <QuotationFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      <QuotationList 
        quotations={filteredQuotations}
        loading={loading}
        canEdit={canEdit}
        canOverride={canOverride}
        currentUser={currentUser}
        onEdit={handleEditQuotation}
        onRefresh={handleRefresh}
      />

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
