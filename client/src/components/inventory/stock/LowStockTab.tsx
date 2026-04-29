import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { Package, AlertTriangle, Search, Filter, ChevronDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationControls } from "./PaginationControls";
import type { StockProduct } from "./types";

interface PaginatedStock {
  data: StockProduct[];
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

interface LowStockTabProps {
  paginatedLowStock: PaginatedStock;
  uniqueLowStockBrands: string[];
  uniqueLowStockSizes: string[];
  lowStockFilter: string;
  setLowStockFilter: React.Dispatch<React.SetStateAction<string>>;
  selectedLowStockBrands: string[];
  setSelectedLowStockBrands: React.Dispatch<React.SetStateAction<string[]>>;
  selectedLowStockSizes: string[];
  setSelectedLowStockSizes: React.Dispatch<React.SetStateAction<string[]>>;
  lowStockRange: { min: string; max: string };
  setLowStockRange: React.Dispatch<React.SetStateAction<{ min: string; max: string }>>;
  lowStockPage: number;
  setLowStockPage: React.Dispatch<React.SetStateAction<number>>;
  lowStockPerPage: number;
  setLowStockPerPage: React.Dispatch<React.SetStateAction<number>>;
  resetPagination: (type: string) => void;
}

export function LowStockTab({
  paginatedLowStock,
  uniqueLowStockBrands,
  uniqueLowStockSizes,
  lowStockFilter,
  setLowStockFilter,
  selectedLowStockBrands,
  setSelectedLowStockBrands,
  selectedLowStockSizes,
  setSelectedLowStockSizes,
  lowStockRange,
  setLowStockRange,
  lowStockPage,
  setLowStockPage,
  lowStockPerPage,
  setLowStockPerPage,
  resetPagination,
}: LowStockTabProps) {
  return (
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
  );
}
