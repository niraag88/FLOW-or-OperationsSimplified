import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PackageCheck, Plus, Search, Save, TrendingUp, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { format } from "date-fns";

export default function GoodsReceipts() {
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);
  const [receivingItems, setReceivingItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadGoodsReceipts();
    loadPurchaseOrders();
  }, []);

  const loadGoodsReceipts = async () => {
    try {
      const response = await fetch('/api/goods-receipts', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch goods receipts');
      const data = await response.json();
      setGoodsReceipts(data);
    } catch (error) {
      console.error("Error loading goods receipts:", error);
      toast({
        title: "Error",
        description: "Failed to load goods receipts.",
        variant: "destructive",
      });
    } finally {
      setLoadingReceipts(false);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const response = await fetch('/api/purchase-orders', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch purchase orders');
      const data = await response.json();
      
      // Only show POs that are confirmed but not fully received
      const availablePOs = data.filter(po => 
        po.status === 'confirmed' || po.status === 'sent'
      );
      setPurchaseOrders(availablePOs);
    } catch (error) {
      console.error("Error loading purchase orders:", error);
      setPurchaseOrders([]);
    } finally {
      setLoadingPOs(false);
    }
  };

  const handlePOSelection = async (poId) => {
    try {
      // Get PO items
      const response = await fetch(`/api/purchase-orders/${poId}/items`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch PO items');
      const items = await response.json();
      
      const po = purchaseOrders.find(p => p.id === parseInt(poId));
      setSelectedPO(po);
      
      // Initialize receiving items with ordered quantities
      setReceivingItems(items.map(item => ({
        ...item,
        receivedQuantity: item.quantity, // Default to ordered quantity
        poItemId: item.id
      })));
    } catch (error) {
      console.error("Error loading PO items:", error);
      toast({
        title: "Error",
        description: "Failed to load purchase order items.",
        variant: "destructive",
      });
    }
  };

  const handleQuantityChange = (itemId, quantity) => {
    const numQuantity = Math.max(0, parseInt(quantity) || 0);
    setReceivingItems(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, receivedQuantity: Math.min(numQuantity, item.quantity) }
          : item
      )
    );
  };

  const handleCreateReceipt = async () => {
    if (!selectedPO || receivingItems.length === 0) return;

    setCreating(true);
    try {
      const itemsToReceive = receivingItems.filter(item => item.receivedQuantity > 0);
      
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
          items: itemsToReceive.map(item => ({
            poItemId: item.poItemId,
            productId: item.productId,
            orderedQuantity: item.quantity,
            receivedQuantity: item.receivedQuantity,
            unitPrice: item.unitPrice
          })),
          notes
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

      // Reset form and reload data
      setShowCreateDialog(false);
      setSelectedPO(null);
      setReceivingItems([]);
      setNotes("");
      loadGoodsReceipts();
      loadPurchaseOrders();
      
    } catch (error) {
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
              {/* PO Selection */}
              <div>
                <label className="text-sm font-medium">Select Purchase Order</label>
                <Select onValueChange={handlePOSelection}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a purchase order..." />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map(po => (
                      <SelectItem key={po.id} value={po.id.toString()}>
                        {po.poNumber} - {po.supplierName} ({format(new Date(po.orderDate), 'MMM dd, yyyy')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Items to Receive */}
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

                  {/* Notes */}
                  <div>
                    <label className="text-sm font-medium">Notes (Optional)</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about the receipt..."
                      className="mt-1"
                    />
                  </div>

                  {/* Create Button */}
                  <div className="flex justify-end gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateDialog(false)}
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
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsReceipts.map((receipt) => (
                  <TableRow key={receipt.id}>
                    <TableCell className="font-mono font-medium">
                      {receipt.receiptNumber}
                    </TableCell>
                    <TableCell>
                      PO#{receipt.poId}
                    </TableCell>
                    <TableCell>
                      {format(new Date(receipt.receivedDate), 'MMM dd, yyyy')}
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