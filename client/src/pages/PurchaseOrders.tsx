
import React, { useState, useEffect, useRef } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { PurchaseOrder } from "@/api/entities";
import POList from "../components/purchase-orders/POList";
import POForm from "../components/purchase-orders/POForm";
import GoodsReceiptsTab, { PORow } from "../components/purchase-orders/GoodsReceiptsTab";
import type { GoodsReceipt as SchemaGoodsReceipt } from "@shared/schema";
import POFilters from "../components/purchase-orders/POFilters";
import ExportDropdown from "../components/common/ExportDropdown";
import POQuickViewModal from "../components/purchase-orders/POQuickViewModal";
import { format } from "date-fns";

const STALE_3MIN = 3 * 60 * 1000;


interface PurchaseOrder {
  id: number;
  status?: string;
  currency?: string;
  [key: string]: unknown;
}

interface FinancialYear {
  id: number;
  status: string;
  startDate: string;
  endDate: string;
}

export default function PurchaseOrders() {
  const [allPOs, setAllPOs] = useState<PORow[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<SchemaGoodsReceipt[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("purchase-orders");
  const [showPOForm, setShowPOForm] = useState(false);
  const [editingPO, setEditingPO] = useState<Record<string, unknown> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({
    status: "all",
    supplier: "all",
    dateRange: "all",
    paymentStatus: "all"
  });
  const [quickViewPoId, setQuickViewPoId] = useState<number | null>(null);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [financialYearsLoaded, setFinancialYearsLoaded] = useState(false);
  const hasFetchedPOsRef = useRef(false);

  // Separate refresh counter only for the GRN tab (raw fetches)
  const [grnRefreshCount, setGrnRefreshCount] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Load financial years once on mount
  useEffect(() => {
    fetch('/api/books', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
      .then(data => {
        setFinancialYears(data);
        setFinancialYearsLoaded(true);
      });
  }, []);

  // Compute the closed-years key for the query cache (stable string)
  const excludeYearsKey = financialYears
    .filter((y: FinancialYear) => y.status === 'Closed')
    .map((cy: FinancialYear) => `${cy.startDate},${cy.endDate}`)
    .join(';');

  const buildPoParams = () => {
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
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (filters.dateRange && filters.dateRange !== 'all') {
      const dr = filters.dateRange;
      if (dr === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dr === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dr === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dr === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dr === 'object' && (dr as Record<string, unknown>).type === 'custom') { params.set('dateFrom', toStr(new Date(String((dr as Record<string, string>).startDate || '')))); params.set('dateTo', toStr(new Date(String((dr as Record<string, string>).endDate || '')))); }
    }
    if (excludeYearsKey) params.set('excludeYears', excludeYearsKey);
    return params;
  };

  // Main PO list — React Query with 3-min cache
  const { data: poResult, isLoading: loading } = useQuery({
    queryKey: ['/api/purchase-orders', currentPage, itemsPerPage, debouncedSearch, filters, excludeYearsKey],
    queryFn: async () => {
      const params = buildPoParams();
      const r = await fetch(`/api/purchase-orders?${params}`, { credentials: 'include' });
      return r.json();
    },
    enabled: financialYearsLoaded,
    staleTime: STALE_3MIN,
    placeholderData: keepPreviousData,
  });

  const purchaseOrders = Array.isArray(poResult) ? poResult : (poResult?.data || []);
  const totalCount = Array.isArray(poResult) ? purchaseOrders.length : (poResult?.total || 0);

  const fetchGoodsReceipts = () => {
    fetch('/api/goods-receipts', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const grns = Array.isArray(data) ? data : [];
        setGoodsReceipts(grns as SchemaGoodsReceipt[]);
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

  // On GRN refresh trigger
  useEffect(() => {
    if (grnRefreshCount === 0 || activeTab !== 'goods-receipts') return;
    fetchAllPOsForGRNTab();
    fetchGoodsReceipts();
  }, [grnRefreshCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/goods-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
    setGrnRefreshCount(prev => prev + 1);
  };

  const handleNewPO = () => {
    setEditingPO(null);
    setShowPOForm(true);
  };

  const handleEditPO = (po: Record<string, unknown>) => {
    setEditingPO(po);
    setShowPOForm(true);
  };

  const handleClosePOForm = () => {
    setShowPOForm(false);
    setEditingPO(null);
  };

  const { user: currentUser } = useAuth();
  const canEdit = ['Admin', 'Manager'].includes(currentUser?.role || '');

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
    if (excludeYearsKey) params.set('excludeYears', excludeYearsKey);
    const today = new Date();
    const toStr = (d: Date) => d.toISOString().split('T')[0];
    if (filters.dateRange && filters.dateRange !== 'all') {
      const dr = filters.dateRange;
      if (dr === 'today') { const d = toStr(today); params.set('dateFrom', d); params.set('dateTo', d); }
      else if (dr === 'week') { const s = new Date(today); s.setDate(today.getDate() - today.getDay()); s.setHours(0,0,0,0); params.set('dateFrom', toStr(s)); }
      else if (dr === 'month') params.set('dateFrom', toStr(new Date(today.getFullYear(), today.getMonth(), 1)));
      else if (dr === 'quarter') { const q = Math.floor(today.getMonth() / 3); params.set('dateFrom', toStr(new Date(today.getFullYear(), q * 3, 1))); }
      else if (typeof dr === 'object' && (dr as Record<string, unknown>).type === 'custom') { params.set('dateFrom', toStr(new Date(String((dr as Record<string, string>).startDate || '')))); params.set('dateTo', toStr(new Date(String((dr as Record<string, string>).endDate || '')))); }
    }
    const r = await fetch(`/api/purchase-orders?${params}`, { credentials: 'include' });
    const result = await r.json();
    return Array.isArray(result) ? result : (result.data || []);
  };

  const filteredGRNs = goodsReceipts.filter((grn: SchemaGoodsReceipt) =>
    grn.receiptNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // For Goods Receipts export - we'll manage the export state here 
  const [showOpenReceipts, setShowOpenReceipts] = useState(true);
  const [showClosedReceipts, setShowClosedReceipts] = useState(false);
  
  const getGoodsReceiptsExportData = () => {
    const openPOs = allPOs.filter((po) => po.status === 'submitted');
    const closedPOs = allPOs.filter((po) => po.status === 'closed');
    
    if (showOpenReceipts && !showClosedReceipts) {
      return openPOs;
    } else if (!showOpenReceipts && showClosedReceipts) {
      return closedPOs;
    } else if (showOpenReceipts && showClosedReceipts) {
      return [...openPOs, ...closedPOs];
    }
    return [];
  };

  const goodsReceiptsColumns = {
    poNumber: "PO Number",
    brandName: "Brand",
    orderDate: {
      label: "Order Date",
      transform: (date: unknown) => date && !isNaN(new Date(String(date)).getTime()) ? format(new Date(String(date)), 'dd/MM/yy') : ''
    },
    totalAmount: {
      label: "Total",
      transform: (amount: unknown, row: Record<string, unknown>) => `${row?.currency || 'GBP'} ${parseFloat(String(amount || 0)).toFixed(2)}`
    },
    grandTotal: {
      label: "Total (AED)", 
      transform: (amount: unknown) => `AED ${parseFloat(String(amount || 0)).toFixed(2)}`
    },
    lineItems: "Line Items",
    orderedQty: "Ordered",
    receivedQty: "Received",
    status: {
      label: "Status",
      transform: (status: unknown) => typeof status === 'string' ? status.toUpperCase() : ''
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
              brandName: 'Brand',
              orderDate: { label: 'Order Date', transform: (date: unknown) => date ? format(new Date(String(date)), 'dd/MM/yy') : '' },
              totalAmount: { label: 'Total', transform: (val: unknown, row: Record<string, unknown>) => `${String(row?.currency || 'GBP')} ${parseFloat(String(val || 0)).toFixed(2)}` },
              grandTotal: { label: 'Total (AED)', transform: (val: unknown, row: Record<string, unknown>) => {
                const amt = parseFloat(String(row?.totalAmount || 0));
                const cur = String(row?.currency || 'GBP');
                const rate = parseFloat(String(row?.fxRateToAed || 4.85));
                const aed = cur === 'AED' ? amt : amt * rate;
                return `AED ${aed.toFixed(2)}`;
              }},
              status: { label: 'Status', transform: (val: unknown) => val && typeof val === 'string' ? val.toUpperCase() : '' },
              paymentStatus: { label: 'Payment Status', transform: (val: unknown) => val && typeof val === 'string' ? val.charAt(0).toUpperCase() + val.slice(1) : 'Outstanding' },
              paymentMadeDate: { label: 'Payment Date', transform: (val: unknown) => val ? format(new Date(String(val)), 'dd/MM/yy') : '' },
              paymentRemarks: { label: 'Payment Remarks', transform: (val: unknown) => val || '' }
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
            onQuickView={(id: number) => setQuickViewPoId(id)}
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
                
                {totalPagesPos > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      
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
