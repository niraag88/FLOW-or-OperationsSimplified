
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react"; // Added FileText
import { DeliveryOrder } from "@/api/entities";
import { User } from "@/api/entities";
import DOList from "../components/delivery-orders/DOList";
import DOForm from "../components/delivery-orders/DOForm";
import DOFilters from "../components/delivery-orders/DOFilters";
import CreateFromExistingDialog from "../components/delivery-orders/CreateFromExistingDialog"; // New import
import ExportDropdown from "../components/common/ExportDropdown";

export default function DeliveryOrders() {
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDOForm, setShowDOForm] = useState(false);
  const [editingDO, setEditingDO] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    customer: "all",
    dateRange: "all",
    tax_treatment: "all"
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);

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
    setLoading(true);
    try {
      const dosData = await DeliveryOrder.list('-updated_date');
      setDeliveryOrders(dosData);
    } catch (error) {
      console.error("Error loading delivery orders data:", error);
    } finally {
      setLoading(false);
    }
  };

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
    const matchesSearch = doOrder.do_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         doOrder.remarks?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filters.status === "all" || doOrder.status === filters.status;
    const matchesCustomer = filters.customer === "all" || doOrder.customer_id === filters.customer;
    const matchesTaxTreatment = filters.tax_treatment === "all" || doOrder.tax_treatment === filters.tax_treatment;
    
    // Date range filtering
    let matchesDateRange = true;
    if (filters.dateRange !== "all") {
      const doDate = new Date(doOrder.order_date);
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      if (filters.dateRange === "today") {
        const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
        matchesDateRange = doDate >= startOfToday && doDate <= endOfToday;
      } else if (filters.dateRange === "week") {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        matchesDateRange = doDate >= startOfWeek;
      } else if (filters.dateRange === "month") {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        matchesDateRange = doDate >= startOfMonth;
      } else if (filters.dateRange === "quarter") {
        const quarter = Math.floor(today.getMonth() / 3);
        const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
        matchesDateRange = doDate >= startOfQuarter;
      } else if (typeof filters.dateRange === "object" && filters.dateRange.type === "custom") {
        const startDate = new Date(filters.dateRange.startDate);
        const endDate = new Date(filters.dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        matchesDateRange = doDate >= startDate && doDate <= endDate;
      }
    }
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesTaxTreatment && matchesDateRange;
  });

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
              total_amount: { label: 'Total (AED)', transform: (val) => `${val || 0}` },
              currency: 'Currency'
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
        
        <DOFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Delivery Orders List */}
      <DOList 
        deliveryOrders={filteredDOs}
        loading={loading}
        canEdit={canEdit}
        currentUser={currentUser}
        onEdit={handleEditDO}
        onRefresh={handleRefresh}
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
