import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { StockProduct, StockMovement, StockData, CompanySettings } from "./stock/types";
import { applyAdvancedStockFilters, applyAdvancedMovementFilters, paginateData } from "./stock/filterUtils";
import { StockSummaryCards } from "./stock/StockSummaryCards";
import { CurrentStockTab } from "./stock/CurrentStockTab";
import { MovementsTab } from "./stock/MovementsTab";
import { LowStockTab } from "./stock/LowStockTab";
import { OutOfStockTab } from "./stock/OutOfStockTab";

interface StockTabProps {
  products: StockProduct[];
  loading: boolean;
  onStockSubTabChange: (tab: string, ...args: unknown[]) => void;
  canEdit: boolean;
  currentUser?: { email?: string; role?: string } | null;
  onRefresh: () => void;
}

export default function StockTab({ products, loading, onStockSubTabChange }: StockTabProps) {
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
      setCompanySettings({ lowStockThreshold: 6, fxGbpToAed: 4.85, fxUsdToAed: 3.6725, fxInrToAed: 0.044 });
    }
  };

  // Note: per-product AED cost conversion is handled server-side in /api/products/stock-analysis
  // using all three rates (GBP/USD/INR) from company settings. The stockSummary.totalValue
  // is already in AED. All three rates are stored here for any future client-side cost display.

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
    totalValue: stockData.stockSummary.totalValue,
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

  const lowStockThreshold = companySettings?.lowStockThreshold || 6;

  // Apply filters
  const filteredProducts = applyAdvancedStockFilters(
    allProducts,
    currentStockFilter,
    selectedStockBrands,
    selectedStockSizes,
    selectedStockStatus,
    stockLevelFilter,
    lowStockThreshold,
  );
  const filteredLowStockProducts = applyAdvancedStockFilters(
    lowStockProducts,
    lowStockFilter,
    selectedLowStockBrands,
    selectedLowStockSizes,
    [],
    lowStockRange,
    lowStockThreshold,
  );
  const filteredOutOfStockProducts = applyAdvancedStockFilters(
    outOfStockProducts,
    outOfStockFilter,
    selectedOutOfStockBrands,
    selectedOutOfStockSizes,
    [],
    { min: "", max: "" },
    lowStockThreshold,
  );
  const filteredStockMovements = applyAdvancedMovementFilters(
    stockMovements,
    movementsFilter,
    selectedMovementBrands,
    selectedMovementTypes,
    movementDateFilter,
  );

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

  // Initialize stock sub-tab data after computed values are available
  useEffect(() => {
    if (onStockSubTabChange && !loadingMovements && stockData) {
      onStockSubTabChange(activeStockTab, filteredStockMovements, lowStockProducts, outOfStockProducts);
    }
  }, [activeStockTab, stockMovements, stockData, loadingMovements, movementsFilter, selectedMovementBrands, selectedMovementTypes, movementDateFilter]);

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

  // loadingStock is referenced to avoid unused-variable lint while keeping the state for future use
  void loadingStock;

  return (
    <div className="space-y-6">
      {/* Stock Summary Cards */}
      <StockSummaryCards stockSummary={stockSummary} companySettings={companySettings} />

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

        <CurrentStockTab
          paginatedCurrentStock={paginatedCurrentStock}
          companySettings={companySettings}
          uniqueStockBrands={uniqueStockBrands}
          uniqueStockSizes={uniqueStockSizes}
          currentStockFilter={currentStockFilter}
          setCurrentStockFilter={setCurrentStockFilter}
          selectedStockBrands={selectedStockBrands}
          setSelectedStockBrands={setSelectedStockBrands}
          selectedStockSizes={selectedStockSizes}
          setSelectedStockSizes={setSelectedStockSizes}
          selectedStockStatus={selectedStockStatus}
          setSelectedStockStatus={setSelectedStockStatus}
          stockLevelFilter={stockLevelFilter}
          setStockLevelFilter={setStockLevelFilter}
          currentStockPage={currentStockPage}
          setCurrentStockPage={setCurrentStockPage}
          stockLevelsPerPage={stockLevelsPerPage}
          setStockLevelsPerPage={setStockLevelsPerPage}
          resetPagination={resetPagination}
        />

        <MovementsTab
          paginatedMovements={paginatedMovements}
          stockMovements={stockMovements}
          loadingMovements={loadingMovements}
          loadStockMovements={loadStockMovements}
          uniqueMovementBrands={uniqueMovementBrands}
          uniqueMovementTypes={uniqueMovementTypes}
          movementsFilter={movementsFilter}
          setMovementsFilter={setMovementsFilter}
          selectedMovementBrands={selectedMovementBrands}
          setSelectedMovementBrands={setSelectedMovementBrands}
          selectedMovementTypes={selectedMovementTypes}
          setSelectedMovementTypes={setSelectedMovementTypes}
          movementDateFilter={movementDateFilter}
          setMovementDateFilter={setMovementDateFilter}
          movementsPage={movementsPage}
          setMovementsPage={setMovementsPage}
          movementsPerPage={movementsPerPage}
          setMovementsPerPage={setMovementsPerPage}
          resetPagination={resetPagination}
        />

        <LowStockTab
          paginatedLowStock={paginatedLowStock}
          uniqueLowStockBrands={uniqueLowStockBrands}
          uniqueLowStockSizes={uniqueLowStockSizes}
          lowStockFilter={lowStockFilter}
          setLowStockFilter={setLowStockFilter}
          selectedLowStockBrands={selectedLowStockBrands}
          setSelectedLowStockBrands={setSelectedLowStockBrands}
          selectedLowStockSizes={selectedLowStockSizes}
          setSelectedLowStockSizes={setSelectedLowStockSizes}
          lowStockRange={lowStockRange}
          setLowStockRange={setLowStockRange}
          lowStockPage={lowStockPage}
          setLowStockPage={setLowStockPage}
          lowStockPerPage={lowStockPerPage}
          setLowStockPerPage={setLowStockPerPage}
          resetPagination={resetPagination}
        />

        <OutOfStockTab
          paginatedOutOfStock={paginatedOutOfStock}
          uniqueStockBrands={uniqueStockBrands}
          uniqueStockSizes={uniqueStockSizes}
          outOfStockFilter={outOfStockFilter}
          setOutOfStockFilter={setOutOfStockFilter}
          selectedOutOfStockBrands={selectedOutOfStockBrands}
          setSelectedOutOfStockBrands={setSelectedOutOfStockBrands}
          selectedOutOfStockSizes={selectedOutOfStockSizes}
          setSelectedOutOfStockSizes={setSelectedOutOfStockSizes}
          outOfStockPage={outOfStockPage}
          setOutOfStockPage={setOutOfStockPage}
          outOfStockPerPage={outOfStockPerPage}
          setOutOfStockPerPage={setOutOfStockPerPage}
          resetPagination={resetPagination}
        />
      </Tabs>
    </div>
  );
}
