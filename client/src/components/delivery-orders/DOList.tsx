
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isValid, parseISO } from "date-fns";
import DOActionsDropdown from "./DOActionsDropdown";
import type { DeliveryOrder } from "@shared/schema";

interface DOListProps {
  deliveryOrders: DeliveryOrder[];
  totalCount: number;
  loading: boolean;
  canEdit: boolean;
  currentUser?: { email?: string; role?: string } | null;
  onEdit: (doOrder: DeliveryOrder) => void;
  onRefresh: () => void;
  onQuickView: (id: number) => void;
}

export default function DOList({ deliveryOrders, totalCount, loading, canEdit, currentUser, onEdit, onRefresh, onQuickView }: DOListProps) {
  const getCustomerName = (doOrder: DeliveryOrder) => {
    return doOrder.customerName || 'Unknown Customer';
  };
  
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '-';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : (dateString instanceof Date ? dateString : new Date(String(dateString)));
      return isValid(date) ? format(date, 'dd/MM/yy') : '-';
    } catch {
      return '-';
    }
  };

  const getStatusColor = (status: string | null | undefined) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string | null | undefined) => {
    if (!status) return '';
    if (status.toLowerCase() === 'submitted') return 'SUBMITTED';
    return status.replace(/_/g, ' ').toUpperCase();
  };

  const formatCurrency = (amount: string | number | null | undefined, currency = 'AED') => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${currency} ${formatter.format(Number(amount) || 0)}`;
  };

  const isInitialLoad = loading && (!deliveryOrders || deliveryOrders.length === 0);

  if (isInitialLoad) {
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
    <Card className={`border-0 shadow-lg transition-opacity duration-200 ${loading ? 'opacity-60' : 'opacity-100'}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5" />
          Delivery Orders ({totalCount ?? deliveryOrders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>DO Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Order Date</TableHead>
                <TableHead className="hidden md:table-cell">Reference</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Subtotal</TableHead>
                <TableHead className="hidden lg:table-cell text-right">VAT</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveryOrders.map((doOrder) => (
                <TableRow key={doOrder.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => onQuickView && onQuickView(doOrder.id)}
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-sm text-left"
                      >
                        {doOrder.orderNumber}
                      </button>
                      {(doOrder.scanKey) && (
                        <Paperclip className="w-3 h-3 text-blue-500 shrink-0" aria-label="Attachment" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{getCustomerName(doOrder)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatDate(doOrder.orderDate)}</TableCell>
                  <TableCell className="hidden md:table-cell">{doOrder.reference || '-'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    {formatCurrency(doOrder.subtotal || 0, doOrder.currency ?? 'AED')}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    {formatCurrency(doOrder.taxAmount || 0, doOrder.currency ?? 'AED')}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right">
                    {formatCurrency(doOrder.totalAmount || 0, doOrder.currency ?? 'AED')}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getStatusColor(doOrder.status)} border`}>
                      {getStatusLabel(doOrder.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DOActionsDropdown 
                      doOrder={doOrder}
                      canEdit={canEdit}
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
