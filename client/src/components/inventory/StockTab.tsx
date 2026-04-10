import React, { useState, useEffect } from "react";
import type { Product } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Package, Activity, AlertTriangle, History, Search, Filter, ChevronDown, X, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";


interface StockProduct {
  id: number;
  sku: string;
  name: string;
  description?: string | null;
  brandName: string;
  brandId: number;
  size: string;
  stockQuantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  unitPrice: string;
  costPrice: string;
  costPriceCurrency: string;
  isActive: boolean;
}

interface StockMovement {
  id: number;
  productId: number;
  productName: string;
  productSku: string;
  brandName: string;
  movementType: string;
  referenceId: number;
  referenceType: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost: string;
  notes: string;
  createdAt: string;
}

interface StockData {
  products: StockProduct[];
  lowStockProducts: StockProduct[];
  outOfStockProducts: StockProduct[];
  stockSummary: {
    totalItems: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
}

interface CompanySettings {
  lowStockThreshold: number;
  fxGbpToAed: number;
  taxNumber?: string;
  vatNumber?: string;
  company_trn?: string;
}

interface StockTabProps {
  products: StockProduct[];
  loading: boolean;
  onStockSubTabChange: (tab: string, ...args: unknown[]) => void;
  canEdit: boolean;
  currentUser?: { email?: string; role?: string } | null;
  onRefresh: () => void;
}

export default function StockTab({ products, loading, onStockSubTabChange, canEdit, currentUser, onRefresh }: StockTabProps) {
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [loadingStock, setLoadingStock] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [activeStockTab, setActiveStockTab] = useState("stock-levels");
  
  // Filter states for each tab
  const [currentStockFilter, setCurrentStockFilter] = useState("");
  const [movementsFilter, setMovementsFilter] = useState("");
  const [lowStockFilter, setLowStockFilter] = useState("");
  const [outOfStockFilter, setOutOfStockFilter] = useState("");

  // Advanced filter states for current stock
  const [selectedStockBrands, setSelectedStockBrands] = useState<string[]>([]);
  const [selectedStockSizes, setSelectedStockSizes] = useState<string[]>([]);
  const [selectedStockStatus, setSelectedStockStatus] = useState<string[]>([]);
  const [stockLevelFilter, setStockLevelFilter] = useState({ min: "", max: "" });

  // Advanced filter states for movements
  const [selectedMovementBrands, setSelectedMovementBrands] = useState<string[]>([]);
  const [selectedMovementTypes, setSelectedMovementTypes] = useState<string[]>([]);
  const [movementDateFilter, setMovementDateFilter] = useState({ start: "", end: "" });

  // Advanced filter states for low stock  
  const [selectedLowStockBrands, setSelectedLowStockBrands] = useState<string[]>([]);
  const [selectedLowStockSizes, setSelectedLowStockSizes] = useState<string[]>([]);
  const [lowStockRange, setLowStockRange] = useState({ min: "", max: "" });

  // Advanced filter states for out of stock
  const [selectedOutOfStockBrands, setSelectedOutOfStockBrands] = useState<string[]>([]);
  const [selectedOutOfStockSizes, setSelectedOutOfStockSizes] = useState<string[]>([]);

  // Pagination states for each tab (independent per-tab)
  const [currentStockPage, setCurrentStockPage] = useState(1);
  const [movementsPage, setMovementsPage] = useState(1);
  const [lowStockPage, setLowStockPage] = useState(1);
  const [outOfStockPage, setOutOfStockPage] = useState(1);
  const [stockLevelsPerPage, setStockLevelsPerPage] = useState(50);
  const [movementsPerPage, setMovementsPerPage] = useState(50);
  const [lowStockPerPage, setLowStockPerPage] = useState(50);
  const [outOfStockPerPage, setOutOfStockPerPage] = useState(50);

  useEffect(() => {
    loadStockMovements();
    loadCompanySettings();
  }, []);

  // Reload stock data when company settings change (especially low stock threshold)
  useEffect(() => {
    if (companySettings) {
      loadStockData(companySettings.lowStockThreshold);
    }
  }, [companySettings]);

  const loadCompanySettings = async () => {
    try {
      const response = await fetch('/api/company-settings', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch company settings');
      const data = await response.json();
      setCompanySettings(data);
    } catch (error: unknown) {
      console.error("Error loading company settings:", error);
      setCompanySettings({ lowStockThreshold: 6, fxGbpToAed: 4.85 });
    }
  };

  const loadStockData = async (threshold: number) => {
    setLoadingStock(true);
    try {
      const lowStockThreshold = threshold || companySettings?.lowStockThreshold || 6;
      const response = await fetch(`/api/products/stock-analysis?threshold=${lowStockThreshold}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stock analysis');
      const data = await response.json();
      setStockData(data);
    } catch (error: unknown) {
      console.error("Error loading stock data:", error);
      setStockData(null);
    } finally {
      setLoadingStock(false);
    }
  };

  const loadStockMovements = async () => {
    setLoadingMovements(true);
    try {
      const response = await fetch('/api/stock-movements', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stock movements');
      const data = await response.json();
      setStockMovements(data);
    } catch (error: unknown) {
      console.error("Error loading stock movements:", error);
      setStockMovements([]);
    } finally {
      setLoadingMovements(false);
    }
  };

  // Use server-provided stock analysis data
  const stockSummary = stockData ? {
    totalProducts: stockData.products.length,
    totalQuantity: stockData.stockSummary.totalItems,
    totalValue: stockData.stockSummary.totalValue, // Already in AED (converted per-product currency server-side)
    lowStock: stockData.stockSummary.lowStockCount,
    outOfStock: stockData.stockSummary.outOfStockCount,
  } : {
    totalProducts: 0,
    totalQuantity: 0,
    totalValue: 0,
    lowStock: 0,
    outOfStock: 0,
  };

  const lowStockProducts = stockData?.lowStockProducts || [];
  const outOfStockProducts = stockData?.outOfStockProducts || [];
  const allProducts: StockProduct[] = stockData?.products || products;

  // Get unique values for filters from server data
  const uniqueStockBrands = [...new Set(allProducts.map((p: StockProduct) => p.brandName).filter(Boolean))].sort() as string[];
  const uniqueStockSizes = [...new Set(allProducts.map((p: StockProduct) => p.size).filter(Boolean))].sort() as string[];
  const uniqueLowStockBrands = [...new Set(lowStockProducts.map((p: StockProduct) => p.brandName).filter(Boolean))].sort() as string[];
  const uniqueLowStockSizes = [...new Set(lowStockProducts.map((p: StockProduct) => p.size).filter(Boolean))].sort() as string[];
  const uniqueMovementBrands = [...new Set(stockMovements.map((m: StockMovement) => m.brandName).filter(Boolean))].sort() as string[];
  const uniqueMovementTypes = [...new Set(stockMovements.map((m: StockMovement) => m.movementType).filter(Boolean))].sort() as string[];

  // Filter functions

  // Advanced filter function for current stock
  const applyAdvancedStockFilters = (productList: StockProduct[], searchTerm: string, selectedBrands: string[], selectedSizes: string[], selectedStatus: string[], stockLevelRange: { min: string; max: string }): StockProduct[] => {
    let filtered = productList;

    // Text search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((product: StockProduct) => 
        (product.name || '').toLowerCase().includes(term) ||
        (product.sku || '').toLowerCase().includes(term) ||
        (product.brandName || '').toLowerCase().includes(term) ||
        (product.description || '').toLowerCase().includes(term)
      );
    }

    // Brand filter
    if (selectedBrands.length > 0) {
      filtered = filtered.filter((product: StockProduct) => selectedBrands.includes(product.brandName));
    }

    // Size filter
    if (selectedSizes.length > 0) {
      filtered = filtered.filter((product: StockProduct) => selectedSizes.includes(product.size));
    }

    // Stock level filter
    if (stockLevelRange.min !== "" || stockLevelRange.max !== "") {
      const min = stockLevelRange.min !== "" ? parseInt(stockLevelRange.min) : 0;
      const max = stockLevelRange.max !== "" ? parseInt(stockLevelRange.max) : Infinity;
      filtered = filtered.filter((product: StockProduct) => {
        const stock = product.stockQuantity || 0;
        return stock >= min && stock <= max;
      });
    }

    // Status filter (in stock, low stock, out of stock)
    if (selectedStatus.length > 0) {
      const lowStockThreshold = companySettings?.lowStockThreshold || 6;
      filtered = filtered.filter((product: StockProduct) => {
        const stock = product.stockQuantity || 0;
        const isInStock = stock > lowStockThreshold;
        const isLowStock = stock > 0 && stock <= lowStockThreshold;
        const isOutOfStock = stock === 0;

        return selectedStatus.some((status: string) => {
          if (status === 'in-stock' && isInStock) return true;
          if (status === 'low-stock' && isLowStock) return true;
          if (status === 'out-of-stock' && isOutOfStock) return true;
          return false;
        });
      });
    }

    return filtered;
  };


  // Advanced filter function for movements
  const applyAdvancedMovementFilters = (movementList: StockMovement[], searchTerm: string, selectedBrands: string[], selectedTypes: string[], dateRange: { start: string; end: string }): StockMovement[] => {
    let filtered = movementList;

    // Text search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((movement: StockMovement) => 
        (movement.productName || '').toLowerCase().includes(term) ||
        (movement.productSku || '').toLowerCase().includes(term) ||
        (movement.brandName || '').toLowerCase().includes(term) ||
        (movement.movementType || '').toLowerCase().includes(term) ||
        (movement.notes || '').toLowerCase().includes(term)
      );
    }

    // Brand filter (using actual brandName from API)
    if (selectedBrands.length > 0) {
      filtered = filtered.filter((movement: StockMovement) => selectedBrands.includes(movement.brandName));
    }

    // Movement type filter
    if (selectedTypes.length > 0) {
      filtered = filtered.filter((movement: StockMovement) => selectedTypes.includes(movement.movementType));
    }

    // Date range filter — compare by date string (YYYY-MM-DD) to avoid timezone offsets
    if (dateRange.start || dateRange.end) {
      filtered = filtered.filter((movement: StockMovement) => {
        const movementDateStr = (movement.createdAt || '').slice(0, 10);
        if (dateRange.start && movementDateStr < dateRange.start) return false;
        if (dateRange.end && movementDateStr > dateRange.end) return false;
        return true;
      });
    }

    return filtered;
  };

  // Apply filters
  const filteredProducts = applyAdvancedStockFilters(
    allProducts, 
    currentStockFilter, 
    selectedStockBrands, 
    selectedStockSizes, 
    selectedStockStatus, 
    stockLevelFilter
  );
  const filteredLowStockProducts = applyAdvancedStockFilters(
    lowStockProducts, 
    lowStockFilter, 
    selectedLowStockBrands, 
    selectedLowStockSizes, 
    [], 
    lowStockRange
  );
  const filteredOutOfStockProducts = applyAdvancedStockFilters(
    outOfStockProducts, 
    outOfStockFilter, 
    selectedOutOfStockBrands, 
    selectedOutOfStockSizes, 
    [], 
    { min: "", max: "" }
  );
  const filteredStockMovements = applyAdvancedMovementFilters(
    stockMovements, 
    movementsFilter, 
    selectedMovementBrands, 
    selectedMovementTypes, 
    movementDateFilter
  );

  // Pagination logic for each tab
  const paginateData = <T,>(data: T[], page: number, perPage: number) => {
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    return {
      data: data.slice(startIndex, endIndex),
      totalPages: Math.ceil(data.length / perPage),
      startIndex,
      endIndex: Math.min(endIndex, data.length),
      totalItems: data.length
    };
  };

  // Paginated data for each tab
  const paginatedCurrentStock = paginateData(filteredProducts, currentStockPage, stockLevelsPerPage);
  const paginatedMovements = paginateData(filteredStockMovements, movementsPage, movementsPerPage);
  const paginatedLowStock = paginateData(filteredLowStockProducts, lowStockPage, lowStockPerPage);
  const paginatedOutOfStock = paginateData(filteredOutOfStockProducts, outOfStockPage, outOfStockPerPage);

  // Reset pagination when filters change
  const resetPagination = (type: string) => {
    switch(type) {
      case 'current-stock':
        setCurrentStockPage(1);
        break;
      case 'movements':
        setMovementsPage(1);
        break;
      case 'low-stock':
        setLowStockPage(1);
        break;
      case 'out-of-stock':
        setOutOfStockPage(1);
        break;
    }
  };

  // Reusable pagination controls component
  const PaginationControls = ({ paginationData, currentPage, setPage, perPage, setPerPage, type, itemName }: {
    paginationData: { totalItems: number; totalPages: number; startIndex?: number; endIndex?: number };
    currentPage: number;
    setPage: React.Dispatch<React.SetStateAction<number>>;
    perPage: number;
    setPerPage: React.Dispatch<React.SetStateAction<number>>;
    type: string;
    itemName: string;
  }) => {
    if (paginationData.totalItems === 0) return null;

    return (
      <div className="flex items-center justify-between mt-6 pt-4 border-t">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">
            Showing {(paginationData.startIndex ?? 0) + 1} to {paginationData.endIndex ?? paginationData.totalItems} of {paginationData.totalItems} {itemName}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Items per page selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Show:</span>
            <Select
              value={perPage >= paginationData.totalItems ? "all" : perPage.toString()}
              onValueChange={(value) => {
                setPerPage(value === "all" ? paginationData.totalItems : Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Page navigation */}
          {paginationData.totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev: number) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, paginationData.totalPages) }, (_, i) => {
                  let pageNumber;
                  if (paginationData.totalPages <= 5) {
                    pageNumber = i + 1;
                  } else if (currentPage <= 3) {
                    pageNumber = i + 1;
                  } else if (currentPage >= paginationData.totalPages - 2) {
                    pageNumber = paginationData.totalPages - 4 + i;
                  } else {
                    pageNumber = currentPage - 2 + i;
                  }
                  
                  return (
                    <Button
                      key={pageNumber}
                      variant={currentPage === pageNumber ? "default" : "outline"}
                                            size="sm"
                      className="w-8 h-8 p-0"
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </Button>
                  );
                })}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev: number) => Math.min(paginationData.totalPages, prev + 1))}
                disabled={currentPage === paginationData.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Initialize stock sub-tab data after computed values are available
  useEffect(() => {
    if (onStockSubTabChange && !loadingMovements && stockData) {
      onStockSubTabChange(activeStockTab, filteredStockMovements, lowStockProducts, outOfStockProducts);
    }
  }, [activeStockTab, stockMovements, stockData, loadingMovements, movementsFilter, selectedMovementBrands, selectedMovementTypes, movementDateFilter]);

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'goods_receipt': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'sale': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'adjustment': return <Activity className="w-4 h-4 text-blue-600" />;
      case 'initial': return <Package className="w-4 h-4 text-blue-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'goods_receipt': return 'Stock In';
      case 'sale': return 'Sale';
      case 'adjustment': return 'Adjustment';
      case 'initial': return 'Opening Stock';
      default: return type || '-';
    }
  };

  const formatMovementSource = (referenceType: string, referenceId: number) => {
    if (!referenceType || !referenceId) return '-';
    switch (referenceType) {
      case 'goods_receipt': return `GRN #${referenceId}`;
      case 'invoice': return `INV #${referenceId}`;
      case 'stock_count': return `Count #${referenceId}`;
      case 'manual': return '-';
      default: return `${referenceType} #${referenceId}`;
    }
  };

  const formatMovementQuantity = (quantity: number) => {
    const isPositive = quantity > 0;
    const sign = isPositive ? '+' : '';
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    return (
      <span className={`font-semibold ${color}`}>
        {sign}{quantity}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stock Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Total Products</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stockSummary.totalProducts}</p>
              </div>
              <Package className="h-6 w-6 text-blue-500 flex-shrink-0 ml-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Total Units</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{stockSummary.totalQuantity.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-6 w-6 text-green-500 flex-shrink-0 ml-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Stock Value (at cost)</p>
                <p className="text-lg font-bold text-gray-900 mt-1 truncate">
                  AED {stockSummary.totalValue.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-6 w-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                <span className="text-green-600 text-xs font-bold">AED</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Low Stock</p>
                <p className="text-xl font-bold text-amber-600 mt-1">{stockSummary.lowStock}</p>
                <p className="text-xs text-gray-400 truncate">≤{companySettings?.lowStockThreshold || 6} units</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 ml-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Out of Stock</p>
                <p className="text-xl font-bold text-red-600 mt-1">{stockSummary.outOfStock}</p>
              </div>
              <div className="h-6 w-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                <span className="text-red-600 font-bold text-xs">!</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock Details */}
      <Tabs defaultValue="stock-levels" className="w-full" onValueChange={(value) => {
        setActiveStockTab(value);
        if (onStockSubTabChange) {
          onStockSubTabChange(value, filteredStockMovements, lowStockProducts, outOfStockProducts);
        }
      }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stock-levels">Current Stock</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
          <TabsTrigger value="out-of-stock">Out of Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="stock-levels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
              <p className="text-sm text-gray-600">Stock quantities reflect goods received. Sales deductions applied on delivery.</p>
            </CardHeader>
            <CardContent>
              {/* Search and Filters */}
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by product name, code or brand..."
                    value={currentStockFilter}
                    onChange={(e) => {
                      setCurrentStockFilter(e.target.value);
                      resetPagination('current-stock');
                    }}
                    className="max-w-sm"
                  />
                </div>

                {/* Advanced Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  
                  {/* Brand Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-40">
                        {selectedStockBrands.length === 0 ? "All Brands" : `${selectedStockBrands.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Brands</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueStockBrands.map((brand: string) => (
                            <div key={brand} className="flex items-center space-x-2">
                              <Checkbox
                                id={`stock-brand-${brand}`}
                                checked={selectedStockBrands.includes(brand)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedStockBrands(prev => [...prev, brand]);
                                  } else {
                                    setSelectedStockBrands(prev => prev.filter((b: string) => b !== brand));
                                  }
                                  resetPagination('current-stock');
                                }}
                              />
                              <label
                                htmlFor={`stock-brand-${brand}`}
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
                        {selectedStockSizes.length === 0 ? "All Sizes" : `${selectedStockSizes.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Sizes</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueStockSizes.map((size: string) => (
                            <div key={size} className="flex items-center space-x-2">
                              <Checkbox
                                id={`stock-size-${size}`}
                                checked={selectedStockSizes.includes(size)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedStockSizes(prev => [...prev, size]);
                                  } else {
                                    setSelectedStockSizes(prev => prev.filter((s: string) => s !== size));
                                  }
                                  resetPagination('current-stock');
                                }}
                              />
                              <label
                                htmlFor={`stock-size-${size}`}
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

                  {/* Status Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-40">
                        {selectedStockStatus.length === 0 ? "All Status" : `${selectedStockStatus.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Status</h4>
                        <div className="space-y-2">
                          {[
                            { value: 'in-stock', label: 'In Stock' },
                            { value: 'low-stock', label: 'Low Stock' },
                            { value: 'out-of-stock', label: 'Out of Stock' }
                          ].map((status: { value: string; label: string }) => (
                            <div key={status.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`stock-status-${status.value}`}
                                checked={selectedStockStatus.includes(status.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedStockStatus(prev => [...prev, status.value]);
                                  } else {
                                    setSelectedStockStatus(prev => prev.filter((s: string) => s !== status.value));
                                  }
                                  resetPagination('current-stock');
                                }}
                              />
                              <label
                                htmlFor={`stock-status-${status.value}`}
                                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {status.label}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Stock Level Range */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-44">
                        {stockLevelFilter.min || stockLevelFilter.max ? 
                          `${stockLevelFilter.min || '0'} - ${stockLevelFilter.max || '∞'}` : 
                          "Stock Level Range"
                        }
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Stock Level Range</h4>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Min"
                            type="number"
                            min="0"
                            value={stockLevelFilter.min}
                            onChange={(e) => {
                              setStockLevelFilter(prev => ({ ...prev, min: e.target.value }));
                              resetPagination('current-stock');
                            }}
                            className="w-20"
                          />
                          <span className="text-gray-500">to</span>
                          <Input
                            placeholder="Max"
                            type="number"
                            min="0"
                            value={stockLevelFilter.max}
                            onChange={(e) => {
                              setStockLevelFilter(prev => ({ ...prev, max: e.target.value }));
                              resetPagination('current-stock');
                            }}
                            className="w-20"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  {/* Clear Filters Button */}
                  {(selectedStockBrands.length > 0 || selectedStockSizes.length > 0 || selectedStockStatus.length > 0 || stockLevelFilter.min || stockLevelFilter.max) && (
                    <Button 
                      variant="ghost" 
                                              size="sm"
                      onClick={() => {
                        setSelectedStockBrands([]);
                        setSelectedStockSizes([]);
                        setSelectedStockStatus([]);
                        setStockLevelFilter({ min: "", max: "" });
                        resetPagination('current-stock');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Active Filter Badges */}
                {(selectedStockBrands.length > 0 || selectedStockSizes.length > 0 || selectedStockStatus.length > 0 || stockLevelFilter.min || stockLevelFilter.max) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-600">Active filters:</span>
                    {selectedStockBrands.map((brand: string) => (
                      <Badge key={brand} variant="secondary" className="gap-1">
                        Brand: {brand}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedStockBrands(prev => prev.filter((b: string) => b !== brand));
                            resetPagination('current-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {selectedStockSizes.map((size: string) => (
                      <Badge key={size} variant="secondary" className="gap-1">
                        Size: {size}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedStockSizes(prev => prev.filter((s: string) => s !== size));
                            resetPagination('current-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {selectedStockStatus.map((status: string) => (
                      <Badge key={status} variant="secondary" className="gap-1">
                        Status: {status.replace('-', ' ')}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedStockStatus(prev => prev.filter((s: string) => s !== status));
                            resetPagination('current-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {(stockLevelFilter.min || stockLevelFilter.max) && (
                      <Badge variant="secondary" className="gap-1">
                        Stock: {stockLevelFilter.min || '0'} - {stockLevelFilter.max || '∞'}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setStockLevelFilter({ min: "", max: "" });
                            resetPagination('current-stock');
                          }}
                        />
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedCurrentStock.data.map((product: StockProduct) => {
                    const stock = product.stockQuantity || 0;
                    const lowStockThreshold = companySettings?.lowStockThreshold || 6;
                    const status = stock === 0 ? 'out' : stock <= lowStockThreshold ? 'low' : 'ok';
                    
                    return (
                      <TableRow key={product.id}>
                        <TableCell>{product.brandName || '-'}</TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.size || '-'}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={status === 'out' ? 'destructive' : status === 'low' ? 'secondary' : 'default'}
                            className={status === 'ok' ? 'bg-green-100 text-green-800' : ''}
                          >
                            {stock.toLocaleString()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {status === 'out' && <Badge variant="destructive">Out of Stock</Badge>}
                          {status === 'low' && <Badge variant="secondary">Low Stock</Badge>}
                          {status === 'ok' && <Badge className="bg-green-100 text-green-800">In Stock</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              
              <PaginationControls
                paginationData={paginatedCurrentStock}
                currentPage={currentStockPage}
                setPage={setCurrentStockPage}
                perPage={stockLevelsPerPage}
                setPerPage={setStockLevelsPerPage}
                type="current-stock"
                itemName="products"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Recent Stock Movements ({paginatedMovements.totalItems})
                </CardTitle>
                <Button variant="outline" size="sm" onClick={loadStockMovements} disabled={loadingMovements}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${loadingMovements ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-sm text-gray-600">Full history of stock changes — goods receipts, sales, adjustments and corrections</p>
              {stockMovements.length >= 500 && (
                <p className="text-xs text-gray-500 mt-1">Showing the latest 500 movements</p>
              )}
            </CardHeader>
            <CardContent>
              {/* Search and Filters */}
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by product, movement type, or notes..."
                    value={movementsFilter}
                    onChange={(e) => {
                      setMovementsFilter(e.target.value);
                      resetPagination('movements');
                    }}
                    className="max-w-sm"
                  />
                </div>

                {/* Advanced Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  
                  {/* Brand Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-40">
                        {selectedMovementBrands.length === 0 ? "All Brands" : `${selectedMovementBrands.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Brands</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueMovementBrands.map((brand: string) => (
                            <div key={brand} className="flex items-center space-x-2">
                              <Checkbox
                                id={`movement-brand-${brand}`}
                                checked={selectedMovementBrands.includes(brand)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedMovementBrands(prev => [...prev, brand]);
                                  } else {
                                    setSelectedMovementBrands(prev => prev.filter((b: string) => b !== brand));
                                  }
                                  resetPagination('movements');
                                }}
                              />
                              <label
                                htmlFor={`movement-brand-${brand}`}
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
                  
                  {/* Movement Type Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-52">
                        {selectedMovementTypes.length === 0 ? "All Movement Types" : `${selectedMovementTypes.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Movement Types</h4>
                        <div className="space-y-2">
                          {uniqueMovementTypes.map((type: string) => (
                            <div key={type} className="flex items-center space-x-2">
                              <Checkbox
                                id={`movement-type-${type}`}
                                checked={selectedMovementTypes.includes(type)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedMovementTypes(prev => [...prev, type]);
                                  } else {
                                    setSelectedMovementTypes(prev => prev.filter((t: string) => t !== type));
                                  }
                                  resetPagination('movements');
                                }}
                              />
                              <label
                                htmlFor={`movement-type-${type}`}
                                className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                              >
                                {getMovementTypeLabel(type)}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Date Range Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-44">
                        {movementDateFilter.start || movementDateFilter.end ? 
                          `${movementDateFilter.start ? format(new Date(movementDateFilter.start), 'dd/MM/yy') : 'Start'} - ${movementDateFilter.end ? format(new Date(movementDateFilter.end), 'dd/MM/yy') : 'End'}` : 
                          "Date Range"
                        }
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Date Range</h4>
                        <div className="space-y-2">
                          <Input
                            type="date"
                            placeholder="Start Date"
                            value={movementDateFilter.start}
                            onChange={(e) => {
                              setMovementDateFilter(prev => ({ ...prev, start: e.target.value }));
                              resetPagination('movements');
                            }}
                          />
                          <Input
                            type="date"
                            placeholder="End Date"
                            value={movementDateFilter.end}
                            onChange={(e) => {
                              setMovementDateFilter(prev => ({ ...prev, end: e.target.value }));
                              resetPagination('movements');
                            }}
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  
                  {/* Clear Filters Button */}
                  {(selectedMovementBrands.length > 0 || selectedMovementTypes.length > 0 || movementDateFilter.start || movementDateFilter.end) && (
                    <Button 
                      variant="ghost" 
                                              size="sm"
                      onClick={() => {
                        setSelectedMovementBrands([]);
                        setSelectedMovementTypes([]);
                        setMovementDateFilter({ start: "", end: "" });
                        resetPagination('movements');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Active Filter Badges */}
                {(selectedMovementBrands.length > 0 || selectedMovementTypes.length > 0 || movementDateFilter.start || movementDateFilter.end) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-600">Active filters:</span>
                    {selectedMovementBrands.map((brand: string) => (
                      <Badge key={brand} variant="secondary" className="gap-1">
                        Brand: {brand}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedMovementBrands(prev => prev.filter((b: string) => b !== brand));
                            resetPagination('movements');
                          }}
                        />
                      </Badge>
                    ))}
                    {selectedMovementTypes.map((type: string) => (
                      <Badge key={type} variant="secondary" className="gap-1">
                        Type: {getMovementTypeLabel(type)}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedMovementTypes(prev => prev.filter((t: string) => t !== type));
                            resetPagination('movements');
                          }}
                        />
                      </Badge>
                    ))}
                    {(movementDateFilter.start || movementDateFilter.end) && (
                      <Badge variant="secondary" className="gap-1">
                        Date: {movementDateFilter.start ? format(new Date(movementDateFilter.start), 'dd/MM/yy') : 'Start'} - {movementDateFilter.end ? format(new Date(movementDateFilter.end), 'dd/MM/yy') : 'End'}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setMovementDateFilter({ start: "", end: "" });
                            resetPagination('movements');
                          }}
                        />
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {loadingMovements ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Previous</TableHead>
                      <TableHead className="text-right">New Stock</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMovements.data.map((movement: StockMovement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="text-sm">
                          {format(new Date(movement.createdAt), 'dd/MM/yy')}
                        </TableCell>
                        <TableCell>{movement.brandName || '-'}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{movement.productName}</p>
                            <p className="text-xs text-gray-500">{movement.productSku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getMovementIcon(movement.movementType)}
                            <span className="text-sm">{getMovementTypeLabel(movement.movementType)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {formatMovementSource(movement.referenceType, movement.referenceId)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMovementQuantity(movement.quantity)}
                        </TableCell>
                        <TableCell className="text-right">{movement.previousStock}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{movement.newStock}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {movement.notes || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {paginatedMovements.totalItems === 0 && !loadingMovements && (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No stock movements recorded yet</p>
                  <p className="text-sm mt-2">Stock changes will appear here automatically</p>
                </div>
              )}
              
              {!loadingMovements && (
                <PaginationControls
                  paginationData={paginatedMovements}
                  currentPage={movementsPage}
                  setPage={setMovementsPage}
                  perPage={movementsPerPage}
                  setPerPage={setMovementsPerPage}
                  type="movements"
                  itemName="movements"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" />
                Low Stock Products ({paginatedLowStock.totalItems})
              </CardTitle>
              <p className="text-sm text-gray-600">Products with stock below the low stock threshold</p>
            </CardHeader>
            <CardContent>
              {/* Search and Filters */}
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by product name, code or brand..."
                    value={lowStockFilter}
                    onChange={(e) => {
                      setLowStockFilter(e.target.value);
                      resetPagination('low-stock');
                    }}
                    className="max-w-sm"
                  />
                </div>

                {/* Advanced Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  
                  {/* Brand Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-40">
                        {selectedLowStockBrands.length === 0 ? "All Brands" : `${selectedLowStockBrands.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Brands</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueLowStockBrands.map((brand: string) => (
                            <div key={brand} className="flex items-center space-x-2">
                              <Checkbox
                                id={`low-stock-brand-${brand}`}
                                checked={selectedLowStockBrands.includes(brand)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedLowStockBrands(prev => [...prev, brand]);
                                  } else {
                                    setSelectedLowStockBrands(prev => prev.filter((b: string) => b !== brand));
                                  }
                                  resetPagination('low-stock');
                                }}
                              />
                              <label
                                htmlFor={`low-stock-brand-${brand}`}
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
                      <Button variant="outline" className="justify-between w-36">
                        {selectedLowStockSizes.length === 0 ? "All Sizes" : `${selectedLowStockSizes.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Sizes</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueLowStockSizes.map((size: string) => (
                            <div key={size} className="flex items-center space-x-2">
                              <Checkbox
                                id={`low-stock-size-${size}`}
                                checked={selectedLowStockSizes.includes(size)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedLowStockSizes(prev => [...prev, size]);
                                  } else {
                                    setSelectedLowStockSizes(prev => prev.filter((s: string) => s !== size));
                                  }
                                  resetPagination('low-stock');
                                }}
                              />
                              <label
                                htmlFor={`low-stock-size-${size}`}
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
                  
                  {/* Current Stock Range */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-44">
                        {lowStockRange.min || lowStockRange.max ? 
                          `${lowStockRange.min || '0'} - ${lowStockRange.max || '∞'}` : 
                          "Current Stock"
                        }
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Current Stock Range</h4>
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Min"
                            type="number"
                            min="0"
                            value={lowStockRange.min}
                            onChange={(e) => {
                              setLowStockRange(prev => ({ ...prev, min: e.target.value }));
                              resetPagination('low-stock');
                            }}
                            className="w-20"
                          />
                          <span className="text-gray-500">to</span>
                          <Input
                            placeholder="Max"
                            type="number"
                            min="0"
                            value={lowStockRange.max}
                            onChange={(e) => {
                              setLowStockRange(prev => ({ ...prev, max: e.target.value }));
                              resetPagination('low-stock');
                            }}
                            className="w-20"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Clear Filters Button */}
                  {(selectedLowStockBrands.length > 0 || selectedLowStockSizes.length > 0 || lowStockRange.min || lowStockRange.max) && (
                    <Button 
                      variant="ghost" 
                                              size="sm"
                      onClick={() => {
                        setSelectedLowStockBrands([]);
                        setSelectedLowStockSizes([]);
                        setLowStockRange({ min: "", max: "" });
                        resetPagination('low-stock');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Active Filter Badges */}
                {(selectedLowStockBrands.length > 0 || selectedLowStockSizes.length > 0 || lowStockRange.min || lowStockRange.max) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-600">Active filters:</span>
                    {selectedLowStockBrands.map((brand: string) => (
                      <Badge key={brand} variant="secondary" className="gap-1">
                        Brand: {brand}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedLowStockBrands(prev => prev.filter((b: string) => b !== brand));
                            resetPagination('low-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {selectedLowStockSizes.map((size: string) => (
                      <Badge key={size} variant="secondary" className="gap-1">
                        Size: {size}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedLowStockSizes(prev => prev.filter((s: string) => s !== size));
                            resetPagination('low-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {(lowStockRange.min || lowStockRange.max) && (
                      <Badge variant="secondary" className="gap-1">
                        Stock: {lowStockRange.min || '0'} – {lowStockRange.max || '∞'}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setLowStockRange({ min: "", max: "" });
                            resetPagination('low-stock');
                          }}
                        />
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLowStock.data.map((product: StockProduct) => (
                    <TableRow key={product.id}>
                      <TableCell>{product.brandName || '-'}</TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell>{product.size || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-amber-600">
                          {(product.stockQuantity || 0).toLocaleString()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {paginatedLowStock.totalItems === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No products with low stock</p>
                  <p className="text-sm mt-2">All products are above the low stock threshold</p>
                </div>
              )}
              
              <PaginationControls
                paginationData={paginatedLowStock}
                currentPage={lowStockPage}
                setPage={setLowStockPage}
                perPage={lowStockPerPage}
                setPerPage={setLowStockPerPage}
                type="low-stock"
                itemName="products"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out-of-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Out of Stock Products ({paginatedOutOfStock.totalItems})
              </CardTitle>
              <p className="text-sm text-gray-600">Products with zero stock quantity</p>
            </CardHeader>
            <CardContent>
              {/* Search and Filters */}
              <div className="space-y-4 mb-6">
                {/* Search Bar */}
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by product name, code or brand..."
                    value={outOfStockFilter}
                    onChange={(e) => {
                      setOutOfStockFilter(e.target.value);
                      resetPagination('out-of-stock');
                    }}
                    className="max-w-sm"
                  />
                </div>

                {/* Advanced Filters */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Filter className="w-4 h-4 text-gray-400" />
                  
                  {/* Brand Filter */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-between w-40">
                        {selectedOutOfStockBrands.length === 0 ? "All Brands" : `${selectedOutOfStockBrands.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Brands</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueStockBrands.map((brand: string) => (
                            <div key={brand} className="flex items-center space-x-2">
                              <Checkbox
                                id={`out-of-stock-brand-${brand}`}
                                checked={selectedOutOfStockBrands.includes(brand)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedOutOfStockBrands(prev => [...prev, brand]);
                                  } else {
                                    setSelectedOutOfStockBrands(prev => prev.filter((b: string) => b !== brand));
                                  }
                                  resetPagination('out-of-stock');
                                }}
                              />
                              <label
                                htmlFor={`out-of-stock-brand-${brand}`}
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
                      <Button variant="outline" className="justify-between w-36">
                        {selectedOutOfStockSizes.length === 0 ? "All Sizes" : `${selectedOutOfStockSizes.length} selected`}
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-60 p-4">
                      <div className="space-y-3">
                        <h4 className="font-medium leading-none">Select Sizes</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {uniqueStockSizes.map((size: string) => (
                            <div key={size} className="flex items-center space-x-2">
                              <Checkbox
                                id={`out-of-stock-size-${size}`}
                                checked={selectedOutOfStockSizes.includes(size)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedOutOfStockSizes(prev => [...prev, size]);
                                  } else {
                                    setSelectedOutOfStockSizes(prev => prev.filter((s: string) => s !== size));
                                  }
                                  resetPagination('out-of-stock');
                                }}
                              />
                              <label
                                htmlFor={`out-of-stock-size-${size}`}
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
                  
                  {/* Clear Filters Button */}
                  {(selectedOutOfStockBrands.length > 0 || selectedOutOfStockSizes.length > 0) && (
                    <Button 
                      variant="ghost" 
                                              size="sm"
                      onClick={() => {
                        setSelectedOutOfStockBrands([]);
                        setSelectedOutOfStockSizes([]);
                        resetPagination('out-of-stock');
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>

                {/* Active Filter Badges */}
                {(selectedOutOfStockBrands.length > 0 || selectedOutOfStockSizes.length > 0) && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-gray-600">Active filters:</span>
                    {selectedOutOfStockBrands.map((brand: string) => (
                      <Badge key={brand} variant="secondary" className="gap-1">
                        Brand: {brand}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedOutOfStockBrands(prev => prev.filter((b: string) => b !== brand));
                            resetPagination('out-of-stock');
                          }}
                        />
                      </Badge>
                    ))}
                    {selectedOutOfStockSizes.map((size: string) => (
                      <Badge key={size} variant="secondary" className="gap-1">
                        Size: {size}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => {
                            setSelectedOutOfStockSizes(prev => prev.filter((s: string) => s !== size));
                            resetPagination('out-of-stock');
                          }}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Current Stock</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOutOfStock.data.map((product: StockProduct) => {
                    return (
                      <TableRow key={product.id}>
                        <TableCell>{product.brandName || '-'}</TableCell>
                        <TableCell>{product.sku}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>{product.size || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">
                            0
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="destructive">Out of Stock</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {paginatedOutOfStock.totalItems === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No products out of stock</p>
                  <p className="text-sm mt-2">All products have stock available</p>
                </div>
              )}
              
              <PaginationControls
                paginationData={paginatedOutOfStock}
                currentPage={outOfStockPage}
                setPage={setOutOfStockPage}
                perPage={outOfStockPerPage}
                setPerPage={setOutOfStockPerPage}
                type="out-of-stock"
                itemName="products"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}