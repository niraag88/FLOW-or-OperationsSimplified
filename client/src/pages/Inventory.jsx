
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
  const [allBrands, setAllBrands] = useState([]);
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

  // Load brand list once for filter dropdown
  useEffect(() => {
    fetch('/api/brands', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(data => setAllBrands(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Load products with server-side pagination + search
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
  }, [currentPage, itemsPerPage, searchTerm, refreshTrigger]);

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

  // Client-side brand/size filter on the current server page
  const filteredProducts = products.filter(product => {
    const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(product.brandName);
    const matchesSize = selectedSizes.length === 0 || selectedSizes.includes(product.description);
    return matchesBrand && matchesSize;
  });

  // Pagination is server-side — no slicing
  const paginatedProducts = filteredProducts;

  // Total pages based on server total
  const totalPages = Math.ceil(totalProducts / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const resetPagination = () => setCurrentPage(1);

  // Brand list from all brands endpoint; sizes from current page data
  const uniqueBrands = allBrands.map(b => b.name).filter(Boolean).sort();
  const uniqueSizes = [...new Set(products.map(p => p.description).filter(Boolean))].sort();

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
            products={filteredProducts} 
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
            products={filteredProducts}
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
            products={filteredProducts}
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
