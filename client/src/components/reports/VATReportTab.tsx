
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
  Copy,
  ChevronDown,
  Eye
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfMonth, endOfMonth, subMonths, isValid, parseISO } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { exportToXLSX } from "../utils/export";

const fmt = (value: any) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const DEFAULT_STATUSES = ['submitted', 'delivered', 'paid'];

const vatLabel = (t: any) => {
  if (t === 'StandardRated') return 'Standard Rated';
  if (t === 'ZeroRated')    return 'Zero Rated';
  if (t === 'Exempt')       return 'Exempt';
  if (t === 'OutOfScope')   return 'Out of Scope';
  return t || 'Standard Rated';
};

export default function VATReportTab({ invoices, customers, books, companySettings, currentUser, loading }: any) {
  const allStatuses = useMemo(() => {
    const set = new Set(invoices.map((i: any) => i.status).filter(Boolean));
    ['draft', 'submitted', 'delivered', 'paid', 'cancelled'].forEach((s: any) => set.add(s));
    return [...set].sort();
  }, [invoices]);

  const [searchDebounced, setSearchDebounced] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<any>("all");
  const { toast } = useToast();

  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('vat-report-filters-v2');
      const defaultFilters = {
        dateFrom: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        dateTo: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
        statuses: DEFAULT_STATUSES,
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
    localStorage.setItem('vat-report-filters-v2', JSON.stringify(filters));
  }, [filters]);

  const getCustomerName = (customerId: any) => {
    const customer = customers.find((c: any) => c.id === customerId || c.id === Number(customerId));
    return customer?.name || customer?.customer_name || 'Unknown Customer';
  };

  const isClosedPeriod = (invoiceDate: any) => {
    const d = new Date(invoiceDate);
    return (books || []).some((book: any) =>
      book.status === 'Closed' &&
      d >= new Date(book.start_date) &&
      d <= new Date(book.end_date)
    );
  };

  const eligibleCustomers = useMemo(() => {
    const ids = new Set(invoices.map((i: any) => String(i.customer_id ?? i.customerId)).filter(Boolean));
    return (customers || [])
      .filter((c: any) => ids.has(String(c.id)))
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
  }, [invoices, customers]);

  const filteredInvoices = invoices.filter((invoice: any) => {
    const dateStr = invoice.invoice_date || invoice.invoiceDate;
    const invoiceDate = dateStr ? new Date(dateStr) : null;
    if (!invoiceDate || !isValid(invoiceDate)) return false;

    const dateFrom = new Date(filters.dateFrom);
    const dateTo = new Date(filters.dateTo);
    dateTo.setHours(23, 59, 59, 999);
    if (invoiceDate < dateFrom || invoiceDate > dateTo) return false;

    if (!filters.statuses.includes(invoice.status)) return false;

    if (selectedCustomerId && selectedCustomerId !== 'all') {
      const custId = String(invoice.customer_id ?? invoice.customerId ?? '');
      if (custId !== selectedCustomerId) return false;
    }

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

  const totals = filteredInvoices.reduce((acc: any, invoice: any) => {
    acc.subtotal += Number(invoice.subtotal || 0);
    acc.tax += Number(invoice.tax_amount || 0);
    acc.total += Number(invoice.total_amount || invoice.amount || 0);
    return acc;
  }, { subtotal: 0, tax: 0, total: 0 });

  const handleQuickDateRange = (months: any) => {
    const date = subMonths(new Date(), months);
    setFilters((prev: any) => ({
      ...prev,
      dateFrom: format(startOfMonth(date), 'yyyy-MM-dd'),
      dateTo: format(endOfMonth(date), 'yyyy-MM-dd')
    }));
    setCurrentPage(1);
  };

  const handleStatusToggle = (status: any) => {
    setFilters((prev: any) => ({
      ...prev,
      statuses: prev.statuses.includes(status)
        ? prev.statuses.filter((s: any) => s !== status)
        : [...prev.statuses, status]
    }));
    setCurrentPage(1);
  };

  const formatDate = (dateString: any) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch {
      return '-';
    }
  };

  const formatDateForSelect = (dateString: any) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'MMMM yyyy') : '-';
    } catch {
      return '-';
    }
  };

  const handleExportXLSX = () => {
    const exportData = filteredInvoices.map((invoice: any) => {
      const custId = invoice.customer_id ?? invoice.customerId;
      const t = invoice.tax_treatment || invoice.taxTreatment || 'StandardRated';
      return {
        'Date': formatDate(invoice.invoice_date || invoice.invoiceDate),
        'Invoice #': invoice.invoice_number || invoice.invoiceNumber || '',
        'Customer': getCustomerName(custId),
        'Status': invoice.status || '',
        'VAT Treatment': vatLabel(t),
        'Amount (ex-VAT)': `AED ${fmt(invoice.subtotal || 0)}`,
        'VAT Amount': `AED ${fmt(invoice.tax_amount || 0)}`,
        'Total (incl VAT)': `AED ${fmt(invoice.total_amount || invoice.amount || 0)}`,
      };
    });
    exportToXLSX(exportData, `VAT_Report_${format(new Date(), 'dd-MM-yy')}`, 'VAT Report');
  };

  const handleViewAndPrint = () => {
    const now = format(new Date(), 'dd/MM/yy HH:mm');
    const headerCells = `<th>Date</th><th>Invoice #</th><th>Customer</th><th>Status</th><th>VAT Treatment</th><th style="text-align:right">Amount (ex-VAT)</th><th style="text-align:right">VAT Amount</th><th style="text-align:right">Total (incl VAT)</th>`;
    const bodyRows = filteredInvoices.map((inv: any) => {
      const custId = inv.customer_id ?? inv.customerId;
      const t = inv.tax_treatment || inv.taxTreatment || 'StandardRated';
      return `<tr>
        <td>${formatDate(inv.invoice_date || inv.invoiceDate)}</td>
        <td>${inv.invoice_number || inv.invoiceNumber || ''}</td>
        <td>${getCustomerName(custId)}</td>
        <td>${inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : ''}</td>
        <td>${vatLabel(t)}</td>
        <td style="text-align:right">AED ${fmt(inv.subtotal || 0)}</td>
        <td style="text-align:right">AED ${fmt(inv.tax_amount || 0)}</td>
        <td style="text-align:right;font-weight:600">AED ${fmt(inv.total_amount || inv.amount || 0)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>VAT Report</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; color: #333; }
  .print-header { text-align: center; margin-bottom: 30px; }
  .print-header h1 { font-size: 24px; margin-bottom: 5px; }
  .print-header h2 { font-size: 18px; color: #666; margin-top: 0; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  td { font-size: 12px; }
  .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
  @media print { body { margin: 0; } table { font-size: 10px; } }
</style>
</head>
<body>
<div class="print-header">
  <h1>Business Operations</h1>
  <h2>VAT Report</h2>
</div>
<table>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>
<div class="print-footer">
  <p>Generated: ${now} &nbsp;|&nbsp; Total records: ${filteredInvoices.length}</p>
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const pw = window.open(url, '_blank');
    if (!pw) alert('Please allow popups to use View & Print.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleCopyInvoiceLink = (invoice: any) => {
    const url = `${window.location.origin}/invoices/${invoice.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Invoice link copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      {/* Filter card */}
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
                <DropdownMenuItem onClick={handleViewAndPrint}>
                  <Eye className="w-4 h-4 mr-2" />
                  View &amp; Print
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportXLSX}>
                  <Download className="w-4 h-4 mr-2" />
                  Export to XLSX
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date + search + customer filters */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => { setFilters((prev: any) => ({ ...prev, dateFrom: e.target.value })); setCurrentPage(1); }}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => { setFilters((prev: any) => ({ ...prev, dateTo: e.target.value })); setCurrentPage(1); }}
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
              <Label>Customer</Label>
              <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); setCurrentPage(1); }}>
                <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {eligibleCustomers.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
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

          {/* Invoice Status filter */}
          <div className="space-y-2">
            <Label>Invoice Status</Label>
            <div className="flex flex-wrap gap-4">
              {allStatuses.map((status: any) => (
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
        </CardContent>
      </Card>

      {/* Summary Totals — above results */}
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

      {/* Results table */}
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
                  <TableHead>Status</TableHead>
                  <TableHead>VAT Treatment</TableHead>
                  <TableHead className="text-right">Amount (ex-VAT)</TableHead>
                  <TableHead className="text-right">VAT Amount</TableHead>
                  <TableHead className="text-right">Total (incl VAT)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-500">
                      No invoices found for the selected filters
                    </TableCell>
                  </TableRow>
                ) : paginatedInvoices.map((invoice: any) => {
                  const invDate = invoice.invoice_date || invoice.invoiceDate;
                  const invNum = invoice.invoice_number || invoice.invoiceNumber;
                  const custId = invoice.customer_id ?? invoice.customerId;
                  const t = invoice.tax_treatment || invoice.taxTreatment || 'StandardRated';
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {formatDate(invDate)}
                          {invDate && isClosedPeriod(invDate) && (
                            <Lock className="w-3 h-3 text-gray-400" aria-label="Closed year — read-only" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{invNum}</TableCell>
                      <TableCell>{getCustomerName(custId)}</TableCell>
                      <TableCell>
                        {(() => {
                          const s = invoice.status || '';
                          if (s === 'cancelled') return <Badge className="bg-red-100 text-red-800 border border-red-300 text-xs">Cancelled</Badge>;
                          if (s === 'paid')      return <Badge className="bg-purple-100 text-purple-800 border border-purple-300 text-xs">Paid</Badge>;
                          if (s === 'delivered') return <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">Delivered</Badge>;
                          if (s === 'submitted') return <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-xs">Submitted</Badge>;
                          if (s === 'draft')     return <Badge className="bg-gray-100 text-gray-600 border border-gray-300 text-xs">Draft</Badge>;
                          return <Badge variant="outline" className="text-xs capitalize">{s}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell>
                        {t === 'StandardRated' && <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">Standard Rated</Badge>}
                        {t === 'ZeroRated'    && <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-xs">Zero Rated</Badge>}
                        {t === 'Exempt'       && <Badge className="bg-gray-100 text-gray-700 border border-gray-300 text-xs">Exempt</Badge>}
                        {t !== 'StandardRated' && t !== 'ZeroRated' && t !== 'Exempt' && (
                          <Badge variant="outline" className="text-xs">{t}</Badge>
                        )}
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
    </div>
  );
}
