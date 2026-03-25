
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { PurchaseOrder } from "@/api/entities";
import POList from "../components/purchase-orders/POList";
import POForm from "../components/purchase-orders/POForm";
import GoodsReceiptsTab from "../components/purchase-orders/GoodsReceiptsTab";
import POFilters from "../components/purchase-orders/POFilters";
import ExportDropdown from "../components/common/ExportDropdown";
import POQuickViewModal from "../components/purchase-orders/POQuickViewModal";
import { format } from "date-fns";


export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [allPOs, setAllPOs] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("purchase-orders");
  const [showPOForm, setShowPOForm] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    supplier: "all",
    dateRange: "all"
  });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [quickViewPoId, setQuickViewPoId] = useState(null);
  const [financialYears, setFinancialYears] = useState([]);
  const [financialYearsLoaded, setFinancialYearsLoaded] = useState(false);
  const hasFetchedPOsRef = useRef(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    fetch('/api/books', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        setFinancialYears(data);
        setFinancialYearsLoaded(true);
      });
  }, []);

  const fetchGoodsReceipts = () => {
    fetch('/api/goods-receipts', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const grns = Array.isArray(data) ? data : [];
        setGoodsReceipts(grns.map(grn => ({
          ...grn,
          grn_number: grn.receiptNumber ?? grn.grn_number,
          purchase_order_id: grn.poId ?? grn.purchase_order_id,
          delivery_note_ref: grn.notes ?? grn.delivery_note_ref,
        })));
      })
      .catch(() => {});
  };

  const fetchAllPOsForGRNTab = () => {
    fetch('/api/purchase-orders?status=submitted,closed', { credentials: 'include' })
      .then(r => r.json())
      .then(result => setAllPOs(Array.isArray(result) ? result : (result.data || [])))
      .catch(() => {});
  };

  // On first goods-receipts tab open: fetch submitted+closed POs (lazy, once) and GRNs
  useEffect(() => {
    if (activeTab !== 'goods-receipts') return;
    if (!hasFetchedPOsRef.current) {
      hasFetchedPOsRef.current = true;
      fetchAllPOsForGRNTab();
    }
    fetchGoodsReceipts();
  }, [activeTab]);

  // On refresh: re-fetch submitted+closed POs and GRNs if currently on goods-receipts tab
  useEffect(() => {
    if (refreshTrigger === 0 || activeTab !== 'goods-receipts') return;
    fetchAllPOsForGRNTab();
    fetchGoodsReceipts();
  }, [refreshTrigger]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!financialYearsLoaded) return;
    const params = new URLSearchParams();
    const isAll = itemsPerPage === 9999;
    if (!isAll) {
      params.set('page', String(currentPage));
      params.set('pageSize', String(itemsPerPage));
    }
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.supplier && filters.supplier !== 'all') params.set('supplierId', String(filters.supplier));
    if (filters.paymentStatus && filters.paymentStatus !== 'all') params.set('paymentStatus', filters.paymentStatus);
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (filters.dateRange && filters.dateRange !== 'all') {
      const dr = filters.dateRange;
      if (dr === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dr === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dr === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dr === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dr === 'object' && dr.type === 'custom') { params.set('dateFrom', toStr(new Date(dr.startDate))); params.set('dateTo', toStr(new Date(dr.endDate))); }
    }
    const closedYears = financialYears.filter(y => y.status === 'Closed');
    if (closedYears.length > 0) {
      params.set('excludeYears', closedYears.map(cy => `${cy.startDate},${cy.endDate}`).join(';'));
    }
    setLoading(true);
    fetch(`/api/purchase-orders?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(result => {
        const data = Array.isArray(result) ? result : (result.data || []);
        setPurchaseOrders(data);
        setTotalCount(Array.isArray(result) ? data.length : (result.total || 0));
      })
      .catch(err => console.error('Error loading purchase orders:', err))
      .finally(() => setLoading(false));
  }, [financialYearsLoaded, currentPage, itemsPerPage, debouncedSearch, filters, financialYears, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleNewPO = () => {
    setEditingPO(null);
    setShowPOForm(true);
  };

  const handleEditPO = (po) => {
    setEditingPO(po);
    setShowPOForm(true);
  };

  const handleClosePOForm = () => {
    setShowPOForm(false);
    setEditingPO(null);
  };

  const { user: currentUser } = useAuth();
  const canEdit = ['Admin', 'Manager'].includes(currentUser?.role);

  const visiblePOs = purchaseOrders;

  const totalPagesPos = Math.ceil(totalCount / itemsPerPage);
  const startIndexPos = (currentPage - 1) * itemsPerPage;
  const endIndexPos = Math.min(startIndexPos + itemsPerPage, totalCount);
  const resetPagination = () => setCurrentPage(1);

  const fetchAllForExport = async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.status && filters.status !== 'all') params.set('status', filters.status);
    if (filters.supplier && filters.supplier !== 'all') params.set('supplierId', String(filters.supplier));
    const closedYears = financialYears.filter(y => y.status === 'Closed');
    if (closedYears.length > 0) params.set('excludeYears', closedYears.map(cy => `${cy.startDate},${cy.endDate}`).join(';'));
    const today = new Date();
    const toStr = (d) => d.toISOString().split('T')[0];
    if (filters.dateRange && filters.dateRange !== 'all') {
      const dr = filters.dateRange;
      if (dr === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dr === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dr === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dr === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dr === 'object' && dr.type === 'custom') { params.set('dateFrom', toStr(new Date(dr.startDate))); params.set('dateTo', toStr(new Date(dr.endDate))); }
    }
    const r = await fetch(`/api/purchase-orders?${params}`, { credentials: 'include' });
    const result = await r.json();
    return Array.isArray(result) ? result : (result.data || []);
  };

  const filteredGRNs = goodsReceipts.filter(grn =>
    grn.grn_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.delivery_note_ref?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // For Goods Receipts export - we'll manage the export state here 
  const [showOpenReceipts, setShowOpenReceipts] = useState(true);
  const [showClosedReceipts, setShowClosedReceipts] = useState(false);
  
  const getGoodsReceiptsExportData = () => {
    const openPOs = allPOs.filter(po => po.status === 'submitted');
    const closedPOs = allPOs.filter(po => po.status === 'closed');
    
    // Context-aware export based on expanded sections
    if (showOpenReceipts && !showClosedReceipts) {
      return openPOs; // Only open
    } else if (!showOpenReceipts && showClosedReceipts) {
      return closedPOs; // Only closed  
    } else if (showOpenReceipts && showClosedReceipts) {
      return [...openPOs, ...closedPOs]; // Both
    }
    return []; // Neither expanded
  };

  const goodsReceiptsColumns = {
    poNumber: "PO Number",
    brandName: "Brand",
    orderDate: {
      label: "Order Date",
      transform: (date) => date && !isNaN(new Date(date)) ? format(new Date(date), 'dd/MM/yy') : ''
    },
    totalAmount: {
      label: "Total",
      transform: (amount, row) => `${row?.currency || 'GBP'} ${parseFloat(amount || 0).toFixed(2)}`
    },
    grandTotal: {
      label: "Total (AED)", 
      transform: (amount) => `AED ${parseFloat(amount || 0).toFixed(2)}`
    },
    lineItems: "Line Items",
    orderedQty: "Ordered",
    receivedQty: "Received",
    status: {
      label: "Status",
      transform: (status) => status?.toUpperCase() || ''
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-gray-600">Manage purchase orders and goods receipts</p>
        </div>
        
        <div className="flex items-center gap-3">
          <ExportDropdown 
            data={activeTab === 'purchase-orders' ? visiblePOs : getGoodsReceiptsExportData()}
            fetchAllData={activeTab === 'purchase-orders' ? fetchAllForExport : null}
            totalCount={activeTab === 'purchase-orders' ? totalCount : undefined}
            type={activeTab === 'purchase-orders' ? 'Purchase Orders' : 'Goods Receipts'}
            filename={activeTab === 'purchase-orders' ? 'purchase-orders' : 'goods-receipts'}
            columns={activeTab === 'purchase-orders' ? {
              poNumber: 'PO Number',
              supplierName: 'Supplier',
              orderDate: { label: 'Order Date', transform: (date) => date ? format(new Date(date), 'dd/MM/yy') : '' },
              status: { label: 'Status', transform: (val) => val ? val.toUpperCase() : '' },
              currency: 'Currency',
              fxRateToAed: { label: 'FX Rate (to AED)', transform: (val) => val ? parseFloat(val).toFixed(4) : '' },
              totalAmount: { label: 'Subtotal', transform: (val, row) => `${row?.currency || 'GBP'} ${parseFloat(val || 0).toFixed(2)}` },
              vatAmount: { label: 'VAT', transform: (val, row) => `${row?.currency || 'GBP'} ${parseFloat(val || 0).toFixed(2)}` },
              grandTotal: { label: 'Total (AED)', transform: (val, row) => {
                const amt = parseFloat(row?.totalAmount || 0);
                const cur = row?.currency || 'GBP';
                const rate = parseFloat(row?.fxRateToAed || 4.85);
                const aed = cur === 'AED' ? amt : amt * rate;
                return `AED ${aed.toFixed(2)}`;
              }},
              paymentStatus: { label: 'Payment Status', transform: (val) => val ? val.charAt(0).toUpperCase() + val.slice(1) : 'Outstanding' },
              paymentMadeDate: { label: 'Payment Date', transform: (val) => val ? format(new Date(val), 'dd/MM/yy') : '' },
              paymentRemarks: { label: 'Payment Remarks', transform: (val) => val || '' }
            } : goodsReceiptsColumns}
            isLoading={loading}
          />
          
          {canEdit && activeTab === "purchase-orders" && (
            <Button 
              onClick={handleNewPO}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Purchase Order
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search PO numbers, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <POFilters 
          filters={filters} 
          onFiltersChange={setFilters}
          onFilterChange={resetPagination}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="goods-receipts">Goods Receipts</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders" className="mt-6">
          <POList 
            purchaseOrders={visiblePOs}
            totalCount={totalCount}
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onEdit={handleEditPO}
            onRefresh={handleRefresh}
            onQuickView={(id) => setQuickViewPoId(id)}
          />

          {/* Pagination Controls for POs */}
          {!loading && activeTab === "purchase-orders" && totalCount > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  Showing {startIndexPos + 1} to {startIndexPos + visiblePOs.length} of {totalCount} purchase orders
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
                {totalPagesPos > 1 && (
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
                      {Array.from({ length: Math.min(5, totalPagesPos) }, (_, i) => {
                        let pageNumber;
                        if (totalPagesPos <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= totalPagesPos - 2) {
                          pageNumber = totalPagesPos - 4 + i;
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPagesPos, prev + 1))}
                      disabled={currentPage === totalPagesPos}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="goods-receipts" className="mt-6">
          <GoodsReceiptsTab 
            purchaseOrders={allPOs}
            goodsReceipts={goodsReceipts}
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onRefresh={handleRefresh}
            showOpenReceipts={showOpenReceipts}
            setShowOpenReceipts={setShowOpenReceipts}
            showClosedReceipts={showClosedReceipts}
            setShowClosedReceipts={setShowClosedReceipts}
          />
        </TabsContent>
      </Tabs>

      {/* PO Form Modal */}
      <POForm
        open={showPOForm}
        onClose={handleClosePOForm}
        editingPO={editingPO}
        currentUser={currentUser}
        onSuccess={handleRefresh}
      />

      {/* PO Quick View Modal */}
      <POQuickViewModal
        poId={quickViewPoId}
        open={!!quickViewPoId}
        onClose={() => setQuickViewPoId(null)}
      />
    </div>
  );
}
