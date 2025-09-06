
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText } from "lucide-react";
import { Invoice } from "@/api/entities";
import { User } from "@/api/entities";
import InvoiceList from "../components/invoices/InvoiceList";
import InvoiceForm from "../components/invoices/InvoiceForm";
import InvoiceFilters from "../components/invoices/InvoiceFilters";
import CreateFromExistingDialog from "../components/invoices/CreateFromExistingDialog";
import { getDerivedInvoiceStatus } from "../components/invoices/invoiceUtils";
import ExportDropdown from "../components/common/ExportDropdown";

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    customer: "all",
    dateRange: "all",
    currency: "all",
    tax_treatment: "all"
  });
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
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
      const invoicesData = await Invoice.list('-updated_date');
      setInvoices(invoicesData);
    } catch (error) {
      console.error("Error loading invoices data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setShowInvoiceForm(true);
  };

  const handleEditInvoice = (invoice) => {
    setEditingInvoice(invoice);
    setShowInvoiceForm(true);
  };

  const handleCloseInvoiceForm = () => {
    setShowInvoiceForm(false);
    setEditingInvoice(null);
  };

  const handleDocumentSelect = async (document, documentType) => {
    // Transform the selected document into a new invoice object
    let newInvoiceData;
    
    if (documentType === 'quotation') {
      newInvoiceData = {
        customer_id: document.customer_id, // Ensure customer_id is set
        invoice_date: new Date().toISOString().split('T')[0],
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
        items: document.items ? document.items.map(item => ({ ...item })) : [],
        paid_amount: 0,
        payment_date: "",
        payment_reference: "",
        attachments: []
      };
    } else if (documentType === 'delivery_order') {
      newInvoiceData = {
        customer_id: document.customer_id, // Ensure customer_id is set
        invoice_date: new Date().toISOString().split('T')[0],
        reference: document.reference,
        reference_date: document.reference_date,
        status: 'draft',
        currency: document.currency,
        tax_treatment: document.tax_treatment,
        tax_rate: document.tax_rate,
        subtotal: document.subtotal,
        tax_amount: document.tax_amount,
        total_amount: document.total_amount,
        remarks: `Based on Delivery Order #${document.do_number}\n${document.remarks || ''}`.trim(),
        items: document.items ? document.items.map(item => ({ ...item })) : [],
        paid_amount: 0,
        payment_date: "",
        payment_reference: "",
        attachments: []
      };
    }
    
    // Ensure the customer_id is properly set before passing to the form
    console.log("Setting customer_id:", newInvoiceData.customer_id);
    
    setEditingInvoice(newInvoiceData);
    setShowCreateFromExistingDialog(false);
    setShowInvoiceForm(true);
  };

  // Remove permission restrictions
  const canEdit = true;
  const canOverride = true;

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = invoice.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Updated logic: Since filter only shows "draft" and "submitted", 
    // we only filter by the actual status stored in the database
    let matchesStatus = true;
    if (filters.status !== 'all') {
      matchesStatus = invoice.status === filters.status;
    }

    const matchesCustomer = filters.customer === "all" || invoice.customer_id === filters.customer;
    const matchesCurrency = filters.currency === "all" || invoice.currency === filters.currency;
    const matchesTaxTreatment = filters.tax_treatment === "all" || invoice.tax_treatment === filters.tax_treatment;
    
    return matchesSearch && matchesStatus && matchesCustomer && matchesCurrency && matchesTaxTreatment;
  });

  // Calculate totals - since all invoices are in AED, simpler calculation
  const totals = filteredInvoices.reduce((acc, invoice) => {
    acc.total += invoice.total_amount || 0;
    acc.paid += invoice.paid_amount || 0;
    acc.outstanding += (invoice.total_amount || 0) - (invoice.paid_amount || 0);
    return acc;
  }, { total: 0, paid: 0, outstanding: 0 });

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
            data={filteredInvoices}
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
              total_amount: { label: 'Total (AED)', transform: (val) => `${val || 0}` },
              paid_amount: { label: 'Paid (AED)', transform: (val) => `${val || 0}` },
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

      {/* AED Totals Summary - Single Currency */}
      {filteredInvoices.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="text-center">
            <h3 className="font-semibold text-purple-900 mb-4">AED Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-gray-600">Total Invoiced</p>
                <p className="font-bold text-2xl text-gray-900">{totals.total.toFixed(2)} AED</p>
              </div>
              <div>
                <p className="text-gray-600">Paid Amount</p>
                <p className="font-bold text-2xl text-green-600">{totals.paid.toFixed(2)} AED</p>
              </div>
              <div>
                <p className="font-bold text-2xl text-amber-600">Outstanding</p>
                <p className="font-bold text-2xl text-amber-600">{totals.outstanding.toFixed(2)} AED</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
        
        <InvoiceFilters filters={filters} onFiltersChange={setFilters} />
      </div>

      {/* Invoices List */}
      <InvoiceList 
        invoices={filteredInvoices}
        loading={loading}
        canEdit={canEdit}
        canOverride={canOverride}
        currentUser={currentUser}
        onEdit={handleEditInvoice}
        onRefresh={handleRefresh}
      />

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
