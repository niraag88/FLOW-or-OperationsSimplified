import React, { useState, useMemo } from "react";
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
import { getRateToAed } from "@/utils/currency";

export default function PoGrnReport({ purchaseOrders, goodsReceipts, suppliers = [], companySettings, canExport }) {
  // PO section filter state
  const [poSelectedStatuses, setPoSelectedStatuses] = useState([]);
  const [poSelectedSuppliers, setPoSelectedSuppliers] = useState([]);
  const [poDateRange, setPoDateRange] = useState("all");
  const [poDateRangeOpen, setPoDateRangeOpen] = useState(false);
  const [poCustomRange, setPoCustomRange] = useState({ from: null, to: null });
  const [poPendingRange, setPoPendingRange] = useState({ from: null, to: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // GRN section filter state
  const [grnSelectedSuppliers, setGrnSelectedSuppliers] = useState([]);
  const [grnDateRange, setGrnDateRange] = useState("all");
  const [grnDateRangeOpen, setGrnDateRangeOpen] = useState(false);
  const [grnCustomRange, setGrnCustomRange] = useState({ from: null, to: null });
  const [grnPendingRange, setGrnPendingRange] = useState({ from: null, to: null });
  const [grnCurrentPage, setGrnCurrentPage] = useState(1);
  const [grnItemsPerPage, setGrnItemsPerPage] = useState(20);

  // Shared utilities
  const getSupplierName = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId || s.id === Number(supplierId));
    return supplier?.name || 'Unknown Supplier';
  };

  const formatCurrency = (amount, currency) => {
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const numericAmount = parseFloat(amount) || 0;
    return `${currency} ${formatter.format(numericAmount)}`;
  };

  const getFxRate = (po) => {
    const storedRate = parseFloat(po.fxRateToAed || po.fx_rate_to_aed);
    if (!isNaN(storedRate) && storedRate > 0) return storedRate;
    const currency = po.currency || 'GBP';
    return getRateToAed(currency, companySettings);
  };

  const calculateAEDAmount = (po) => {
    const numericAmount = parseFloat(po.totalAmount || po.total_amount || 0);
    const currency = po.currency || 'GBP';
    if (currency === 'AED') return numericAmount;
    return numericAmount * getFxRate(po);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date && !isNaN(date) ? format(date, 'dd/MM/yy') : '-';
    } catch {
      return '-';
    }
  };

  const sortedSuppliers = [...suppliers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Generic date filter — accepts the dateRange value as a parameter
  const applyDateFilter = (po, dateRange) => {
    if (dateRange === "all") return true;
    const dateValue = po.orderDate || po.order_date;
    if (!dateValue) return false;
    const poDate = new Date(dateValue);
    const today = new Date();

    if (dateRange === "today") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      return poDate >= start && poDate <= end;
    } else if (dateRange === "week") {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return poDate >= startOfWeek;
    } else if (dateRange === "month") {
      return poDate >= new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateRange === "quarter") {
      const quarter = Math.floor(today.getMonth() / 3);
      return poDate >= new Date(today.getFullYear(), quarter * 3, 1);
    } else if (typeof dateRange === "object" && dateRange.type === "custom") {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      return poDate >= startDate && poDate <= endDate;
    }
    return true;
  };

  // GRN-specific date filter using receivedDate
  const applyGrnDateFilter = (grn, dateRange) => {
    if (dateRange === "all") return true;
    const dateValue = grn.receivedDate || grn.received_date;
    if (!dateValue) return false;
    const grnDate = new Date(dateValue);
    const today = new Date();

    if (dateRange === "today") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      return grnDate >= start && grnDate <= end;
    } else if (dateRange === "week") {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return grnDate >= startOfWeek;
    } else if (dateRange === "month") {
      return grnDate >= new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateRange === "quarter") {
      const quarter = Math.floor(today.getMonth() / 3);
      return grnDate >= new Date(today.getFullYear(), quarter * 3, 1);
    } else if (typeof dateRange === "object" && dateRange.type === "custom") {
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);
      return grnDate >= startDate && grnDate <= endDate;
    }
    return true;
  };

  // PO filter helpers
  const clearPoFilters = () => {
    setPoSelectedStatuses([]);
    setPoSelectedSuppliers([]);
    setPoDateRange("all");
    setPoCustomRange({ from: null, to: null });
    setPoPendingRange({ from: null, to: null });
    setCurrentPage(1);
  };
  const hasPoFilters = poSelectedStatuses.length > 0 || poSelectedSuppliers.length > 0 || poDateRange !== "all";

  const handlePoDateRangeChange = (value) => {
    if (value !== 'custom') setPoCustomRange({ from: null, to: null });
    setPoDateRange(value);
    setCurrentPage(1);
  };
  const applyPoCustomRange = () => {
    if (poPendingRange.from && poPendingRange.to) {
      setPoCustomRange(poPendingRange);
      setPoDateRange({ type: 'custom', startDate: poPendingRange.from, endDate: poPendingRange.to });
      setPoDateRangeOpen(false);
    }
  };
  const formatPoDateRange = () => {
    if (poCustomRange.from && poCustomRange.to)
      return `${format(poCustomRange.from, 'dd/MM')} - ${format(poCustomRange.to, 'dd/MM')}`;
    if (poCustomRange.from) return `${format(poCustomRange.from, 'dd/MM')} - ...`;
    return 'Pick date range';
  };

  // GRN filter helpers
  const clearGrnFilters = () => {
    setGrnSelectedSuppliers([]);
    setGrnDateRange("all");
    setGrnCustomRange({ from: null, to: null });
    setGrnPendingRange({ from: null, to: null });
    setGrnCurrentPage(1);
  };
  const hasGrnFilters = grnSelectedSuppliers.length > 0 || grnDateRange !== "all";

  const handleGrnDateRangeChange = (value) => {
    if (value !== 'custom') setGrnCustomRange({ from: null, to: null });
    setGrnDateRange(value);
    setGrnCurrentPage(1);
  };
  const applyGrnCustomRange = () => {
    if (grnPendingRange.from && grnPendingRange.to) {
      setGrnCustomRange(grnPendingRange);
      setGrnDateRange({ type: 'custom', startDate: grnPendingRange.from, endDate: grnPendingRange.to });
      setGrnDateRangeOpen(false);
    }
  };
  const formatGrnDateRange = () => {
    if (grnCustomRange.from && grnCustomRange.to)
      return `${format(grnCustomRange.from, 'dd/MM')} - ${format(grnCustomRange.to, 'dd/MM')}`;
    if (grnCustomRange.from) return `${format(grnCustomRange.from, 'dd/MM')} - ...`;
    return 'Pick date range';
  };

  const uniqueStatuses = [...new Set(purchaseOrders.map(po => po.status).filter(Boolean))].sort();

  // Filtered data — independent per section
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      const matchesStatus = poSelectedStatuses.length === 0 || poSelectedStatuses.includes(po.status);
      const suppId = po.supplierId || po.supplier_id;
      const matchesSupplier = poSelectedSuppliers.length === 0 || poSelectedSuppliers.includes(suppId);
      return matchesStatus && matchesSupplier && applyDateFilter(po, poDateRange);
    });
  }, [purchaseOrders, poSelectedStatuses, poSelectedSuppliers, poDateRange]);

  const filteredGRNs = useMemo(() => {
    const activeGRNs = (goodsReceipts || []).filter(grn => grn.status !== 'cancelled');
    return activeGRNs.filter(grn => {
      const grnSuppId = grn.supplierId || grn.supplier_id;
      const linkedPo = purchaseOrders.find(p => p.id === (grn.poId || grn.po_id));
      const effectiveSuppId = grnSuppId || linkedPo?.supplierId || linkedPo?.supplier_id;
      const matchesSupplier = grnSelectedSuppliers.length === 0 || grnSelectedSuppliers.includes(effectiveSuppId);
      return matchesSupplier && applyGrnDateFilter(grn, grnDateRange);
    });
  }, [goodsReceipts, purchaseOrders, grnSelectedSuppliers, grnDateRange]);

  const totals = useMemo(() => {
    return filteredPOs.reduce((acc, po) => {
      acc.totalAED += calculateAEDAmount(po);
      return acc;
    }, { totalAED: 0 });
  }, [filteredPOs]);

  // PO pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPOs = filteredPOs.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredPOs.length / itemsPerPage);

  // GRN pagination
  const grnStartIndex = (grnCurrentPage - 1) * grnItemsPerPage;
  const grnEndIndex = grnStartIndex + grnItemsPerPage;
  const paginatedGRNs = filteredGRNs.slice(grnStartIndex, grnEndIndex);
  const grnTotalPages = Math.ceil(filteredGRNs.length / grnItemsPerPage);

  const exportData = [
    ...filteredPOs.map(po => {
      const originalAmount = Number(po.totalAmount || po.total_amount || 0);
      const aedAmount = calculateAEDAmount(po);
      return {
        type: 'Purchase Order',
        document_number: po.poNumber || po.po_number,
        date: formatDate(po.orderDate || po.order_date),
        supplier: getSupplierName(po.supplierId || po.supplier_id),
        currency: po.currency || 'GBP',
        total_original: originalAmount.toFixed(2),
        total_aed: aedAmount.toFixed(2),
        po_reference: '',
        ordered_qty: '',
        received_qty: '',
        status: po.status
      };
    }),
    ...filteredGRNs.map(grn => {
      const linkedPo = purchaseOrders.find(p => p.id === (grn.poId || grn.po_id));
      const suppId = grn.supplierId || grn.supplier_id || linkedPo?.supplierId || linkedPo?.supplier_id;
      const poAed = linkedPo ? calculateAEDAmount(linkedPo) : 0;
      const poCurrency = linkedPo?.currency || '';
      const poOriginal = Number(linkedPo?.totalAmount || linkedPo?.total_amount || 0);
      return {
        type: 'Goods Receipt',
        document_number: grn.receiptNumber || grn.receipt_number || `GRN-${grn.id}`,
        date: formatDate(grn.receivedDate || grn.received_date),
        supplier: getSupplierName(suppId),
        currency: poCurrency,
        total_original: poOriginal.toFixed(2),
        total_aed: poAed.toFixed(2),
        po_reference: linkedPo?.poNumber || linkedPo?.po_number || '-',
        ordered_qty: grn.totalOrdered ?? 0,
        received_qty: grn.totalReceived ?? 0,
        status: grn.status
      };
    })
  ];

  // Reusable supplier filter popover content
  const SupplierFilterPopover = ({ selected, setSelected, onReset, idPrefix }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between w-48">
          {selected.length === 0 ? "All Suppliers" : `${selected.length} selected`}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-4">
        <div className="space-y-3">
          <h4 className="font-medium leading-none">Select Suppliers</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {sortedSuppliers.map(supplier => (
              <div key={supplier.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`${idPrefix}-supplier-${supplier.id}`}
                  checked={selected.includes(supplier.id)}
                  onCheckedChange={(checked) => {
                    setSelected(prev => checked ? [...prev, supplier.id] : prev.filter(id => id !== supplier.id));
                    onReset();
                  }}
                />
                <label htmlFor={`${idPrefix}-supplier-${supplier.id}`} className="text-sm leading-none cursor-pointer">
                  {supplier.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  // Reusable date range filter
  const DateRangeFilter = ({ dateRange, onDateRangeChange, dateRangeOpen, setDateRangeOpen, customRange, pendingRange, setPendingRange, applyCustomRange, formatRange }) => (
    <>
      <Select value={typeof dateRange === 'object' ? 'custom' : dateRange} onValueChange={onDateRangeChange}>
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
      {(dateRange === 'custom' || typeof dateRange === 'object') && (
        <Popover open={dateRangeOpen} onOpenChange={(open) => {
          if (open) setPendingRange(customRange);
          setDateRangeOpen(open);
        }}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-48 justify-start text-left font-normal", !customRange.from && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formatRange()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-3 border-b">
              <p className="text-sm font-medium">Select date range</p>
              <p className="text-xs text-muted-foreground">Click start date, then end date</p>
            </div>
            <Calendar
              mode="range"
              selected={pendingRange}
              onSelect={(range) => setPendingRange(range || { from: null, to: null })}
              numberOfMonths={2}
              disabled={(date) => date > new Date()}
              initialFocus
            />
            <div className="flex justify-end gap-2 p-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setDateRangeOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={applyCustomRange} disabled={!pendingRange.from || !pendingRange.to}>Apply</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Summary header card */}
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
              filename={`PO_GRN_Report`}
              columns={{
                type: 'Type',
                document_number: 'Document Number',
                date: 'Date',
                supplier: 'Supplier',
                currency: 'Currency',
                total_original: 'Total (original currency)',
                total_aed: 'Total (AED)',
                po_reference: 'PO Reference',
                ordered_qty: 'Ordered Qty',
                received_qty: 'Received Qty',
                status: 'Status'
              }}
            />
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{filteredPOs.length}</p>
                <p className="text-sm text-gray-600">Purchase Orders</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{filteredGRNs.length}</p>
                <p className="text-sm text-gray-600">Goods Receipts</p>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(totals.totalAED, 'AED')}</p>
                <p className="text-sm text-gray-600">Total Value (AED)</p>
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Purchase Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Orders ({filteredPOs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* PO Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            {/* Status */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-between w-36">
                  {poSelectedStatuses.length === 0 ? "All Status" : `${poSelectedStatuses.length} selected`}
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
                          id={`po-status-${status}`}
                          checked={poSelectedStatuses.includes(status)}
                          onCheckedChange={(checked) => {
                            setPoSelectedStatuses(prev => checked ? [...prev, status] : prev.filter(s => s !== status));
                            setCurrentPage(1);
                          }}
                        />
                        <label htmlFor={`po-status-${status}`} className="text-sm leading-none cursor-pointer capitalize">
                          {status}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {/* Supplier */}
            <SupplierFilterPopover
              selected={poSelectedSuppliers}
              setSelected={setPoSelectedSuppliers}
              onReset={() => setCurrentPage(1)}
              idPrefix="po"
            />
            {/* Date */}
            <DateRangeFilter
              dateRange={poDateRange}
              onDateRangeChange={handlePoDateRangeChange}
              dateRangeOpen={poDateRangeOpen}
              setDateRangeOpen={setPoDateRangeOpen}
              customRange={poCustomRange}
              pendingRange={poPendingRange}
              setPendingRange={setPoPendingRange}
              applyCustomRange={applyPoCustomRange}
              formatRange={formatPoDateRange}
            />
            {hasPoFilters && (
              <Button variant="ghost" size="sm" onClick={clearPoFilters}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          {/* Active PO filter badges */}
          {(poSelectedStatuses.length > 0 || poSelectedSuppliers.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {poSelectedStatuses.map(status => (
                <Badge key={status} variant="secondary" className="gap-1">
                  Status: {status}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => { setPoSelectedStatuses(prev => prev.filter(s => s !== status)); setCurrentPage(1); }} />
                </Badge>
              ))}
              {poSelectedSuppliers.map(supplierId => {
                const supplier = suppliers.find(s => s.id === supplierId);
                return (
                  <Badge key={supplierId} variant="secondary" className="gap-1">
                    Supplier: {supplier?.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => { setPoSelectedSuppliers(prev => prev.filter(id => id !== supplierId)); setCurrentPage(1); }} />
                  </Badge>
                );
              })}
            </div>
          )}
          {/* PO Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total (original)</TableHead>
                  <TableHead>Total (AED)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPOs.map((po) => {
                  const suppId = po.supplierId || po.supplier_id;
                  const currency = po.currency || 'GBP';
                  const originalAmount = Number(po.totalAmount || po.total_amount || 0);
                  const aedAmount = calculateAEDAmount(po);
                  return (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.poNumber || po.po_number}</TableCell>
                      <TableCell>{getSupplierName(suppId)}</TableCell>
                      <TableCell>{formatDate(po.orderDate || po.order_date)}</TableCell>
                      <TableCell>{formatCurrency(originalAmount, currency)}</TableCell>
                      <TableCell>{formatCurrency(aedAmount, 'AED')}</TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filteredPOs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No purchase orders found for the selected filters</p>
            </div>
          )}
          {filteredPOs.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <span className="text-sm text-gray-700">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredPOs.length)} of {filteredPOs.length} purchase orders
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Show:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => { setItemsPerPage(Number(value)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value={filteredPOs.length.toString()}>All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
                    <span className="text-sm">Page {currentPage} of {totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goods Receipts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Goods Receipts ({filteredGRNs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GRN Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-gray-500" />
            {/* Supplier */}
            <SupplierFilterPopover
              selected={grnSelectedSuppliers}
              setSelected={setGrnSelectedSuppliers}
              onReset={() => setGrnCurrentPage(1)}
              idPrefix="grn"
            />
            {/* Date */}
            <DateRangeFilter
              dateRange={grnDateRange}
              onDateRangeChange={handleGrnDateRangeChange}
              dateRangeOpen={grnDateRangeOpen}
              setDateRangeOpen={setGrnDateRangeOpen}
              customRange={grnCustomRange}
              pendingRange={grnPendingRange}
              setPendingRange={setGrnPendingRange}
              applyCustomRange={applyGrnCustomRange}
              formatRange={formatGrnDateRange}
            />
            {hasGrnFilters && (
              <Button variant="ghost" size="sm" onClick={clearGrnFilters}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          {/* Active GRN supplier badges */}
          {grnSelectedSuppliers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {grnSelectedSuppliers.map(supplierId => {
                const supplier = suppliers.find(s => s.id === supplierId);
                return (
                  <Badge key={supplierId} variant="secondary" className="gap-1">
                    Supplier: {supplier?.name}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => { setGrnSelectedSuppliers(prev => prev.filter(id => id !== supplierId)); setGrnCurrentPage(1); }} />
                  </Badge>
                );
              })}
            </div>
          )}
          {/* GRN Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>PO Reference</TableHead>
                  <TableHead>Ordered Qty</TableHead>
                  <TableHead>Received Qty</TableHead>
                  <TableHead>PO Value (AED)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedGRNs.map((grn) => {
                  const linkedPo = purchaseOrders.find(p => p.id === (grn.poId || grn.po_id));
                  const suppId = grn.supplierId || grn.supplier_id || linkedPo?.supplierId || linkedPo?.supplier_id;
                  const poAed = linkedPo ? calculateAEDAmount(linkedPo) : 0;
                  const totalOrdered = grn.totalOrdered ?? 0;
                  const totalReceived = grn.totalReceived ?? 0;
                  const isShort = totalOrdered > 0 && totalReceived < totalOrdered;
                  return (
                    <TableRow key={grn.id}>
                      <TableCell className="font-medium">{grn.receiptNumber || grn.receipt_number || `GRN-${grn.id}`}</TableCell>
                      <TableCell>{getSupplierName(suppId)}</TableCell>
                      <TableCell>{formatDate(grn.receivedDate || grn.received_date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{linkedPo?.poNumber || linkedPo?.po_number || '-'}</Badge>
                      </TableCell>
                      <TableCell>{totalOrdered > 0 ? totalOrdered : '-'}</TableCell>
                      <TableCell className={isShort ? 'text-amber-600 font-medium' : ''}>
                        {totalReceived > 0 ? totalReceived : '-'}
                        {isShort && <span className="ml-1 text-xs">(short)</span>}
                      </TableCell>
                      <TableCell>{poAed > 0 ? formatCurrency(poAed, 'AED') : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-green-300 text-green-800 bg-green-50">
                          {grn.status?.toUpperCase() || 'CONFIRMED'}
                        </Badge>
                      </TableCell>
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
          {filteredGRNs.length > 0 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <span className="text-sm text-gray-700">
                Showing {grnStartIndex + 1} to {Math.min(grnEndIndex, filteredGRNs.length)} of {filteredGRNs.length} goods receipts
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Show:</span>
                  <Select value={grnItemsPerPage.toString()} onValueChange={(value) => { setGrnItemsPerPage(Number(value)); setGrnCurrentPage(1); }}>
                    <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value={filteredGRNs.length.toString()}>All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {grnTotalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setGrnCurrentPage(prev => Math.max(1, prev - 1))} disabled={grnCurrentPage === 1}>Previous</Button>
                    <span className="text-sm">Page {grnCurrentPage} of {grnTotalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setGrnCurrentPage(prev => Math.min(grnTotalPages, prev + 1))} disabled={grnCurrentPage === grnTotalPages}>Next</Button>
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
