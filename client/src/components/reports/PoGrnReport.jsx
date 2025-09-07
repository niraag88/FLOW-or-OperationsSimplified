import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Filter, X, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import ExportDropdown from "../common/ExportDropdown";
import { Brand } from "@/api/entities";

export default function PoGrnReport({ purchaseOrders, goodsReceipts, canExport }) {
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({
    status: "all",
    supplier: "all",
    dateRange: "all"
  });
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);

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

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : new Date(dateString);
      return date && !isNaN(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      return '-';
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      status: "all",
      supplier: "all", 
      dateRange: "all"
    });
    setCustomStartDate(null);
    setCustomEndDate(null);
  };

  const hasActiveFilters = filters.status !== "all" || filters.supplier !== "all" || filters.dateRange !== "all";

  const handleDateRangeChange = (value) => {
    if (value !== 'custom') {
      setCustomStartDate(null);
      setCustomEndDate(null);
    }
    handleFilterChange('dateRange', value);
  };

  const handleCustomDateRange = () => {
    if (customStartDate && customEndDate) {
      const customRange = {
        type: 'custom',
        startDate: customStartDate,
        endDate: customEndDate
      };
      handleFilterChange('dateRange', customRange);
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
      const matchesStatus = filters.status === "all" || po.status === filters.status;
      const matchesSupplier = filters.supplier === "all" || (po.supplierId || po.supplier_id) === filters.supplier;
      
      // Date range filtering
      let matchesDateRange = true;
      if (filters.dateRange !== "all") {
        const dateValue = po.orderDate || po.order_date;
        if (!dateValue) return false;
        
        const poDate = new Date(dateValue);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (filters.dateRange === "today") {
          const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
          matchesDateRange = poDate >= startOfToday && poDate <= endOfToday;
        } else if (filters.dateRange === "week") {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          matchesDateRange = poDate >= startOfWeek;
        } else if (filters.dateRange === "month") {
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDateRange = poDate >= startOfMonth;
        } else if (filters.dateRange === "quarter") {
          const quarter = Math.floor(today.getMonth() / 3);
          const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
          matchesDateRange = poDate >= startOfQuarter;
        } else if (typeof filters.dateRange === "object" && filters.dateRange.type === "custom") {
          const startDate = new Date(filters.dateRange.startDate);
          const endDate = new Date(filters.dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          matchesDateRange = poDate >= startDate && poDate <= endDate;
        }
      }
      
      return matchesStatus && matchesSupplier && matchesDateRange;
    });
  }, [purchaseOrders, filters]);

  // Filter goods receipts using the same date logic
  const filteredGRNs = useMemo(() => {
    return goodsReceipts.filter(grn => {
      const matchesSupplier = filters.supplier === "all" || (grn.supplierId || grn.supplier_id) === filters.supplier;
      
      // Date range filtering
      let matchesDateRange = true;
      if (filters.dateRange !== "all") {
        const dateValue = grn.receiptDate || grn.receipt_date;
        if (!dateValue) return false;
        
        const grnDate = new Date(dateValue);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (filters.dateRange === "today") {
          const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
          matchesDateRange = grnDate >= startOfToday && grnDate <= endOfToday;
        } else if (filters.dateRange === "week") {
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay());
          startOfWeek.setHours(0, 0, 0, 0);
          matchesDateRange = grnDate >= startOfWeek;
        } else if (filters.dateRange === "month") {
          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchesDateRange = grnDate >= startOfMonth;
        } else if (filters.dateRange === "quarter") {
          const quarter = Math.floor(today.getMonth() / 3);
          const startOfQuarter = new Date(today.getFullYear(), quarter * 3, 1);
          matchesDateRange = grnDate >= startOfQuarter;
        } else if (typeof filters.dateRange === "object" && filters.dateRange.type === "custom") {
          const startDate = new Date(filters.dateRange.startDate);
          const endDate = new Date(filters.dateRange.endDate);
          endDate.setHours(23, 59, 59, 999);
          matchesDateRange = grnDate >= startDate && grnDate <= endDate;
        }
      }
      
      return matchesSupplier && matchesDateRange;
    });
  }, [goodsReceipts, filters]);

  // Calculate totals
  const totals = useMemo(() => {
    const poTotals = filteredPOs.reduce((acc, po) => {
      const amount = Number(po.totalAmount || po.total_amount || 0);
      if (po.currency === 'GBP') {
        acc.totalGBP += amount;
        acc.totalAED += amount * Number(po.fxRateToAed || po.fx_rate_to_aed || 5.0);
      } else {
        acc.totalAED += amount;
      }
      return acc;
    }, { totalGBP: 0, totalAED: 0 });

    return {
      pos: filteredPOs.length,
      grns: filteredGRNs.length,
      totalValueGBP: poTotals.totalGBP,
      totalValueAED: poTotals.totalAED
    };
  }, [filteredPOs, filteredGRNs]);

  // Prepare export data
  const exportData = [
    // Add PO data
    ...filteredPOs.map(po => ({
      type: 'Purchase Order',
      document_number: po.poNumber || po.po_number,
      date: formatDate(po.orderDate || po.order_date),
      brand_supplier: getBrandName(po.supplierId || po.supplier_id),
      currency: po.currency,
      total_gbp: po.currency === 'GBP' ? Number(po.totalAmount || po.total_amount || 0).toFixed(2) : '0.00',
      total_aed: po.currency === 'GBP' ? 
        (Number(po.totalAmount || po.total_amount || 0) * Number(po.fxRateToAed || po.fx_rate_to_aed || 5.0)).toFixed(2) :
        Number(po.totalAmount || po.total_amount || 0).toFixed(2),
      status: po.status
    })),
    // Add GRN data
    ...filteredGRNs.map(grn => ({
      type: 'Goods Receipt',
      document_number: grn.grnNumber || grn.grn_number,
      date: formatDate(grn.receiptDate || grn.receipt_date),
      brand_supplier: getBrandName(grn.supplierId || grn.supplier_id),
      currency: '-',
      total_gbp: '-',
      total_aed: '-',
      status: 'Received'
    }))
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
              filename={`PO_GRN_Report_${filters.dateRange === 'all' ? 'All_Time' : 'Filtered'}`}
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
            
            <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.supplier} onValueChange={(value) => handleFilterChange('supplier', value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Brand/Supplier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {brands.map(brand => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeof filters.dateRange === 'object' ? 'custom' : filters.dateRange} onValueChange={handleDateRangeChange}>
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
            {(filters.dateRange === 'custom' || typeof filters.dateRange === 'object') && (
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
                {filteredPOs.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber || po.po_number}</TableCell>
                    <TableCell>{getBrandName(po.supplierId || po.supplier_id)}</TableCell>
                    <TableCell>{formatDate(po.orderDate || po.order_date)}</TableCell>
                    <TableCell>
                      {po.currency === 'GBP' ? 
                        `GBP ${Number(po.totalAmount || po.total_amount || 0).toFixed(2)}` : 
                        '-'
                      }
                    </TableCell>
                    <TableCell>
                      {po.currency === 'GBP' ? 
                        `AED ${(Number(po.totalAmount || po.total_amount || 0) * Number(po.fxRateToAed || po.fx_rate_to_aed || 5.0)).toFixed(2)}` :
                        `AED ${Number(po.totalAmount || po.total_amount || 0).toFixed(2)}`
                      }
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
                  <TableHead>Receipt Date</TableHead>
                  <TableHead>Brand/Supplier</TableHead>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Received By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGRNs.map((grn) => {
                  const relatedPO = purchaseOrders.find(po => po.id === (grn.purchaseOrderId || grn.purchase_order_id));
                  return (
                    <TableRow key={grn.id}>
                      <TableCell className="font-medium">{grn.grnNumber || grn.grn_number}</TableCell>
                      <TableCell>{formatDate(grn.receiptDate || grn.receipt_date)}</TableCell>
                      <TableCell>{getBrandName(grn.supplierId || grn.supplier_id)}</TableCell>
                      <TableCell>
                        {relatedPO ? (
                          <Badge variant="outline">{relatedPO.poNumber || relatedPO.po_number}</Badge>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>{grn.receivedBy || grn.received_by}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredGRNs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No goods receipts found for the selected filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}