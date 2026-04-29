import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Search, Filter, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationControls } from "./PaginationControls";
import type { StockProduct, CompanySettings } from "./types";

interface PaginatedStock {
  data: StockProduct[];
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

interface CurrentStockTabProps {
  paginatedCurrentStock: PaginatedStock;
  companySettings: CompanySettings | null;
  uniqueStockBrands: string[];
  uniqueStockSizes: string[];
  currentStockFilter: string;
  setCurrentStockFilter: React.Dispatch<React.SetStateAction<string>>;
  selectedStockBrands: string[];
  setSelectedStockBrands: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStockSizes: string[];
  setSelectedStockSizes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStockStatus: string[];
  setSelectedStockStatus: React.Dispatch<React.SetStateAction<string[]>>;
  stockLevelFilter: { min: string; max: string };
  setStockLevelFilter: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>;
  currentStockPage: number;
  setCurrentStockPage: React.Dispatch<React.SetStateAction<number>>;
  stockLevelsPerPage: number;
  setStockLevelsPerPage: React.Dispatch<React.SetStateAction<number>>;
  resetPagination: (type: string) => void;
}

export function CurrentStockTab({
  paginatedCurrentStock,
  companySettings,
  uniqueStockBrands,
  uniqueStockSizes,
  currentStockFilter,
  setCurrentStockFilter,
  selectedStockBrands,
  setSelectedStockBrands,
  selectedStockSizes,
  setSelectedStockSizes,
  selectedStockStatus,
  setSelectedStockStatus,
  stockLevelFilter,
  setStockLevelFilter,
  currentStockPage,
  setCurrentStockPage,
  stockLevelsPerPage,
  setStockLevelsPerPage,
  resetPagination,
}: CurrentStockTabProps) {
  return (
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
            itemName="products"
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
