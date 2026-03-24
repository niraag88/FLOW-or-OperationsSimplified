
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, ChevronDown, X } from "lucide-react";
import { Product } from "@/api/entities";
import { StockCount } from "@/api/entities"; // Changed from InventoryLot
import ProductsTab from "../components/inventory/ProductsTab";
import StockTab from "../components/inventory/StockTab";
import ExportDropdown from "../components/inventory/ExportDropdown";
import QuickAddProduct from "../components/inventory/QuickAddProduct";

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [stockCounts, setStockCounts] = useState([]); // Changed from lots
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load products first
      const productsData = await Product.list('-updated_date');
      setProducts(productsData);
      
      // Load stock counts separately to avoid blocking products
      try {
        const stockCountsData = await StockCount.list('-created_date');
        setStockCounts(stockCountsData);
      } catch (stockError) {
        console.error("Error loading stock counts:", stockError);
        setStockCounts([]); // Set empty array if stock counts fail
      }
    } catch (error) {
      console.error("Error loading inventory data:", error);
      setProducts([]); // Ensure products is set to empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleProductAdded = (newProduct) => {
    setProducts(prev => [newProduct, ...prev]);
    setTimeout(() => {
      const element = document.querySelector(`[data-product-id="${newProduct.id}"]`);
      if (element) {
        element.classList.add('bg-emerald-50', 'border-emerald-200');
        setTimeout(() => {
          element.classList.remove('bg-emerald-50', 'border-emerald-200');
        }, 5000);
      }
    }, 100);
  };

  const handleStockSubTabChange = (subTab, stockMovements, lowStockProducts, outOfStockProducts) => {
    setStockSubTab(subTab);
    setStockSubTabData({
      stockMovements,
      lowStockProducts,
      outOfStockProducts
    });
  };

  const { user: currentUser } = useAuth();
  const canEdit = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);
  const canDelete = ['Admin', 'Manager', 'Staff'].includes(currentUser?.role);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBrand = selectedBrands.length === 0 || selectedBrands.includes(product.brandName);
    const matchesSize = selectedSizes.length === 0 || selectedSizes.includes(product.description);
    
    return matchesSearch && matchesBrand && matchesSize;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Reset to first page when filters change
  const resetPagination = () => {
    setCurrentPage(1);
  };

  // Get unique brands and sizes for filter dropdowns
  const uniqueBrands = [...new Set(products.map(p => p.brandName).filter(Boolean))].sort();
  const uniqueSizes = [...new Set(products.map(p => p.description).filter(Boolean))].sort();

  // Removed filteredLots as lots state is no longer managed here
  /*
  const filteredLots = lots.filter(lot => {
    const product = products.find(p => p.id === lot.product_id);
    return (
      lot.batch_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lot.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product?.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product?.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });
  */
  // Removed filteredPOs as purchaseOrders state is no longer managed here
  /*
  const filteredPOs = purchaseOrders.filter(po => 
    po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.notes?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  */

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
