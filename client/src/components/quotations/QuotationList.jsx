
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isValid, parseISO } from "date-fns";
import QuotationActionsDropdown from "./QuotationActionsDropdown";

export default function QuotationList({ quotations, totalCount, loading, canEdit, canCreate, canOverride, currentUser, onEdit, onRefresh }) {
  const getCustomerName = (quotation) => {
    return quotation.customerName || quotation.customer_name || 'Unknown Customer';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch (error) {
      return '-';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
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

  const canPerformActions = (quotation) => {
    if (!canCreate) return false;
    if (canOverride) return true;
    return !['accepted', 'rejected', 'invoiced'].includes(quotation.status);
  };

  const canEditActions = (quotation) => {
    if (!canEdit) return false;
    if (canOverride) return true;
    return !['accepted', 'rejected', 'invoiced'].includes(quotation.status);
  };

  const isInitialLoad = loading && (!quotations || quotations.length === 0);

  if (isInitialLoad) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Quotations
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
            Quotations ({totalCount ?? quotations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Quotation Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>VAT</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotations.map((quotation) => (
                  <TableRow key={quotation.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{quotation.quoteNumber}</TableCell>
                    <TableCell>{getCustomerName(quotation)}</TableCell>
                    <TableCell>{formatDate(quotation.quoteDate)}</TableCell>
                    <TableCell>{quotation.reference || '-'}</TableCell>
                    <TableCell>
                      {formatCurrency(quotation.totalAmount || 0, quotation.currency)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(quotation.vatAmount || 0, quotation.currency)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(quotation.grandTotal || 0, quotation.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(quotation.status)} border`}>
                        {quotation.status?.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <QuotationActionsDropdown 
                        quotation={quotation}
                        canEdit={canEditActions(quotation)}
                        canCreate={canPerformActions(quotation)}
                        canOverride={canOverride}
                        onEdit={onEdit}
                        onRefresh={onRefresh}
                        currentUser={currentUser}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {quotations.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No quotations found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
