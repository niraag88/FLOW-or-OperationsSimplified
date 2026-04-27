import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PackageCheck, Save, TrendingUp, AlertTriangle, Pencil, X, Check, Ban, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatDate } from "@/utils/dateUtils";

const STALE_3MIN = 3 * 60 * 1000;

type StatusFilter = "all" | "confirmed" | "cancelled";

type CancelDialogState = {
  open: boolean;
  grn: any | null;
  step: "initial" | "negativeStock" | "paidAck";
  negativeStock: Array<{ productId: number; productName: string; currentStock: number; reversalQty: number; projectedStock: number }>;
  negativeStockPhrase: string;
  paidMessage: string | null;
  confirmNegativeStock: boolean;
  acknowledgePaidGrn: boolean;
};

const initialCancelState: CancelDialogState = {
  open: false,
  grn: null,
  step: "initial",
  negativeStock: [],
  negativeStockPhrase: "",
  paidMessage: null,
  confirmNegativeStock: false,
  acknowledgePaidGrn: false,
};

export default function GoodsReceipts() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [receivingItems, setReceivingItems] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [refDate, setRefDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingGrnId, setEditingGrnId] = useState<number | null>(null);
  const [editRefNumber, setEditRefNumber] = useState("");
  const [editRefDate, setEditRefDate] = useState("");
  const [savingRef, setSavingRef] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [cancelDialog, setCancelDialog] = useState<CancelDialogState>(initialCancelState);
  const [cancelling, setCancelling] = useState(false);
  const [deletingGrnId, setDeletingGrnId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: goodsReceipts = [], isLoading: loadingReceipts, error: grnError } = useQuery({
    queryKey: ['/api/goods-receipts'],
    queryFn: async () => {
      const r = await fetch('/api/goods-receipts', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch goods receipts');
      return r.json();
    },
    staleTime: STALE_3MIN,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (grnError) {
      toast({ title: "Error", description: "Failed to load goods receipts.", variant: "destructive" });
    }
  }, [grnError]);

  const { data: allPOs, isLoading: loadingPOs } = useQuery({
    queryKey: ['/api/purchase-orders', 'standalone-grn'],
    queryFn: async () => {
      const r = await fetch('/api/purchase-orders', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to fetch purchase orders');
      const result = await r.json();
      return Array.isArray(result) ? result : (result.data || []);
    },
    staleTime: STALE_3MIN,
    refetchOnWindowFocus: true,
  });

  const purchaseOrders = (allPOs || []).filter((po: any) =>
    po.status === 'submitted'
  );

  const handlePOSelection = async (poId: any) => {
    try {
      const response = await fetch(`/api/purchase-orders/${poId}/items`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch PO items');
      const items = await response.json();

      const po = purchaseOrders.find((p: any) => p.id === parseInt(poId));
      setSelectedPO(po);

      setReceivingItems(items.map((item: any) => ({
        ...item,
        receivedQuantity: item.quantity,
        poItemId: item.id
      })));
    } catch (error: any) {
      console.error("Error loading PO items:", error);
      toast({
        title: "Error",
        description: "Failed to load purchase order items.",
        variant: "destructive",
      });
    }
  };

  const handleQuantityChange = (itemId: any, quantity: any) => {
    const numQuantity = Math.max(0, parseInt(quantity) || 0);
    setReceivingItems(prev =>
      prev.map((item: any) =>
        item.id === itemId
          ? { ...item, receivedQuantity: Math.min(numQuantity, item.quantity) }
          : item
      )
    );
  };

  const startEditRef = (receipt: any) => {
    setEditingGrnId(receipt.id);
    setEditRefNumber(receipt.referenceNumber || "");
    setEditRefDate(receipt.referenceDate || "");
  };

  const cancelEditRef = () => {
    setEditingGrnId(null);
    setEditRefNumber("");
    setEditRefDate("");
  };

  const openCancelDialog = (receipt: any) => {
    setCancelDialog({
      open: true,
      grn: receipt,
      step: "initial",
      negativeStock: [],
      negativeStockPhrase: "",
      paidMessage: null,
      confirmNegativeStock: false,
      acknowledgePaidGrn: receipt.paymentStatus === 'paid' ? false : true,
    });
  };

  const closeCancelDialog = () => {
    if (cancelling) return;
    setCancelDialog(initialCancelState);
  };

  const submitCancel = async (overrides?: { confirmNegativeStock?: boolean; acknowledgePaidGrn?: boolean }) => {
    if (!cancelDialog.grn) return;
    const grn = cancelDialog.grn;
    const body = {
      confirmNegativeStock: overrides?.confirmNegativeStock ?? cancelDialog.confirmNegativeStock,
      acknowledgePaidGrn: overrides?.acknowledgePaidGrn ?? cancelDialog.acknowledgePaidGrn,
    };
    setCancelling(true);
    try {
      const res = await fetch(`/api/goods-receipts/${grn.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'paid_grn_requires_ack') {
          setCancelDialog(prev => ({ ...prev, step: 'paidAck', paidMessage: data.message || 'This GRN is marked as paid.' }));
          return;
        }
        if (data.error === 'negative_stock') {
          setCancelDialog(prev => ({ ...prev, step: 'negativeStock', negativeStock: data.products || [] }));
          return;
        }
        toast({ title: 'Cannot cancel GRN', description: data.error || data.message || 'Conflict', variant: 'destructive' });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const negCount = Array.isArray(data.negativeStock) ? data.negativeStock.length : 0;
      toast({
        title: `GRN ${grn.receiptNumber} cancelled`,
        description: negCount > 0
          ? `Stock reversed. WARNING: ${negCount} product(s) now show negative stock.`
          : `Stock reversed for ${data.reversedProducts?.length || 0} product(s). Original receipt history preserved.`,
        variant: negCount > 0 ? 'destructive' : 'default',
      });
      await queryClient.invalidateQueries({ queryKey: ['/api/goods-receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });
      setCancelDialog(initialCancelState);
    } catch (err: any) {
      console.error('Failed to cancel GRN:', err);
      toast({ title: 'Cancellation failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  const handleDeleteCancelled = async (receipt: any) => {
    const ok = window.confirm(
      `Permanently delete cancelled GRN ${receipt.receiptNumber}? Its line items and stock movement history (both original and reversal) will be removed. This cannot be undone.`
    );
    if (!ok) return;
    setDeletingGrnId(receipt.id);
    try {
      const res = await fetch(`/api/goods-receipts/${receipt.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      toast({ title: `GRN ${receipt.receiptNumber} deleted`, description: 'Cancelled receipt removed.' });
      await queryClient.invalidateQueries({ queryKey: ['/api/goods-receipts'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
    } catch (err: any) {
      console.error('Failed to delete cancelled GRN:', err);
      toast({ title: 'Delete failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setDeletingGrnId(null);
    }
  };

  const saveRef = async (grnId: number) => {
    setSavingRef(true);
    try {
      const res = await fetch(`/api/goods-receipts/${grnId}/reference`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referenceNumber: editRefNumber || null, referenceDate: editRefDate || null }),
      });
      if (!res.ok) throw new Error('Failed to save');
      await queryClient.invalidateQueries({ queryKey: ['/api/goods-receipts'] });
      setEditingGrnId(null);
      toast({ title: 'Reference saved' });
    } catch {
      toast({ title: 'Error', description: 'Could not save reference.', variant: 'destructive' });
    } finally {
      setSavingRef(false);
    }
  };

  const handleCreateReceipt = async () => {
    if (!selectedPO || receivingItems.length === 0) return;

    setCreating(true);
    try {
      const itemsToReceive = receivingItems.filter((item: any) => item.receivedQuantity > 0);

      if (itemsToReceive.length === 0) {
        toast({
          title: "No Items",
          description: "Please enter received quantities for at least one item.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      const response = await fetch('/api/goods-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          poId: selectedPO.id,
          items: itemsToReceive.map((item: any) => ({
            poItemId: item.poItemId,
            productId: item.productId,
            orderedQuantity: item.quantity,
            receivedQuantity: item.receivedQuantity,
            unitPrice: item.unitPrice
          })),
          notes,
          referenceNumber: refNumber || undefined,
          referenceDate: refDate || undefined,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create goods receipt');
      }

      const result = await response.json();

      toast({
        title: "Success",
        description: result.message,
      });

      setShowCreateDialog(false);
      setSelectedPO(null);
      setReceivingItems([]);
      setNotes("");
      setRefNumber("");
      setRefDate("");

      queryClient.invalidateQueries({ queryKey: ['/api/goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });

    } catch (error: any) {
      console.error("Error creating goods receipt:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create goods receipt.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goods Receipts</h1>
          <p className="text-gray-600">Receive items from purchase orders and update stock automatically</p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700">
              <PackageCheck className="w-4 h-4 mr-2" />
              Receive Goods
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Goods Receipt</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Select Purchase Order</label>
                <Select onValueChange={handlePOSelection} disabled={loadingPOs}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingPOs ? "Loading..." : "Choose a purchase order..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po: any) => (
                      <SelectItem key={po.id} value={po.id.toString()}>
                        {po.poNumber} - {po.brandName || po.supplierName} ({format(new Date(po.orderDate), 'dd/MM/yy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedPO && (
                <>
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Items to Receive</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Ordered Qty</TableHead>
                          <TableHead>Received Qty</TableHead>
                          <TableHead>Unit Price ({selectedPO?.currency || 'AED'})</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receivingItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.productName}</p>
                                <p className="text-xs text-gray-500">{item.productSku}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.quantity}</Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                max={item.quantity}
                                value={item.receivedQuantity}
                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                className="w-24"
                                data-testid={`input-received-${item.id}`}
                              />
                            </TableCell>
                            <TableCell>
                              {selectedPO?.currency || 'AED'} {parseFloat(item.unitPrice).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="ref-number" className="text-sm font-medium">Reference Number (Optional)</Label>
                      <Input
                        id="ref-number"
                        type="text"
                        placeholder="e.g. INV-2024-001"
                        value={refNumber}
                        onChange={(e) => setRefNumber(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ref-date" className="text-sm font-medium">Reference Date (Optional)</Label>
                      <Input
                        id="ref-date"
                        type="date"
                        value={refDate}
                        onChange={(e) => setRefDate(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Notes (Optional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about the receipt..."
                      className="mt-1"
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCreateDialog(false);
                        setRefNumber("");
                        setRefDate("");
                      }}
                      disabled={creating}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateReceipt}
                      disabled={creating || receivingItems.every(item => item.receivedQuantity === 0)}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {creating ? "Creating..." : "Create Receipt & Update Stock"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goods Receipts Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="w-5 h-5" />
              Recent Goods Receipts
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Status:</span>
              {(["all", "confirmed", "cancelled"] as StatusFilter[]).map(opt => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStatusFilter(opt)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === opt
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                  data-testid={`grn-filter-${opt}`}
                >
                  {opt === 'all' ? 'All' : opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingReceipts ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt #</TableHead>
                  <TableHead>Purchase Order</TableHead>
                  <TableHead>Received Date</TableHead>
                  <TableHead>Reference Number</TableHead>
                  <TableHead>Reference Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsReceipts
                  .filter((r: any) => statusFilter === 'all' ? true : r.status === statusFilter)
                  .map((receipt: any) => (
                  <TableRow key={receipt.id} className={receipt.status === 'cancelled' ? 'bg-red-50/40' : ''}>
                    <TableCell className="font-mono font-medium">
                      {receipt.receiptNumber}
                    </TableCell>
                    <TableCell>
                      {receipt.poNumber || `PO#${receipt.poId}`}
                    </TableCell>
                    <TableCell>
                      {format(new Date(receipt.receivedDate), 'dd/MM/yy')}
                    </TableCell>
                    <TableCell>
                      {editingGrnId === receipt.id ? (
                        <Input
                          value={editRefNumber}
                          onChange={(e) => setEditRefNumber(e.target.value)}
                          placeholder="Reference number"
                          className="h-7 text-xs w-36"
                        />
                      ) : (
                        <span className="text-sm text-gray-700">{receipt.referenceNumber || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingGrnId === receipt.id ? (
                        <Input
                          type="date"
                          value={editRefDate}
                          onChange={(e) => setEditRefDate(e.target.value)}
                          className="h-7 text-xs w-32"
                        />
                      ) : (
                        <span className="text-sm text-gray-600">
                          {receipt.referenceDate ? formatDate(receipt.referenceDate) : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant={receipt.status === 'confirmed' ? 'default' : 'secondary'}
                          className={
                            receipt.status === 'confirmed'
                              ? 'bg-green-100 text-green-800'
                              : receipt.status === 'cancelled'
                                ? 'bg-red-100 text-red-800 border border-red-200'
                                : ''
                          }
                        >
                          {receipt.status}
                        </Badge>
                        {receipt.isPartial && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 cursor-default">
                                <AlertTriangle className="w-3 h-3" />
                                Partial
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <p className="text-xs">Received quantity is less than ordered</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {receipt.notes || '-'}
                    </TableCell>
                    <TableCell>
                      {editingGrnId === receipt.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => saveRef(receipt.id)}
                            disabled={savingRef}
                            className="p-1 text-green-600 hover:text-green-800 transition-colors"
                            title="Save reference"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={cancelEditRef}
                            disabled={savingRef}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditRef(receipt)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Edit reference"
                            data-testid={`grn-edit-ref-${receipt.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {receipt.status === 'confirmed' && (
                            <button
                              onClick={() => openCancelDialog(receipt)}
                              className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                              title="Cancel GRN (reverse stock, keep audit trail)"
                              data-testid={`grn-cancel-${receipt.id}`}
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {receipt.status === 'cancelled' && (
                            <button
                              onClick={() => handleDeleteCancelled(receipt)}
                              disabled={deletingGrnId === receipt.id}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Permanently delete cancelled GRN"
                              data-testid={`grn-delete-${receipt.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {goodsReceipts.length === 0 && !loadingReceipts && (
            <div className="text-center py-12 text-gray-500">
              <PackageCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No goods receipts yet</p>
              <p className="text-sm mt-2">Receive items from purchase orders to start tracking stock</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900">Automated Stock Management</h3>
              <p className="text-sm text-blue-700 mt-1">
                When you receive goods from purchase orders, stock levels are automatically updated.
                When you create invoices and process sales, stock is automatically deducted.
              </p>
              <div className="mt-3 text-xs text-blue-600">
                <p>📦 PO → Goods Receipt → <strong>Stock Added</strong></p>
                <p>📋 Invoice → Sale Processed → <strong>Stock Deducted</strong></p>
                <p>🚫 GRN Cancelled → <strong>Stock Reversed</strong> (original receipt history preserved)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cancel GRN Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(open) => { if (!open) closeCancelDialog(); }}>
        <DialogContent className="max-w-lg" data-testid="grn-cancel-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <Ban className="w-5 h-5" />
              Cancel Goods Receipt {cancelDialog.grn?.receiptNumber}
            </DialogTitle>
          </DialogHeader>

          {cancelDialog.step === 'initial' && (() => {
            const items: Array<{ id: number; productId: number; productName: string | null; receivedQuantity: number }> =
              cancelDialog.grn?.items ?? [];
            const reversalByProduct = new Map<number, { name: string; qty: number }>();
            for (const it of items) {
              const qty = Number(it.receivedQuantity ?? 0);
              if (qty <= 0) continue;
              const existing = reversalByProduct.get(it.productId);
              if (existing) {
                existing.qty += qty;
              } else {
                reversalByProduct.set(it.productId, {
                  name: it.productName ?? `Product #${it.productId}`,
                  qty,
                });
              }
            }
            const reversalRows = Array.from(reversalByProduct.entries()).map(([productId, v]) => ({
              productId,
              name: v.name,
              qty: v.qty,
            }));

            return (
              <div className="space-y-3 text-sm text-gray-700">
                <p>
                  Cancelling this GRN will <strong>reverse the stock</strong> it added (a new reversal stock movement
                  will be recorded against each affected product) and mark the receipt as <strong>cancelled</strong>.
                </p>
                {reversalRows.length > 0 ? (
                  <div className="border rounded overflow-hidden" data-testid="grn-cancel-reversal-preview">
                    <div className="bg-gray-50 px-2 py-1.5 text-xs font-semibold text-gray-700 border-b">
                      Stock that will be reversed ({reversalRows.length} product{reversalRows.length === 1 ? '' : 's'})
                    </div>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-2 py-1.5">Product</th>
                          <th className="text-right px-2 py-1.5">Reverse qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reversalRows.map((r) => (
                          <tr key={r.productId} className="border-t">
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5 text-right font-mono">-{r.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs italic text-gray-500">
                    This GRN has no positive received quantities — only the receipt status will change.
                  </p>
                )}
                <p className="text-xs">
                  The original receipt and its stock movement history will be <strong>preserved</strong> for audit.
                  You cannot undo a cancellation.
                </p>
                {cancelDialog.grn?.paymentStatus === 'paid' && (
                  <p className="rounded bg-amber-50 border border-amber-200 p-2 text-amber-800 text-xs">
                    <strong>Heads up:</strong> this GRN is marked as paid to the supplier. You'll be asked to acknowledge
                    this on the next step.
                  </p>
                )}
              </div>
            );
          })()}

          {cancelDialog.step === 'paidAck' && (
            <div className="space-y-3 text-sm">
              <div className="rounded bg-amber-50 border border-amber-300 p-3 text-amber-900">
                <p className="font-semibold mb-1">Paid GRN — supplier acknowledgement required</p>
                <p className="text-xs">{cancelDialog.paidMessage}</p>
              </div>
              <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={cancelDialog.acknowledgePaidGrn}
                  onChange={(e) => setCancelDialog(prev => ({ ...prev, acknowledgePaidGrn: e.target.checked }))}
                  data-testid="grn-cancel-ack-paid"
                />
                <span>I acknowledge that this GRN was paid to the supplier and cancelling it does not refund the payment. I will handle the supplier-side accounting (e.g. debit note) separately.</span>
              </label>
            </div>
          )}

          {cancelDialog.step === 'negativeStock' && (
            <div className="space-y-3 text-sm">
              <div className="rounded bg-red-50 border border-red-300 p-3 text-red-900">
                <p className="font-semibold mb-1">Cancelling will produce negative stock</p>
                <p className="text-xs">
                  Stock for the products below has likely already been sold or adjusted since this GRN was confirmed.
                  Proceeding will leave them with a negative stock count, which usually means goods were sold from this
                  receipt that we no longer claim to have received.
                </p>
              </div>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-2 py-1.5">Product</th>
                      <th className="text-right px-2 py-1.5">Current</th>
                      <th className="text-right px-2 py-1.5">Reverse</th>
                      <th className="text-right px-2 py-1.5">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelDialog.negativeStock.map((p) => (
                      <tr key={p.productId} className="border-t">
                        <td className="px-2 py-1.5">{p.productName}</td>
                        <td className="px-2 py-1.5 text-right">{p.currentStock}</td>
                        <td className="px-2 py-1.5 text-right">-{p.reversalQty}</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-red-700">{p.projectedStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-gray-700 space-y-1.5">
                <p>
                  This is a destructive action. To confirm, type the phrase
                  {' '}<span className="font-mono font-semibold text-red-700">CANCEL ANYWAY</span>{' '}
                  exactly into the box below.
                </p>
                <input
                  type="text"
                  className="w-full border rounded px-2 py-1.5 text-sm font-mono"
                  placeholder="Type CANCEL ANYWAY to enable the button"
                  value={cancelDialog.negativeStockPhrase}
                  onChange={(e) => setCancelDialog(prev => ({
                    ...prev,
                    negativeStockPhrase: e.target.value,
                    confirmNegativeStock: e.target.value.trim() === 'CANCEL ANYWAY',
                  }))}
                  data-testid="grn-cancel-confirm-negative-phrase"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeCancelDialog} disabled={cancelling}>
              Keep GRN
            </Button>
            {cancelDialog.step === 'initial' && (
              <Button
                variant="destructive"
                onClick={() => submitCancel()}
                disabled={cancelling}
                data-testid="grn-cancel-confirm"
              >
                {cancelling ? 'Cancelling…' : 'Cancel GRN & reverse stock'}
              </Button>
            )}
            {cancelDialog.step === 'paidAck' && (
              <Button
                variant="destructive"
                onClick={() => submitCancel({ acknowledgePaidGrn: true })}
                disabled={cancelling || !cancelDialog.acknowledgePaidGrn}
                data-testid="grn-cancel-confirm-paid"
              >
                {cancelling ? 'Cancelling…' : 'Acknowledge & cancel'}
              </Button>
            )}
            {cancelDialog.step === 'negativeStock' && (
              <Button
                variant="destructive"
                onClick={() => submitCancel({ confirmNegativeStock: true, acknowledgePaidGrn: cancelDialog.acknowledgePaidGrn || cancelDialog.grn?.paymentStatus !== 'paid' })}
                disabled={cancelling || !cancelDialog.confirmNegativeStock}
                data-testid="grn-cancel-confirm-negative-proceed"
              >
                {cancelling ? 'Cancelling…' : 'Cancel anyway'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
