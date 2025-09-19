
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isValid, parseISO } from "date-fns";
import InvoiceActionsDropdown from "./InvoiceActionsDropdown";

export default function InvoiceList({ invoices, loading, canEdit, canOverride, currentUser, onEdit, onRefresh }) {

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

  const getTaxBadge = (invoice) => {
    switch (invoice.tax_treatment) {
      case 'StandardRated':
        return <Badge variant="outline" className="text-green-700 border-green-300">Standard</Badge>;
      case 'ZeroRated':
        return <Badge variant="outline" className="text-blue-700 border-blue-300">Exempt</Badge>;
      case 'Exempt':
        return <Badge variant="outline" className="text-gray-700 border-gray-300">Exempt</Badge>;
      case 'OutOfScope':
        return <Badge variant="outline" className="text-gray-700 border-gray-300">OOS</Badge>;
      default:
        return <Badge variant="outline" className="text-green-700 border-green-300">VAT 5%</Badge>;
    }
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
            Invoices ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden lg:block">
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
                      <TableCell className="font-medium">{invoice.invoiceNumber || invoice.invoice_number || '-'}</TableCell>
                      <TableCell>{getCustomerName(invoice)}</TableCell>
                      <TableCell>{formatDate(invoice.invoiceDate || invoice.invoice_date || invoice.createdAt)}</TableCell>
                      <TableCell>{invoice.reference || '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          const total = invoice.total_amount || invoice.totalAmount || invoice.amount || 0;
                          const tax = invoice.tax_amount || invoice.taxAmount || invoice.vatAmount || 0;
                          const subtotal = invoice.subtotal || (total && tax ? total - tax : total);
                          return subtotal ? formatCurrency(subtotal, invoice.currency) : '-';
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const tax = invoice.tax_amount || invoice.taxAmount || invoice.vatAmount || 0;
                          return tax ? formatCurrency(tax, invoice.currency) : '-';
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
                        <div className="flex items-center gap-2">
                          <InvoiceActionsDropdown 
                            invoice={invoice}
                            canEdit={canPerformActions(invoice)}
                            canOverride={canOverride}
                            onEdit={onEdit}
                            onRefresh={onRefresh}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {invoices.map((invoice) => {
              
              return (
                <Card key={invoice.id} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{invoice.invoiceNumber || invoice.invoice_number || '-'}</h3>
                      <p className="text-sm text-gray-600">{getCustomerName(invoice)}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge className={`${getStatusColor(invoice.status)} border`}>
                        {invoice.status?.toUpperCase()}
                      </Badge>
                      {getTaxBadge(invoice)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <p className="text-gray-500">Invoice Date</p>
                      <p className="font-medium">{formatDate(invoice.invoiceDate || invoice.invoice_date || invoice.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Reference</p>
                      <p className="font-medium">{invoice.reference || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Subtotal</p>
                      <p className="font-medium">{(() => {
                        const total = invoice.total_amount || invoice.totalAmount || invoice.amount || 0;
                        const tax = invoice.tax_amount || invoice.taxAmount || invoice.vatAmount || 0;
                        const subtotal = invoice.subtotal || (total && tax ? total - tax : total);
                        return subtotal ? formatCurrency(subtotal, invoice.currency) : '-';
                      })()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">VAT</p>
                      <p className="font-medium">{(() => {
                        const tax = invoice.tax_amount || invoice.taxAmount || invoice.vatAmount || 0;
                        return tax ? formatCurrency(tax, invoice.currency) : '-';
                      })()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Total</p>
                      <p className="font-medium">{formatCurrency(invoice.total_amount || invoice.totalAmount || invoice.amount || 0, invoice.currency)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <div />
                    <InvoiceActionsDropdown 
                      invoice={invoice}
                      canEdit={canPerformActions(invoice)}
                      canOverride={canOverride}
                      onEdit={onEdit}
                      onRefresh={onRefresh}
                    />
                  </div>
                </Card>
              );
            })}
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
