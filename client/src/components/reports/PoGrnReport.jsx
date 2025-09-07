import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Filter, X, Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ExportDropdown from "../common/ExportDropdown";
import { Brand } from "@/api/entities";

export default function PoGrnReport({ purchaseOrders, goodsReceipts, canExport }) {
  const [brands, setBrands] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [dateRange, setDateRange] = useState("all");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [grnCurrentPage, setGrnCurrentPage] = useState(1);
  const [grnItemsPerPage, setGrnItemsPerPage] = useState(20);

  useEffect(() => {
    loadBrands();
  }, []);

  const loadBrands = async () => {
    try {
      const brandsData = await Brand.list();
      setBrands(brandsData);
    } catch (error) {
      console.error("Error loading brands:", error);
    }
  };

  const getBrandName = (brandId) => {
    const brand = brands.find(s => s.id === brandId);
    return brand?.name || 'Unknown Brand';
  };

  // Currency formatting - matching POList exactly
  const formatCurrency = (amount, currency) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const numericAmount = parseFloat(amount) || 0;
    return `${currency} ${formatter.format(numericAmount)}`;
  };

  // Calculate AED equivalent - matching POList exactly
  const calculateAEDAmount = (gbpAmount) => {
    const exchangeRate = 5.00; // Same as POList
    const numericAmount = parseFloat(gbpAmount) || 0;
    return numericAmount * exchangeRate;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : new Date(dateString);
      return date && !isNaN(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      return '-';
    }
  };

  const clearFilters = () => {
    setSelectedStatuses([]);
    setSelectedSuppliers([]);
    setDateRange("all");
    setCustomStartDate(null);
    setCustomEndDate(null);
    resetPagination();
  };

  const hasActiveFilters = selectedStatuses.length > 0 || selectedSuppliers.length > 0 || dateRange !== "all";

  // Get unique statuses
  const uniqueStatuses = [...new Set(purchaseOrders.map(po => po.status).filter(Boolean))].sort();

  const handleDateRangeChange = (value) => {
    if (value !== 'custom') {
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
    setDateRange(value);
    resetPagination();
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const customRange = {
        type: 'custom',
        startDate: customStartDate,
        endDate: customEndDate
      };
      setDateRange(customRange);
      setDateRangeOpen(false);
    }
  };

  const formatCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      return `${format(customStartDate, 'MMM dd')} - ${format(customEndDate, 'MMM dd')}`;
    }
    return 'Pick date range';
  };

  // Filter purchase orders
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(po.status);
      const matchesSupplier = selectedSuppliers.length === 0 || selectedSuppliers.includes((po.supplierId || po.supplier_id));
      
      // Date range filtering
      let matchesDateRange = true;
      if (dateRange !== "all") {
        const dateValue = po.orderDate || po.order_date;
        if (!dateValue) return false;
        
        const poDate = new Date(dateValue);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (dateRange === "today") {
          const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
          matchesDateRange = poDate >= startOfToday && poDate <= endOfToday;
        } else if (dateRange === "week") {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          matchesDateRange = poDate >= startOfWeek;
        } else if (dateRange === "month") {
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDateRange = poDate >= startOfMonth;
        } else if (dateRange === "quarter") {
          const quarter = Math.floor(today.getMonth() / 3);
          const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
          matchesDateRange = poDate >= startOfQuarter;
        } else if (typeof dateRange === "object" && dateRange.type === "custom") {
          const startDate = new Date(dateRange.startDate);
          const endDate = new Date(dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          matchesDateRange = poDate >= startDate && poDate <= endDate;
        }
      }
      
      return matchesStatus && matchesSupplier && matchesDateRange;
    });
  }, [purchaseOrders, selectedStatuses, selectedSuppliers, dateRange]);

  // Filter goods receipts - combine submitted and closed POs (like Purchase Orders page)
  const filteredGRNs = useMemo(() => {
    // Goods receipts are actually POs with submitted or closed status
    const goodsReceiptPOs = purchaseOrders.filter(po => 
      po.status === 'submitted' || po.status === 'closed'
    );
    
    return goodsReceiptPOs.filter(po => {
      const matchesSupplier = selectedSuppliers.length === 0 || selectedSuppliers.includes((po.supplierId || po.supplier_id));
      
      // Date range filtering using order date
      let matchesDateRange = true;
      if (dateRange !== "all") {
        const dateValue = po.orderDate || po.order_date;
        if (!dateValue) return false;
        
        const poDate = new Date(dateValue);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (dateRange === "today") {
          const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
          matchesDateRange = poDate >= startOfToday && poDate <= endOfToday;
        } else if (dateRange === "week") {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          matchesDateRange = poDate >= startOfWeek;
        } else if (dateRange === "month") {
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDateRange = poDate >= startOfMonth;
        } else if (dateRange === "quarter") {
          const quarter = Math.floor(today.getMonth() / 3);
          const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
          matchesDateRange = poDate >= startOfQuarter;
        } else if (typeof dateRange === "object" && dateRange.type === "custom") {
          const startDate = new Date(dateRange.startDate);
          const endDate = new Date(dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          matchesDateRange = poDate >= startDate && poDate <= endDate;
        }
      }
      
      return matchesSupplier && matchesDateRange;
    });
  }, [purchaseOrders, selectedSuppliers, dateRange]);

  // Calculate totals - using POList logic exactly
  const totals = useMemo(() => {
    const poTotals = filteredPOs.reduce((acc, po) => {
      // Use totalAmount for GBP (same as POList)
      const gbpAmount = Number(po.totalAmount || 0);
      const aedAmount = calculateAEDAmount(gbpAmount);
      
      acc.totalGBP += gbpAmount;
      acc.totalAED += aedAmount;
      return acc;
    }, { totalGBP: 0, totalAED: 0 });

    return {
      pos: filteredPOs.length,
      grns: filteredGRNs.length,
      totalValueGBP: poTotals.totalGBP,
      totalValueAED: poTotals.totalAED
    };
  }, [filteredPOs, filteredGRNs]);

  // Pagination logic for POs
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPOs = filteredPOs.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredPOs.length / itemsPerPage);

  // Pagination logic for GRNs
  const grnStartIndex = (grnCurrentPage - 1) * grnItemsPerPage;
  const grnEndIndex = grnStartIndex + grnItemsPerPage;
  const paginatedGRNs = filteredGRNs.slice(grnStartIndex, grnEndIndex);
  const grnTotalPages = Math.ceil(filteredGRNs.length / grnItemsPerPage);

  const resetPagination = () => {
    setCurrentPage(1);
    setGrnCurrentPage(1);
  };

  // Prepare export data - using POList logic
  const exportData = [
    // Add PO data
    ...filteredPOs.map(po => {
      const gbpAmount = Number(po.totalAmount || 0);
      const aedAmount = calculateAEDAmount(gbpAmount);
      
      return {
        type: 'Purchase Order',
        document_number: po.poNumber || po.po_number,
        date: formatDate(po.orderDate || po.order_date),
        brand_supplier: getBrandName(po.supplierId || po.supplier_id),
        currency: 'GBP',
        total_gbp: gbpAmount.toFixed(2),
        total_aed: aedAmount.toFixed(2),
        status: po.status
      };
    }),
    // Add GRN data (submitted/closed POs)
    ...filteredGRNs.map(po => {
      const gbpAmount = Number(po.totalAmount || 0);
      const aedAmount = calculateAEDAmount(gbpAmount);
      
      return {
        type: 'Goods Receipt',
        document_number: `GRN-${po.poNumber || po.po_number}`,
        date: po.status === 'closed' 
          ? formatDate(po.updatedAt || po.updated_at) 
          : '-',
        brand_supplier: getBrandName(po.supplierId || po.supplier_id),
        currency: 'GBP',
        total_gbp: gbpAmount.toFixed(2),
        total_aed: aedAmount.toFixed(2),
        status: po.status === 'submitted' ? 'Open' : 'Closed'
      };
    })
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Purchase Orders vs Goods Receipts</CardTitle>
            <p className="text-sm text-gray-500">Compare PO creation with actual goods receipts.</p>
          </div>
          {canExport && (
            <ExportDropdown 
              data={exportData}
              type="PO vs GRN Report"
              filename={`PO_GRN_Report_${dateRange === 'all' ? 'All_Time' : 'Filtered'}`}
              columns={{
                type: 'Type',
                document_number: 'Document Number',
                date: 'Date',
                brand_supplier: 'Brand/Supplier',
                currency: 'Currency',
                total_gbp: 'Total (GBP)',
                total_aed: 'Total (AED)',
                status: 'Status'
              }}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters - using the same pattern as POFilters */}
          <div className="flex items-center gap-3">
            <Filter className="w-4 h-4 text-gray-500" />
            
            {/* Status Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between w-36">
                  {selectedStatuses.length === 0 ? "All Status" : `${selectedStatuses.length} selected`}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-4">
                <div className="space-y-3">
                  <h4 className="font-medium leading-none">Select Status</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uniqueStatuses.map(status => (
                      <div key={status} className="flex items-center space-x-2">
                        <Checkbox
                          id={`status-${status}`}
                          checked={selectedStatuses.includes(status)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedStatuses(prev => [...prev, status]);
                            } else {
                              setSelectedStatuses(prev => prev.filter(s => s !== status));
                            }
                            resetPagination();
                          }}
                        />
                        <label
                          htmlFor={`status-${status}`}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer capitalize"
                        >
                          {status}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Supplier Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between w-48">
                  {selectedSuppliers.length === 0 ? "All Brands" : `${selectedSuppliers.length} selected`}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-4">
                <div className="space-y-3">
                  <h4 className="font-medium leading-none">Select Brands</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {brands.map(brand => (
                      <div key={brand.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`brand-${brand.id}`}
                          checked={selectedSuppliers.includes(brand.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedSuppliers(prev => [...prev, brand.id]);
                            } else {
                              setSelectedSuppliers(prev => prev.filter(id => id !== brand.id));
                            }
                            resetPagination();
                          }}
                        />
                        <label
                          htmlFor={`brand-${brand.id}`}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {brand.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Select value={typeof dateRange === 'object' ? 'custom' : dateRange} onValueChange={handleDateRangeChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom Date Range Picker */}
            {(dateRange === 'custom' || typeof dateRange === 'object') && (
              <Popover open={dateRangeOpen} onOpenChange={setDateRangeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-48 justify-start text-left font-normal",
                      !customStartDate && !customEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatCustomDateRange()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="start">
                  <div className="space-y-4">
                    <div className="text-sm font-medium">Select Date Range</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-500 mb-2">Start Date</div>
                        <Calendar
                          mode="single"
                          selected={customStartDate}
                          onSelect={setCustomStartDate}
                          disabled={(date) => date > new Date() || (customEndDate && date > customEndDate)}
                          initialFocus
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-2">End Date</div>
                        <Calendar
                          mode="single"
                          selected={customEndDate}
                          onSelect={setCustomEndDate}
                          disabled={(date) => date > new Date() || (customStartDate && date < customStartDate)}
                          initialFocus
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" onClick={() => setDateRangeOpen(false)}>Cancel</Button>
                      <Button 
                        size="sm" 
                        onClick={handleCustomDateRange}
                        disabled={!customStartDate || !customEndDate}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* Active filter badges */}
          {(selectedStatuses.length > 0 || selectedSuppliers.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {selectedStatuses.map(status => (
                <Badge key={status} variant="secondary" className="gap-1">
                  Status: {status}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => {
                      setSelectedStatuses(prev => prev.filter(s => s !== status));
                      resetPagination();
                    }}
                  />
                </Badge>
              ))}
              {selectedSuppliers.map(supplierId => {
                const brand = brands.find(b => b.id === supplierId);
                return (
                  <Badge key={supplierId} variant="secondary" className="gap-1">
                    Brand: {brand?.name}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => {
                        setSelectedSuppliers(prev => prev.filter(id => id !== supplierId));
                        resetPagination();
                      }}
                    />
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Summary Cards - Fixed currency breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{totals.pos}</p>
                <p className="text-sm text-gray-600">Purchase Orders</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{totals.grns}</p>
                <p className="text-sm text-gray-600">Goods Receipts</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">{totals.totalValueGBP.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Total Value (GBP)</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{totals.totalValueAED.toFixed(2)}</p>
                <p className="text-sm text-gray-600">Total Value (AED)</p>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders Table - matching POList structure */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders ({filteredPOs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total (GBP)</TableHead>
                  <TableHead>Total (AED)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber || po.po_number}</TableCell>
                    <TableCell>{getBrandName(po.supplierId || po.supplier_id)}</TableCell>
                    <TableCell>{formatDate(po.orderDate || po.order_date)}</TableCell>
                    <TableCell>
                      {formatCurrency(po.totalAmount || 0, 'GBP')}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(calculateAEDAmount(po.totalAmount), 'AED')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        po.status === 'closed' ? 'border-green-300 text-green-800 bg-green-50' :
                        po.status === 'submitted' ? 'border-blue-300 text-blue-800 bg-blue-50' :
                        'border-gray-300 text-gray-800 bg-gray-50'
                      }>
                        {po.status?.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredPOs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No purchase orders found for the selected filters</p>
            </div>
          )}

          {/* Pagination Controls for POs */}
          {filteredPOs.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  Showing {startIndex + 1} to {Math.min(endIndex, filteredPOs.length)} of {filteredPOs.length} purchase orders
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
                      <SelectItem value={filteredPOs.length.toString()}>All</SelectItem>
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
        </CardContent>
      </Card>

      {/* Goods Receipts Table - Fixed structure */}
      <Card>
        <CardHeader>
          <CardTitle>Goods Receipts ({filteredGRNs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN Number</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Receipt Date</TableHead>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGRNs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">GRN-{po.poNumber || po.po_number}</TableCell>
                    <TableCell>{getBrandName(po.supplierId || po.supplier_id)}</TableCell>
                    <TableCell>
                      {po.status === 'closed' 
                        ? formatDate(po.updatedAt || po.updated_at) 
                        : '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{po.poNumber || po.po_number}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        po.status === 'closed' ? 'border-green-300 text-green-800 bg-green-50' :
                        po.status === 'submitted' ? 'border-blue-300 text-blue-800 bg-blue-50' :
                        'border-gray-300 text-gray-800 bg-gray-50'
                      }>
                        {po.status === 'submitted' ? 'SUBMITTED' : po.status?.toUpperCase()}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filteredGRNs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No goods receipts found for the selected filters</p>
            </div>
          )}

          {/* Pagination Controls for GRNs */}
          {filteredGRNs.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">
                  Showing {grnStartIndex + 1} to {Math.min(grnEndIndex, filteredGRNs.length)} of {filteredGRNs.length} goods receipts
                </span>
              </div>
              
              <div className="flex items-center gap-4">
                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Show:</span>
                  <Select value={grnItemsPerPage.toString()} onValueChange={(value) => {
                    setGrnItemsPerPage(Number(value));
                    setGrnCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value={filteredGRNs.length.toString()}>All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Page navigation */}
                {grnTotalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGrnCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={grnCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, grnTotalPages) }, (_, i) => {
                        let pageNumber;
                        if (grnTotalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (grnCurrentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (grnCurrentPage >= grnTotalPages - 2) {
                          pageNumber = grnTotalPages - 4 + i;
                        } else {
                          pageNumber = grnCurrentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNumber}
                            variant={grnCurrentPage === pageNumber ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setGrnCurrentPage(pageNumber)}
                          >
                            {pageNumber}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGrnCurrentPage(prev => Math.min(grnTotalPages, prev + 1))}
                      disabled={grnCurrentPage === grnTotalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}