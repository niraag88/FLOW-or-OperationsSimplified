import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabsContent } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Package, Activity, History, Search, Filter, ChevronDown, X, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { PaginationControls } from "./PaginationControls";
import type { StockMovement } from "./types";

interface PaginatedMovements {
  data: StockMovement[];
  totalPages: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

interface MovementsTabProps {
  paginatedMovements: PaginatedMovements;
  stockMovements: StockMovement[];
  loadingMovements: boolean;
  loadStockMovements: () => void;
  uniqueMovementBrands: string[];
  uniqueMovementTypes: string[];
  movementsFilter: string;
  setMovementsFilter: React.Dispatch<React.SetStateAction<string>>;
  selectedMovementBrands: string[];
  setSelectedMovementBrands: React.Dispatch<React.SetStateAction<string[]>>;
  selectedMovementTypes: string[];
  setSelectedMovementTypes: React.Dispatch<React.SetStateAction<string[]>>;
  movementDateFilter: { start: string; end: string };
  setMovementDateFilter: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
  movementsPage: number;
  setMovementsPage: React.Dispatch<React.SetStateAction<number>>;
  movementsPerPage: number;
  setMovementsPerPage: React.Dispatch<React.SetStateAction<number>>;
  resetPagination: (type: string) => void;
}

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

export function MovementsTab({
  paginatedMovements,
  stockMovements,
  loadingMovements,
  loadStockMovements,
  uniqueMovementBrands,
  uniqueMovementTypes,
  movementsFilter,
  setMovementsFilter,
  selectedMovementBrands,
  setSelectedMovementBrands,
  selectedMovementTypes,
  setSelectedMovementTypes,
  movementDateFilter,
  setMovementDateFilter,
  movementsPage,
  setMovementsPage,
  movementsPerPage,
  setMovementsPerPage,
  resetPagination,
}: MovementsTabProps) {
  return (
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
  );
}
