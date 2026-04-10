import React, { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Paperclip, Info, Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import InvoiceActionsDropdown from "./InvoiceActionsDropdown";
import MarkPaidDialog from "./MarkPaidDialog";

export default function InvoiceList({ invoices, totalCount, loading, canEdit, canOverride, currentUser, onEdit, onRefresh, onQuickView }) {
  const [showEditPaymentDialog, setShowEditPaymentDialog] = useState(false);
  const [editPaymentInvoice, setEditPaymentInvoice] = useState<any>(null);

  const getCustomerName = (invoice) => invoice.customer_name || invoice.customerName || 'Unknown Customer';

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'dd/MM/yy');
    } catch {
      return '-';
    }
  };

  const formatShortDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'dd/MM/yy');
    } catch {
      return '-';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted':
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
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

  const handleEditPayment = (invoice) => {
    setEditPaymentInvoice(invoice);
    setShowEditPaymentDialog(true);
  };

  const isInitialLoad = loading && (!invoices || invoices.length === 0);

  if (isInitialLoad) {
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
      <Card className={`border-0 shadow-lg transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
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
                  <TableHead>Payment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const isCancelled = invoice.status === 'cancelled';
                  const ps = invoice.paymentStatus || invoice.payment_status || 'outstanding';
                  const paidDate = invoice.paymentReceivedDate || invoice.payment_received_date;
                  const remarks = invoice.paymentRemarks || invoice.payment_remarks;
                  const formattedPayDate = formatDate(paidDate);

                  return (
                    <TableRow key={invoice.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => onQuickView && onQuickView(invoice.id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left transition-colors"
                          >
                            {invoice.invoiceNumber || invoice.invoice_number || '-'}
                          </button>
                          {(invoice.scanKey || invoice.scan_key) && (
                            <Paperclip className="w-3 h-3 text-blue-500 shrink-0" aria-label="Attachment" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getCustomerName(invoice)}</TableCell>
                      <TableCell>{formatShortDate(invoice.invoiceDate || invoice.invoice_date || invoice.createdAt)}</TableCell>
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
                        {isCancelled ? (
                          <span className="text-gray-400">—</span>
                        ) : ps === 'paid' ? (
                          <div className="flex items-center gap-1.5">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-1.5 hover:opacity-75 transition-opacity cursor-pointer">
                                  <Badge className="bg-green-100 text-green-800 border border-green-200">PAID</Badge>
                                  {paidDate && formattedPayDate !== '-' && (
                                    <span className="text-xs text-gray-600 whitespace-nowrap">{formattedPayDate}</span>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="start">
                                <p className="text-sm font-semibold text-gray-900 mb-2">Payment Details</p>
                                <div className="space-y-1.5 text-xs text-gray-700 mb-3">
                                  {paidDate && formattedPayDate !== '-' && (
                                    <div className="flex gap-1">
                                      <span className="font-medium w-16 shrink-0">Date:</span>
                                      <span>{formattedPayDate}</span>
                                    </div>
                                  )}
                                  {remarks && (
                                    <div className="flex gap-1">
                                      <span className="font-medium w-16 shrink-0">Remarks:</span>
                                      <span className="break-words">{remarks}</span>
                                    </div>
                                  )}
                                  {!paidDate && !remarks && (
                                    <span className="text-gray-400 italic">No details recorded</span>
                                  )}
                                </div>
                                {canEdit && (
                                  <Button
                                    
                                    variant="outline"
                                    className="w-full text-xs h-7"
                                    onClick={() => handleEditPayment(invoice)}
                                  >
                                    <Pencil className="w-3 h-3 mr-1" />
                                    Edit Payment Details
                                  </Button>
                                )}
                              </PopoverContent>
                            </Popover>
                            {remarks && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="w-3.5 h-3.5 text-gray-400 cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-xs">{remarks}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border border-amber-200">OUTSTANDING</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <InvoiceActionsDropdown
                          invoice={invoice}
                          canEdit={canPerformActions(invoice)}
                          canOverride={canOverride}
                          onEdit={onEdit}
                          onRefresh={onRefresh}
                          currentUser={currentUser}
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

      {showEditPaymentDialog && editPaymentInvoice && (
        <MarkPaidDialog
          open={showEditPaymentDialog}
          onClose={() => { setShowEditPaymentDialog(false); setEditPaymentInvoice(null); }}
          invoice={editPaymentInvoice}
          onSuccess={() => {
            setShowEditPaymentDialog(false);
            setEditPaymentInvoice(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
