
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isValid, parseISO } from "date-fns";
import InvoiceActionsDropdown from "./InvoiceActionsDropdown";

export default function InvoiceList({ invoices, totalCount, loading, canEdit, canOverride, currentUser, onEdit, onRefresh }) {

  const getCustomerName = (invoice) => {
    return invoice.customer_name || invoice.customerName || 'Unknown Customer';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted':
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount, currency = 'AED') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${formatter.format(amount || 0)}`;
  };


  const canPerformActions = (invoice) => {
    if (!canEdit) return false;
    if (canOverride) return true;
    return ['draft', 'submitted'].includes(invoice.status);
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Invoices ({totalCount ?? invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Invoice Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  return (
                    <TableRow key={invoice.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1">
                          {invoice.invoiceNumber || invoice.invoice_number || '-'}
                          {(invoice.scanKey || invoice.scan_key) && (
                            <Paperclip className="w-3 h-3 text-blue-500 shrink-0" title="Attachment" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell>{getCustomerName(invoice)}</TableCell>
                      <TableCell>{formatDate(invoice.invoiceDate || invoice.invoice_date || invoice.createdAt)}</TableCell>
                      <TableCell>{invoice.reference || '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          const total = parseFloat(invoice.total_amount ?? invoice.totalAmount ?? invoice.amount ?? 0) || 0;
                          const tax = parseFloat(invoice.tax_amount ?? invoice.taxAmount ?? invoice.vatAmount ?? 0) || 0;
                          const subtotal = parseFloat(invoice.subtotal ?? 0) || (total - tax);
                          return formatCurrency(subtotal, invoice.currency);
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const tax = parseFloat(invoice.tax_amount ?? invoice.taxAmount ?? invoice.vatAmount ?? 0) || 0;
                          return formatCurrency(tax, invoice.currency);
                        })()}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(invoice.total_amount || invoice.totalAmount || invoice.amount || 0, invoice.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(invoice.status)} border`}>
                          {invoice.status?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <InvoiceActionsDropdown 
                          invoice={invoice}
                          canEdit={canPerformActions(invoice)}
                          canOverride={canOverride}
                          onEdit={onEdit}
                          onRefresh={onRefresh}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {invoices.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No invoices found</p>
            </div>
          )}
        </CardContent>
      </Card>

    </>
  );
}
