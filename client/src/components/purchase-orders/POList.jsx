import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/utils/dateUtils";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ReceiveGoodsDialog from "./ReceiveGoodsDialog";
import POActionsDropdown from "./POActionsDropdown";
import { formatCurrency } from "@/utils/currency";

export default function POList({ purchaseOrders, totalCount, loading, canEdit, currentUser, onEdit, onRefresh }) {
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  const getBrandName = (po) => {
    return po.supplierName || 'Unknown Supplier';
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAedEquivalent = (po) => {
    const amount = parseFloat(po.totalAmount) || 0;
    const currency = po.currency || 'GBP';
    if (currency === 'AED') return amount;
    const rate = parseFloat(po.fxRateToAed) || 4.85;
    return amount * rate;
  };

  const handleReceiveGoods = (po) => {
    setSelectedPO(po);
    setShowReceiveDialog(true);
  };

  const canReceiveGoods = (po) => {
    return canEdit && (po.status === 'issued' || po.status === 'received');
  };

  if (loading) {
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
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Purchase Orders ({totalCount || purchaseOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Total (AED)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => {
                  const currency = po.currency || 'GBP';
                  const aedTotal = getAedEquivalent(po);
                  return (
                    <TableRow key={po.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">{po.poNumber}</TableCell>
                      <TableCell>{getBrandName(po)}</TableCell>
                      <TableCell>{formatDate(po.orderDate)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{currency}</Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(po.totalAmount || 0, currency)}</TableCell>
                      <TableCell className="text-gray-600">
                        {formatCurrency(aedTotal, 'AED')}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(po.status)} border`}>
                          {po.status?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <POActionsDropdown 
                          po={po}
                          canEdit={canEdit}
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

          {purchaseOrders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No purchase orders found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {showReceiveDialog && (
        <ReceiveGoodsDialog
          open={showReceiveDialog}
          onClose={() => setShowReceiveDialog(false)}
          purchaseOrder={selectedPO}
          onSuccess={() => {
            setShowReceiveDialog(false);
            onRefresh();
          }}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
