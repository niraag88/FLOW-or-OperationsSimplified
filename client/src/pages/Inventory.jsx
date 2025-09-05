
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
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

  const canEdit = true;
  const canDelete = true;
  const currentUser = { role: 'Admin', email: 'admin@opsuite.com' };

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

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search product code, brand, name..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                resetPagination();
              }}
              className="pl-10"
            />
          </div>
          
          {activeTab === "products" && (
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-gray-400" />
              
              {/* Brand Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between w-40">
                    {selectedBrands.length === 0 ? "All Brands" : `${selectedBrands.length} selected`}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-4">
                  <div className="space-y-3">
                    <h4 className="font-medium leading-none">Select Brands</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {uniqueBrands.map(brand => (
                        <div key={brand} className="flex items-center space-x-2">
                          <Checkbox
                            id={`brand-${brand}`}
                            checked={selectedBrands.includes(brand)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBrands(prev => [...prev, brand]);
                              } else {
                                setSelectedBrands(prev => prev.filter(b => b !== brand));
                              }
                            }}
                          />
                          <label
                            htmlFor={`brand-${brand}`}
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {brand}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {/* Size Filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-between w-40">
                    {selectedSizes.length === 0 ? "All Sizes" : `${selectedSizes.length} selected`}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-4">
                  <div className="space-y-3">
                    <h4 className="font-medium leading-none">Select Sizes</h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {uniqueSizes.map(size => (
                        <div key={size} className="flex items-center space-x-2">
                          <Checkbox
                            id={`size-${size}`}
                            checked={selectedSizes.includes(size)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedSizes(prev => [...prev, size]);
                              } else {
                                setSelectedSizes(prev => prev.filter(s => s !== size));
                              }
                            }}
                          />
                          <label
                            htmlFor={`size-${size}`}
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                          >
                            {size}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedBrands([]);
                    setSelectedSizes([]);
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          )}
        </div>
        
        {/* Active Filter Badges */}
        {(selectedBrands.length > 0 || selectedSizes.length > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Active filters:</span>
            {selectedBrands.map(brand => (
              <Badge key={brand} variant="secondary" className="gap-1">
                {brand}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedBrands(prev => prev.filter(b => b !== brand))}
                />
              </Badge>
            ))}
            {selectedSizes.map(size => (
              <Badge key={size} variant="secondary" className="gap-1">
                {size}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setSelectedSizes(prev => prev.filter(s => s !== size))}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <ProductsTab 
            products={paginatedProducts}
            loading={loading}
            canEdit={canEdit}
            canDelete={canDelete}
            onRefresh={handleRefresh}
          />
          
          {/* Pagination Controls */}
          {!loading && filteredProducts.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredProducts.length)} of {filteredProducts.length} products
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
                      <SelectItem value={filteredProducts.length.toString()}>All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Page navigation */}
                {totalPages > 1 && (
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
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + i;
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
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
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
