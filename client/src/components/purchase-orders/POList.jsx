import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Info, Pencil, Paperclip, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/utils/dateUtils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ReceiveGoodsDialog from "./ReceiveGoodsDialog";
import MarkPOPaidDialog from "./MarkPOPaidDialog";
import POActionsDropdown from "./POActionsDropdown";
import { formatCurrency } from "@/utils/currency";

export default function POList({ purchaseOrders, totalCount, loading, canEdit, currentUser, onEdit, onRefresh }) {
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [showEditPaymentDialog, setShowEditPaymentDialog] = useState(false);
  const [editPaymentPO, setEditPaymentPO] = useState(null);

  const getBrandName = (po) => po.supplierName || 'Unknown Supplier';

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

  const isShortDelivered = (po) => {
    if (po.status !== 'closed') return false;
    const ordered = Number(po.orderedQty) || 0;
    const received = Number(po.receivedQty) || 0;
    return ordered > 0 && received < ordered;
  };

  // Uses server-computed reconciledAmount (sum of received_qty × unit_price per GRN item).
  // Returns 0 when GRNs have 0 received; returns null only when no GRN data at all.
  const getReconciledAmount = (po) => {
    if (po.reconciledAmount === null || po.reconciledAmount === undefined) {
      // If short delivery but no GRN items exist yet, treat reconciled as 0
      if (isShortDelivered(po)) return 0;
      return null;
    }
    const val = parseFloat(po.reconciledAmount);
    return Number.isFinite(val) ? val : null;
  };

  const handleReceiveGoods = (po) => {
    setSelectedPO(po);
    setShowReceiveDialog(true);
  };

  const handleEditPayment = (po) => {
    setEditPaymentPO(po);
    setShowEditPaymentDialog(true);
  };

  const formatPaymentDate = (dateVal) => {
    if (!dateVal) return null;
    try {
      return new Date(dateVal).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return null;
    }
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
    <>
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Total (AED)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => {
                  const currency = po.currency || 'GBP';
                  const aedTotal = getAedEquivalent(po);
                  const ps = po.paymentStatus || po.payment_status || 'outstanding';
                  const paidDate = po.paymentMadeDate || po.payment_made_date;
                  const remarks = po.paymentRemarks || po.payment_remarks;
                  const formattedDate = formatPaymentDate(paidDate);

                  return (
                    <TableRow key={po.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{po.poNumber}</span>
                          {po.supplierScanKey && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Paperclip className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">Supplier invoice attached</p>
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
                      <TableCell>{formatDate(po.orderDate)}</TableCell>
                      <TableCell>
                        <div>
                          <span>{formatCurrency(po.totalAmount || 0, currency)}</span>
                          {isShortDelivered(po) && getReconciledAmount(po) !== null && (
                            <div className="mt-1 flex items-center gap-0.5 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-400 rounded px-1.5 py-0.5 w-fit whitespace-nowrap">
                              Reconciled payable: {formatCurrency(getReconciledAmount(po), currency)} of {formatCurrency(po.totalAmount || 0, currency)}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatCurrency(aedTotal, 'AED')}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getStatusColor(po.status)} border`}>
                          {po.status?.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ps === 'paid' ? (
                          <div className="flex items-center gap-1.5">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="flex items-center gap-1.5 hover:opacity-75 transition-opacity cursor-pointer">
                                  <Badge className="bg-green-100 text-green-800 border border-green-200">PAID</Badge>
                                  {formattedDate && (
                                    <span className="text-xs text-gray-600 whitespace-nowrap">{formattedDate}</span>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3" align="start">
                                <p className="text-sm font-semibold text-gray-900 mb-2">Payment Details</p>
                                <div className="space-y-1.5 text-xs text-gray-700 mb-3">
                                  {formattedDate && (
                                    <div className="flex gap-1">
                                      <span className="font-medium w-16 shrink-0">Date:</span>
                                      <span>{formattedDate}</span>
                                    </div>
                                  )}
                                  {remarks && (
                                    <div className="flex gap-1">
                                      <span className="font-medium w-16 shrink-0">Remarks:</span>
                                      <span className="break-words">{remarks}</span>
                                    </div>
                                  )}
                                  {!formattedDate && !remarks && (
                                    <span className="text-gray-400 italic">No details recorded</span>
                                  )}
                                </div>
                                {canEdit && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="w-full text-xs h-7"
                                    onClick={() => handleEditPayment(po)}
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

      {showEditPaymentDialog && editPaymentPO && (
        <MarkPOPaidDialog
          open={showEditPaymentDialog}
          onClose={() => { setShowEditPaymentDialog(false); setEditPaymentPO(null); }}
          po={editPaymentPO}
          onSuccess={() => {
            setShowEditPaymentDialog(false);
            setEditPaymentPO(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
