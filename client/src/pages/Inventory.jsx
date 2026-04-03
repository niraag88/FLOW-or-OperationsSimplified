
import React, { useState, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, ChevronDown, FileSpreadsheet } from "lucide-react";
import { StockCount } from "@/api/entities";
import ProductsTab from "../components/inventory/ProductsTab";
import StockTab from "../components/inventory/StockTab";
import ExportDropdown from "../components/inventory/ExportDropdown";

const STALE_3MIN = 3 * 60 * 1000;

export default function Inventory() {
  const navigate = useNavigate();
  const [stockCounts, setStockCounts] = useState([]);
  const [uniqueBrands, setUniqueBrands] = useState([]);
  const [uniqueSizes, setUniqueSizes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [stockSubTab, setStockSubTab] = useState("stock-levels");
  const [stockSubTabData, setStockSubTabData] = useState({
    stockMovements: [],
    lowStockProducts: [],
    outOfStockProducts: []
  });

  const { user: currentUser } = useAuth();
  const canEdit = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);
  const canDelete = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);

  // Load filter options (brands + sizes) once on mount
  useEffect(() => {
    fetch('/api/products/filter-options', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { brands: [], sizes: [] })
      .then(data => {
        setUniqueBrands(data.brands || []);
        setUniqueSizes(data.sizes || []);
      })
      .catch(() => {});
  }, []);

  // Load products with server-side pagination, search, and brand/size filters
  const { data: productResp, isLoading: loading } = useQuery({
    queryKey: ['/api/products', currentPage, itemsPerPage, searchTerm, selectedBrands, selectedSizes],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(itemsPerPage),
      });
      if (searchTerm) params.set('search', searchTerm);
      if (selectedBrands.length > 0) params.set('brand', selectedBrands.join(','));
      if (selectedSizes.length > 0) params.set('size', selectedSizes.join(','));
      const [resp, stockData] = await Promise.all([
        fetch(`/api/products?${params}`, { credentials: 'include' }).then(r => r.json()),
        Promise.resolve().then(() => StockCount.list('-created_date')).catch(() => []),
      ]);
      setStockCounts(Array.isArray(stockData) ? stockData : []);
      return resp;
    },
    staleTime: STALE_3MIN,
    placeholderData: keepPreviousData,
  });

  const products = productResp?.data || [];
  const totalProducts = productResp?.total || 0;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/products'] });
  };

  const handleStockSubTabChange = (subTab, stockMovements, lowStockProducts, outOfStockProducts) => {
    setStockSubTab(subTab);
    setStockSubTabData({ stockMovements, lowStockProducts, outOfStockProducts });
  };

  // No client-side slicing — server already filtered and paginated
  const paginatedProducts = products;

  const totalPages = Math.ceil(totalProducts / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const resetPagination = () => setCurrentPage(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Manage products and manual stock counts</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <ExportDropdown 
            products={products}
            totalProducts={totalProducts}
            activeTab={activeTab}
            stockSubTab={stockSubTab}
            stockMovements={stockSubTabData.stockMovements}
            lowStockProducts={stockSubTabData.lowStockProducts}
            outOfStockProducts={stockSubTabData.outOfStockProducts}
            searchTerm={searchTerm}
            selectedBrands={selectedBrands}
            selectedSizes={selectedSizes}
          />
          
          {activeTab === "products" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(createPageUrl('AddProduct'))}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(createPageUrl('BulkAddProduct'))}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Bulk Add Products
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <ProductsTab 
            products={products}
            paginatedProducts={paginatedProducts}
            totalProducts={totalProducts}
            loading={loading}
            canEdit={canEdit}
            canDelete={canDelete}
            onRefresh={handleRefresh}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedBrands={selectedBrands}
            setSelectedBrands={setSelectedBrands}
            selectedSizes={selectedSizes}
            setSelectedSizes={setSelectedSizes}
            uniqueBrands={uniqueBrands}
            uniqueSizes={uniqueSizes}
            resetPagination={resetPagination}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <StockTab 
            products={products}
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onRefresh={handleRefresh}
            onStockSubTabChange={handleStockSubTabChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
