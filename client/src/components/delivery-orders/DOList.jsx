
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isValid, parseISO } from "date-fns";
import DOActionsDropdown from "./DOActionsDropdown";

export default function DOList({ deliveryOrders, loading, canEdit, currentUser, onEdit, onRefresh }) {
  const getCustomerName = (doOrder) => {
    return doOrder.customer_name || doOrder.customerName || 'Unknown Customer';
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

  const getTaxBadge = (doOrder) => {
    switch (doOrder.tax_treatment) {
      case 'StandardRated':
        return <Badge variant="outline" className="text-green-700 border-green-300">VAT {((doOrder.tax_rate || 0) * 100).toFixed(0)}%</Badge>;
      case 'ZeroRated':
        return <Badge variant="outline" className="text-blue-700 border-blue-300">Zero-rated</Badge>;
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
            <Truck className="w-5 h-5" />
            Delivery Orders
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
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5" />
          Delivery Orders ({deliveryOrders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Desktop Table */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DO Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tax Treatment</TableHead>
                <TableHead>Total Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryOrders.map((doOrder) => (
                <TableRow key={doOrder.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{doOrder.do_number}</TableCell>
                  <TableCell>{getCustomerName(doOrder)}</TableCell>
                  <TableCell>{formatDate(doOrder.order_date)}</TableCell>
                  <TableCell>{doOrder.reference || '-'}</TableCell>
                  <TableCell>
                    <Badge className={`${getStatusColor(doOrder.status)} border`}>
                      {doOrder.status?.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getTaxBadge(doOrder)}
                  </TableCell>
                  <TableCell>
                    {formatCurrency(doOrder.total_amount || 0, doOrder.currency)}
                  </TableCell>
                  <TableCell>
                    <DOActionsDropdown 
                      doOrder={doOrder}
                      canEdit={canEdit}
                      onEdit={onEdit}
                      onRefresh={onRefresh}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden space-y-4">
          {deliveryOrders.map((doOrder) => (
            <Card key={doOrder.id} className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{doOrder.do_number}</h3>
                  <p className="text-sm text-gray-600">{getCustomerName(doOrder)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Badge className={`${getStatusColor(doOrder.status)} border`}>
                    {doOrder.status?.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                  {getTaxBadge(doOrder)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-gray-500">Order Date</p>
                  <p className="font-medium">{formatDate(doOrder.order_date)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Reference</p>
                  <p className="font-medium">{doOrder.reference || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Amount</p>
                  <p className="font-medium">{formatCurrency(doOrder.total_amount || 0, doOrder.currency)}</p>
                </div>
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-gray-200">
                <DOActionsDropdown 
                  doOrder={doOrder}
                  canEdit={canEdit}
                  onEdit={onEdit}
                  onRefresh={onRefresh}
                />
              </div>
            </Card>
          ))}
        </div>

        {deliveryOrders.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Truck className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No delivery orders found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
