
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { PurchaseOrder } from "@/api/entities";
import { GoodsReceipt } from "@/api/entities";
import { Product } from "@/api/entities"; // Added Product import
import POList from "../components/purchase-orders/POList";
import POForm from "../components/purchase-orders/POForm";
import GoodsReceiptsTab from "../components/purchase-orders/GoodsReceiptsTab"; // Changed import
import POFilters from "../components/purchase-orders/POFilters";
import ExportDropdown from "../components/common/ExportDropdown";

export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [products, setProducts] = useState([]); // Added products state
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [posData, grnsData, productsData] = await Promise.all([ // Added productsData
        PurchaseOrder.list('-updated_date'),
        GoodsReceipt.list('-updated_date'),
        Product.list() // Load all products
      ]);

      setPurchaseOrders(posData);
      setGoodsReceipts(grnsData);
      setProducts(productsData); // Set products
    } catch (error) {
      console.error("Error loading purchase orders data:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const canEdit = true;
  const currentUser = { role: 'Admin', email: 'admin@opsuite.com' }; // Mock user

  const filteredPOs = purchaseOrders.filter(po => {
    const matchesSearch = po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filters.status === "all" || po.status === filters.status;
    const matchesSupplier = filters.supplier === "all" || po.supplier_id === filters.supplier;
    
    return matchesSearch && matchesStatus && matchesSupplier;
  });

  // Calculate pagination for POs
  const totalPagesPos = Math.ceil(filteredPOs.length / itemsPerPage);
  const startIndexPos = (currentPage - 1) * itemsPerPage;
  const endIndexPos = startIndexPos + itemsPerPage;
  const paginatedPOs = filteredPOs.slice(startIndexPos, endIndexPos);

  // Reset pagination when filters/search change
  const resetPagination = () => {
    setCurrentPage(1);
  };

  const filteredGRNs = goodsReceipts.filter(grn =>
    grn.grn_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    grn.delivery_note_ref?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // For Goods Receipts export - get context-aware data based on the purchase orders
  const getGoodsReceiptsExportData = () => {
    const openPOs = purchaseOrders.filter(po => po.status === 'submitted');
    const closedPOs = purchaseOrders.filter(po => po.status === 'closed');
    return [...openPOs, ...closedPOs]; // Export all for now, can be made more context-aware later
  };

  const goodsReceiptsColumns = {
    poNumber: "PO Number",
    brandName: "Brand",
    orderDate: {
      label: "Order Date",
      transform: (date) => date && !isNaN(new Date(date)) ? new Date(date).toLocaleDateString('en-GB') : ''
    },
    totalAmount: {
      label: "Total (GBP)",
      transform: (amount) => `GBP ${parseFloat(amount || 0).toFixed(2)}`
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
            data={activeTab === 'purchase-orders' ? filteredPOs : getGoodsReceiptsExportData()}
            type={activeTab === 'purchase-orders' ? 'Purchase Orders' : 'Goods Receipts'}
            filename={activeTab === 'purchase-orders' ? 'purchase-orders' : 'goods-receipts'}
            columns={activeTab === 'purchase-orders' ? {
              po_number: 'PO Number',
              supplier_name: 'Supplier',
              order_date: { label: 'Order Date', transform: (date) => date ? new Date(date).toLocaleDateString('en-GB') : '' },
              status: 'Status',
              subtotal: { label: 'Subtotal', transform: (val) => `${val || 0}` },
              tax_amount: { label: 'VAT', transform: (val) => `${val || 0}` },
              total_amount: { label: 'Total', transform: (val) => `${val || 0}` },
              currency: 'Currency'
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
            onChange={(e) => {
              setSearchTerm(e.target.value);
              resetPagination();
            }}
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
            purchaseOrders={paginatedPOs}
            totalCount={filteredPOs.length}
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onEdit={handleEditPO}
            onRefresh={handleRefresh}
          />

          {/* Pagination Controls for POs */}
          {!loading && activeTab === "purchase-orders" && filteredPOs.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  Showing {startIndexPos + 1} to {Math.min(endIndexPos, filteredPOs.length)} of {filteredPOs.length} purchase orders
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
                      <SelectItem value={filteredPOs.length.toString()}>All</SelectItem>
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
            purchaseOrders={purchaseOrders}
            products={products}
            goodsReceipts={filteredGRNs}
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onRefresh={handleRefresh}
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
    </div>
  );
}
