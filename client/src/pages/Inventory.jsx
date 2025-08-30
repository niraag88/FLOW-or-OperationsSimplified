
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { Product } from "@/api/entities";
import { StockCount } from "@/api/entities"; // Changed from InventoryLot
import ProductsTab from "../components/inventory/ProductsTab";
import LotsTab from "../components/inventory/LotsTab";
import ExportDropdown from "../components/inventory/ExportDropdown";
import QuickAddProduct from "../components/inventory/QuickAddProduct";

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [stockCounts, setStockCounts] = useState([]); // Changed from lots
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Changed lotsData to stockCountsData, removed PO and GRN data fetching
      const [productsData, stockCountsData] = await Promise.all([
        Product.list('-updated_date'),
        StockCount.list('-created_date'), // Load stock counts instead of lots
      ]);

      setProducts(productsData);
      setStockCounts(stockCountsData); // Set stock counts
    } catch (error) {
      console.error("Error loading inventory data:", error);
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

  const canEdit = true;
  const canDelete = true;
  const currentUser = { role: 'Admin', email: 'admin@opsuite.com' };

  const filteredProducts = products.filter(product =>
    product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.brand_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          />
          
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
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search product code, brand, name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
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
            loading={loading}
            canEdit={canEdit}
            canDelete={canDelete}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <LotsTab 
            products={products}
            stockCounts={stockCounts} // Pass stock counts
            loading={loading}
            canEdit={canEdit}
            currentUser={currentUser}
            onRefresh={handleRefresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
