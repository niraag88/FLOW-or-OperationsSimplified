import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PackageCheck, Save, TrendingUp, AlertTriangle, Pencil, X, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatDate } from "@/utils/dateUtils";

const STALE_3MIN = 3 * 60 * 1000;

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
                        {po.poNumber} - {po.supplierName} ({format(new Date(po.orderDate), 'dd/MM/yy')})
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
                          <TableHead>Unit Price</TableHead>
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
                              ${parseFloat(item.unitPrice).toFixed(2)}
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
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5" />
            Recent Goods Receipts
          </CardTitle>
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
                {goodsReceipts.map((receipt: any) => (
                  <TableRow key={receipt.id}>
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
                          placeholder="Ref no."
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
                          className={receipt.status === 'confirmed' ? 'bg-green-100 text-green-800' : ''}
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
                        <button
                          onClick={() => startEditRef(receipt)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit reference"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
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
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
