import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Paperclip, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/utils/dateUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import POActionsDropdown from "./POActionsDropdown";
import { formatCurrency } from "@/utils/currency";
import type { PurchaseOrder } from "@shared/schema";

interface POListProps {
  purchaseOrders: PurchaseOrder[];
  totalCount: number;
  loading: boolean;
  canEdit: boolean;
  currentUser?: { email?: string; role?: string } | null;
  onEdit: (po: Record<string, any>) => void;
  onRefresh: () => void;
  onQuickView: (id: number) => void;
}

function getPaymentBadge(ps: string) {
  switch (ps) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 border border-green-200">PAID</Badge>;
    case 'partially_paid':
      return <Badge className="bg-orange-100 text-orange-800 border border-orange-200">PARTIALLY PAID</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-700 border border-gray-200">OUTSTANDING</Badge>;
  }
}

export default function POList({ purchaseOrders, totalCount, loading, canEdit, currentUser, onEdit, onRefresh, onQuickView }: POListProps) {
  const getBrandName = (po: any) => po.brandName || po.supplierName || '';

  const getStatusColor = (status: any) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAedEquivalent = (po: any) => {
    const amount = parseFloat(po.totalAmount) || 0;
    const currency = po.currency || 'GBP';
    if (currency === 'AED') return amount;
    const rate = parseFloat(po.fxRateToAed) || 4.85;
    return amount * rate;
  };

  const isShortDelivered = (po: any) => {
    const ordered = Number(po.orderedQty) || 0;
    const received = Number(po.receivedQty) || 0;
    return ordered > 0 && received > 0 && received < ordered;
  };

  const isInitialLoad = loading && (!purchaseOrders || purchaseOrders.length === 0);

  if (isInitialLoad) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Purchase Orders
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
          <ShoppingCart className="w-5 h-5" />
          Purchase Orders ({totalCount || purchaseOrders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="hidden sm:table-cell">Order Date</TableHead>
                <TableHead className="hidden md:table-cell text-right">Total</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Total (AED)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Payment</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseOrders.map((po: any) => {
                const currency = po.currency || 'GBP';
                const aedTotal = getAedEquivalent(po);
                const ps = po.paymentStatus || po.payment_status || 'outstanding';

                return (
                  <TableRow key={po.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onQuickView && onQuickView(po.id)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left transition-colors"
                        >
                          {po.poNumber}
                        </button>
                        {(po.supplierScanKey || po.hasGrnAttachment) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Paperclip className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Documents attached — open PO to view</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {isShortDelivered(po) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Short delivery: {po.receivedQty}/{po.orderedQty} units received</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{getBrandName(po)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(po.orderDate)}</TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      {formatCurrency(po.totalAmount || 0, currency)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-gray-600">
                      {formatCurrency(aedTotal, 'AED')}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getStatusColor(po.status)} border`}>
                        {po.status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {getPaymentBadge(ps)}
                    </TableCell>
                    <TableCell>
                      <POActionsDropdown
                        po={po}
                        canEdit={canEdit}
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

        {purchaseOrders.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No purchase orders found</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
