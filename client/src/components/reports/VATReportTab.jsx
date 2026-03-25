
import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Search,
  Lock,
  MoreHorizontal,
  ExternalLink,
  Mail,
  Copy,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfMonth, endOfMonth, subMonths, isValid, parseISO } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { exportToCsv } from "../utils/export";

const fmt = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const DEFAULT_STATUSES = ['submitted', 'delivered'];

export default function VATReportTab({ invoices, customers, books, companySettings, currentUser, loading }) {
  const allStatuses = useMemo(() => {
    const set = new Set(invoices.map(i => i.status).filter(Boolean));
    ['draft', 'submitted', 'delivered', 'paid'].forEach(s => set.add(s));
    return [...set].sort();
  }, [invoices]);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('vat-report-filters');
      const defaultFilters = {
        dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        statuses: DEFAULT_STATUSES,
        taxTreatments: ['StandardRated']
      };
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.statuses && parsed.statuses.includes('sent') && !parsed.statuses.includes('submitted')) {
          parsed.statuses = DEFAULT_STATUSES;
        }
        return { ...defaultFilters, ...parsed };
      }
      return defaultFilters;
    } catch {
      return {
        dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        statuses: DEFAULT_STATUSES,
        taxTreatments: ['StandardRated']
      };
    }
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('vat-report-filters', JSON.stringify(filters));
  }, [filters]);

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId || c.id === Number(customerId));
    return customer?.name || customer?.customer_name || 'Unknown Customer';
  };

  const isClosedPeriod = (invoiceDate) => {
    const d = new Date(invoiceDate);
    return (books || []).some(book =>
      book.status === 'Closed' &&
      d >= new Date(book.start_date) &&
      d <= new Date(book.end_date)
    );
  };

  const filteredInvoices = invoices.filter(invoice => {
    const dateStr = invoice.invoice_date || invoice.invoiceDate;
    const invoiceDate = dateStr ? new Date(dateStr) : null;
    if (!invoiceDate || !isValid(invoiceDate)) return false;

    const dateFrom = new Date(filters.dateFrom);
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999);
    if (invoiceDate < dateFrom || invoiceDate > dateTo) return false;

    if (!filters.statuses.includes(invoice.status)) return false;

    const treatment = invoice.tax_treatment || invoice.taxTreatment || 'StandardRated';
    if (!filters.taxTreatments.includes(treatment)) return false;

    if (searchDebounced) {
      const searchLower = searchDebounced.toLowerCase();
      const invNum = (invoice.invoice_number || invoice.invoiceNumber || '').toLowerCase();
      const custName = getCustomerName(invoice.customer_id ?? invoice.customerId).toLowerCase();
      if (!invNum.includes(searchLower) && !custName.includes(searchLower)) return false;
    }

    return true;
  });

  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totals = filteredInvoices.reduce((acc, invoice) => {
    acc.subtotal += Number(invoice.subtotal || 0);
    acc.tax += Number(invoice.tax_amount || 0);
    acc.total += Number(invoice.total_amount || invoice.amount || 0);
    return acc;
  }, { subtotal: 0, tax: 0, total: 0 });

  const handleQuickDateRange = (months) => {
    const date = subMonths(new Date(), months);
    setFilters(prev => ({
      ...prev,
      dateFrom: format(startOfMonth(date), 'yyyy-MM-dd'),
      dateTo: format(endOfMonth(date), 'yyyy-MM-dd')
    }));
    setCurrentPage(1);
  };

  const handleStatusToggle = (status) => {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...prev.statuses, status]
    }));
    setCurrentPage(1);
  };

  const handleTaxTreatmentToggle = (treatment) => {
    setFilters(prev => ({
      ...prev,
      taxTreatments: prev.taxTreatments.includes(treatment)
        ? prev.taxTreatments.filter(t => t !== treatment)
        : [...prev.taxTreatments, treatment]
    }));
    setCurrentPage(1);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch {
      return '-';
    }
  };

  const formatDateForSelect = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'MMMM yyyy') : '-';
    } catch {
      return '-';
    }
  };

  const handleExportXLSX = () => {
    const exportData = filteredInvoices.map(invoice => {
      const custId = invoice.customer_id ?? invoice.customerId;
      return {
        'Date': formatDate(invoice.invoice_date || invoice.invoiceDate),
        'Invoice #': invoice.invoice_number || invoice.invoiceNumber,
        'Customer': getCustomerName(custId),
        'Currency': invoice.currency,
        'Amount (ex-VAT)': fmt(invoice.subtotal || 0),
        'VAT Amount': fmt(invoice.tax_amount || 0),
        'Total (incl VAT)': fmt(invoice.total_amount || invoice.amount || 0),
        'Status': invoice.status
      };
    });
    exportToCsv(exportData, `VAT_Report_${filters.dateFrom}_to_${filters.dateTo}`);
  };

  const handleCopyInvoiceLink = (invoice) => {
    const url = `${window.location.origin}/invoices/${invoice.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Invoice link copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">VAT (UAE) Report</CardTitle>
            <p className="text-sm text-gray-500">Comprehensive VAT reporting for UAE compliance.</p>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportXLSX}>Export to XLSX</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast({ title: "PDF export", description: "PDF export feature coming soon" })}>Export to PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date filters */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters(prev => ({ ...prev, dateFrom: e.target.value })); setCurrentPage(1); }}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters(prev => ({ ...prev, dateTo: e.target.value })); setCurrentPage(1); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Quick Select</Label>
              <Select onValueChange={(value) => handleQuickDateRange(parseInt(value))}>
                <SelectTrigger><SelectValue placeholder="Jump to month" /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = subMonths(new Date(), i);
                    return (
                      <SelectItem key={i} value={i.toString()}>
                        {formatDateForSelect(date)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Invoice # or customer"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Status + Tax Treatment filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Invoice Status</Label>
              <div className="flex flex-wrap gap-4">
                {allStatuses.map(status => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={filters.statuses.includes(status)}
                      onCheckedChange={() => handleStatusToggle(status)}
                    />
                    <Label htmlFor={`status-${status}`} className="capitalize cursor-pointer">{status}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tax Treatment</Label>
              <div className="flex flex-wrap gap-4">
                {['StandardRated', 'ZeroRated', 'Exempt', 'OutOfScope'].map(treatment => (
                  <div key={treatment} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tax-${treatment}`}
                      checked={filters.taxTreatments.includes(treatment)}
                      onCheckedChange={() => handleTaxTreatmentToggle(treatment)}
                    />
                    <Label htmlFor={`tax-${treatment}`} className="cursor-pointer">{treatment}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>VAT Report Results ({filteredInvoices.length} invoices)</span>
            {(companySettings?.taxNumber || companySettings?.vatNumber || companySettings?.company_trn) && (
              <Badge variant="outline">TRN: {companySettings.taxNumber || companySettings.vatNumber || companySettings.company_trn}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Amount (ex-VAT)</TableHead>
                  <TableHead className="text-right">VAT Amount</TableHead>
                  <TableHead className="text-right">Total (incl VAT)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                      No invoices found for the selected filters
                    </TableCell>
                  </TableRow>
                ) : paginatedInvoices.map((invoice) => {
                  const invDate = invoice.invoice_date || invoice.invoiceDate;
                  const invNum = invoice.invoice_number || invoice.invoiceNumber;
                  const custId = invoice.customer_id ?? invoice.customerId;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {formatDate(invDate)}
                          {invDate && isClosedPeriod(invDate) && (
                            <Lock className="w-3 h-3 text-gray-400" title="Closed year — read-only" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{invNum}</TableCell>
                      <TableCell>{getCustomerName(custId)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{invoice.currency || 'AED'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{fmt(invoice.subtotal || 0)}</TableCell>
                      <TableCell className="text-right">{fmt(invoice.tax_amount || 0)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(invoice.total_amount || invoice.amount || 0)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => window.open(`/Print?type=invoice&id=${invoice.id}`, '_blank')}>
                              <ExternalLink className="w-4 h-4 mr-2" />Open Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toast({ title: "Email feature", description: "Email PDF feature coming soon" })}>
                              <Mail className="w-4 h-4 mr-2" />Email PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCopyInvoiceLink(invoice)}>
                              <Copy className="w-4 h-4 mr-2" />Copy Link
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-600">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredInvoices.length)} of {filteredInvoices.length} results
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1}>Previous</Button>
                <span className="text-sm">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Totals */}
      <Card>
        <CardHeader>
          <CardTitle>Summary Totals (AED)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-gray-600">Total Amount (ex-VAT)</p>
              <p className="text-2xl font-bold text-blue-600">AED {fmt(totals.subtotal)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Total VAT</p>
              <p className="text-2xl font-bold text-green-600">AED {fmt(totals.tax)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-600">Grand Total (incl. VAT)</p>
              <p className="text-2xl font-bold text-purple-600">AED {fmt(totals.total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
