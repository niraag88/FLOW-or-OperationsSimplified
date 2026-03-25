
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { StockCount } from "@/api/entities";
import ProductsTab from "../components/inventory/ProductsTab";
import StockTab from "../components/inventory/StockTab";
import ExportDropdown from "../components/inventory/ExportDropdown";
import QuickAddProduct from "../components/inventory/QuickAddProduct";

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [stockCounts, setStockCounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uniqueBrands, setUniqueBrands] = useState([]);
  const [uniqueSizes, setUniqueSizes] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
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
  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(itemsPerPage),
        });
        if (searchTerm) params.set('search', searchTerm);
        if (selectedBrands.length > 0) params.set('brand', selectedBrands.join(','));
        if (selectedSizes.length > 0) params.set('size', selectedSizes.join(','));

        const [productResp, stockData] = await Promise.all([
          fetch(`/api/products?${params}`, { credentials: 'include' }).then(r => r.json()),
          Promise.resolve().then(() => StockCount.list('-created_date')).catch(() => []),
        ]);

        if (!cancelled) {
          setProducts(productResp.data || []);
          setTotalProducts(productResp.total || 0);
          setStockCounts(Array.isArray(stockData) ? stockData : []);
        }
      } catch (error) {
        console.error("Error loading inventory data:", error);
        if (!cancelled) { setProducts([]); setTotalProducts(0); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProducts();
    return () => { cancelled = true; };
  }, [currentPage, itemsPerPage, searchTerm, selectedBrands, selectedSizes, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleProductAdded = () => {
    setCurrentPage(1);
    setRefreshTrigger(prev => prev + 1);
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
            activeTab={activeTab}
            stockSubTab={stockSubTab}
            stockMovements={stockSubTabData.stockMovements}
            lowStockProducts={stockSubTabData.lowStockProducts}
            outOfStockProducts={stockSubTabData.outOfStockProducts}
          />
          
          {activeTab === "products" && (
            <>
              <QuickAddProduct 
                onProductAdded={handleProductAdded}
                canAdd={canEdit}
                currentUser={currentUser}
              />
              
              <Button asChild variant="outline">
                <Link to={createPageUrl('AddProduct')}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Product
                </Link>
              </Button>
            </>
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
