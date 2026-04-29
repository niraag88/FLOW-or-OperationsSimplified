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

interface OutOfStockTabProps {
  paginatedOutOfStock: PaginatedStock;
  uniqueStockBrands: string[];
  uniqueStockSizes: string[];
  outOfStockFilter: string;
  setOutOfStockFilter: React.Dispatch<React.SetStateAction<string>>;
  selectedOutOfStockBrands: string[];
  setSelectedOutOfStockBrands: React.Dispatch<React.SetStateAction<string[]>>;
  selectedOutOfStockSizes: string[];
  setSelectedOutOfStockSizes: React.Dispatch<React.SetStateAction<string[]>>;
  outOfStockPage: number;
  setOutOfStockPage: React.Dispatch<React.SetStateAction<number>>;
  outOfStockPerPage: number;
  setOutOfStockPerPage: React.Dispatch<React.SetStateAction<number>>;
  resetPagination: (type: string) => void;
}

export function OutOfStockTab({
  paginatedOutOfStock,
  uniqueStockBrands,
  uniqueStockSizes,
  outOfStockFilter,
  setOutOfStockFilter,
  selectedOutOfStockBrands,
  setSelectedOutOfStockBrands,
  selectedOutOfStockSizes,
  setSelectedOutOfStockSizes,
  outOfStockPage,
  setOutOfStockPage,
  outOfStockPerPage,
  setOutOfStockPerPage,
  resetPagination,
}: OutOfStockTabProps) {
  return (
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
            itemName="products"
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
