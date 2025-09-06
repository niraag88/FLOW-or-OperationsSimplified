
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, CheckCircle2, Package, Truck, MoreHorizontal, XCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { PurchaseOrder } from "@/api/entities";
import { GoodsReceipt } from "@/api/entities";
import { InventoryLot } from "@/api/entities";
import { InventoryAudit } from "@/api/entities";
import { Brand } from "@/api/entities";
import { useToast } from "@/hooks/use-toast";
import { logStatusChange, logAuditAction } from "../utils/auditLogger";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function GoodsReceiptsTab({ purchaseOrders, products, goodsReceipts, loading, canEdit, currentUser, onRefresh }) {
  const [brands, setBrands] = useState([]);
  const [receivingQuantities, setReceivingQuantities] = useState({});
  const [processingPO, setProcessingPO] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingPO, setClosingPO] = useState(null);
  const [selectedPOForReceive, setSelectedPOForReceive] = useState(null);
  const [receiveQuantities, setReceiveQuantities] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [poItemsData, setPOItemsData] = useState({});
  const { toast } = useToast();

  React.useEffect(() => {
    loadBrands();
  }, []);

  React.useEffect(() => {
    // Fetch PO items for all submitted purchase orders
    const fetchPOItemsData = async () => {
      const submittedPOs = purchaseOrders.filter(po => po.status === 'submitted');
      const itemsData = {};
      
      for (const po of submittedPOs) {
        try {
          const response = await fetch(`/api/purchase-orders/${po.id}/items`);
          if (response.ok) {
            const items = await response.json();
            itemsData[po.id] = items;
          }
        } catch (error) {
          console.error(`Error fetching items for PO ${po.id}:`, error);
        }
      }
      
      setPOItemsData(itemsData);
    };

    if (purchaseOrders.length > 0) {
      fetchPOItemsData();
    }
  }, [purchaseOrders]);

  const loadBrands = async () => {
    try {
      const brandsData = await Brand.list();
      setBrands(brandsData);
    } catch (error) {
      console.error("Error loading brands:", error);
    }
  };

  const getBrandName = (brandId) => {
    const brand = brands.find(b => b.id === brandId);
    return brand?.name || 'Unknown Brand';
  };

  const getProductInfo = (productId) => {
    return products.find(p => p.id === productId) || {};
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleQuantityChange = (poId, itemIndex, quantity) => {
    setReceivingQuantities(prev => ({
      ...prev,
      [`${poId}-${itemIndex}`]: parseInt(quantity) || 0
    }));
  };

  const handleReceiveQuantityChange = (itemId, value) => {
    setReceiveQuantities(prev => ({
      ...prev,
      [itemId]: value === '' ? '' : Math.max(0, parseInt(value) || 0)
    }));
  };

  const calculateTotalOrderedQuantity = (poId) => {
    const items = poItemsData[poId];
    if (!items) return "-";
    
    return items.reduce((total, item) => total + (item.quantity || 0), 0);
  };

  const calculateTotalReceivedQuantity = (poId) => {
    const items = poItemsData[poId];
    if (!items) return 0;
    
    // Calculate total received for each item using the existing function
    let totalReceived = 0;
    items.forEach(item => {
      totalReceived += getReceivedQuantityForItem(poId, item.productId);
    });
    return totalReceived;
  };

  const calculateLineItemsCount = (poId) => {
    const items = poItemsData[poId];
    return items ? items.length : "-";
  };

  const openReceiveDialog = (po) => {
    // Use the pre-fetched items data
    const items = poItemsData[po.id];
    
    if (!items) {
      toast({
        title: "Error",
        description: "Purchase order items not loaded. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Set the selected PO with items
    setSelectedPOForReceive({
      ...po,
      items: items
    });
    
    // Initialize receive quantities to 0 for all items
    const initialQuantities = {};
    items.forEach(item => {
      initialQuantities[item.id] = '';
    });
    setReceiveQuantities(initialQuantities);
  };

  const handleSaveReceive = async (forceClose = false) => {
    if (!selectedPOForReceive) return;

    try {
      setProcessingPO(selectedPOForReceive.id);

      const items = selectedPOForReceive.items?.map(item => {
        const receivedQuantity = receiveQuantities[item.id] || 0;
        return {
          poItemId: item.id,
          productId: item.productId,
          orderedQuantity: item.quantity,
          receivedQuantity: receivedQuantity,
          unitPrice: item.unitPrice
        };
      }) || [];

      if (items.every(item => item.receivedQuantity === 0) && !forceClose) {
        toast({
          title: "No quantities entered",
          description: "Please enter at least one quantity to receive or use 'Save & Close' to close the PO.",
          variant: "destructive"
        });
        return;
      }

      const response = await fetch('/api/goods-receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          poId: selectedPOForReceive.id,
          items: items,
          notes: receiveNotes,
          forceClose: forceClose
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create goods receipt');
      }

      const result = await response.json();

      toast({
        title: "Goods received successfully",
        description: result.message,
        variant: "default"
      });

      // Reset form state
      setSelectedPOForReceive(null);
      setReceiveQuantities({});
      setReceiveNotes('');
      
      // Refresh the data
      if (onRefresh) {
        onRefresh();
      }

    } catch (error) {
      console.error('Error creating goods receipt:', error);
      toast({
        title: "Error",
        description: "Failed to receive goods. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingPO(null);
    }
  };

  const getReceivedQuantityForItem = (poId, productId) => {
    const relatedGRNs = goodsReceipts.filter(grn => grn.purchase_order_id === poId);
    let totalReceived = 0;
    
    relatedGRNs.forEach(grn => {
      grn.items?.forEach(item => {
        if (item.product_id === productId) {
          totalReceived += item.received_quantity || 0;
        }
      });
    });
    
    return totalReceived;
  };

  const canClosePO = (po) => {
    if (!po.items || po.items.length === 0) return false;
    
    return po.items.every(item => {
      const totalReceived = getReceivedQuantityForItem(po.id, item.product_id);
      return totalReceived >= item.quantity;
    });
  };

  const handleReceiveItems = async (po) => {
    if (!canEdit) return;
    
    setProcessingPO(po.id);
    
    try {
      // Generate GRN number
      const timestamp = Date.now().toString().slice(-6);
      const grnNumber = `GRN-${timestamp}`;
      
      // Prepare items to receive
      const itemsToReceive = po.items?.map((item, index) => {
        const receivingQty = receivingQuantities[`${po.id}-${index}`] || 0;
        return {
          product_id: item.product_id,
          ordered_quantity: item.quantity,
          received_quantity: receivingQty,
          unit_price: item.unit_price,
          batch_no: `BATCH-${Date.now()}-${index}`,
          location: "Warehouse A"
        };
      }).filter(item => item.received_quantity > 0) || [];

      if (itemsToReceive.length === 0) {
        toast({
          title: "No items to receive",
          description: "Please enter quantities for items to receive",
          variant: "destructive"
        });
        setProcessingPO(null);
        return;
      }

      // Create GRN
      const grnData = {
        grn_number: grnNumber,
        purchase_order_id: po.id,
        supplier_id: po.supplierId,
        receipt_date: new Date().toISOString().split('T')[0],
        received_by: currentUser.email,
        notes: `Received via goods receipt tab`,
        items: itemsToReceive
      };

      const newGRN = await GoodsReceipt.create(grnData);
      await logAuditAction("GoodsReceipt", newGRN.id, "create", currentUser.email, { grn_number: newGRN.grn_number });

      // Create inventory lots and audit entries
      for (const item of itemsToReceive) {
        // Create inventory lot
        const lotData = {
          product_id: item.product_id,
          batch_no: item.batch_no,
          location: item.location,
          qty_on_hand: item.received_quantity,
          cost_per_unit: item.unit_price,
          currency: po.currency || 'GBP',
          notes: `Received via GRN ${grnNumber}`,
          is_active: true
        };

        const newLot = await InventoryLot.create(lotData);

        // Create inventory audit entry
        await InventoryAudit.create({
          inventory_lot_id: newLot.id,
          product_id: item.product_id,
          adjustment_type: "increase",
          previous_qty: 0,
          adjusted_qty: item.received_quantity,
          difference: item.received_quantity,
          reason: `Goods received via PO ${po.poNumber}`,
          reference_document: po.poNumber,
          adjusted_by: currentUser.email,
          adjustment_date: new Date().toISOString()
        });
      }

      // Check if PO should be closed
      const updatedPO = { ...po };
      let shouldClose = true;
      
      updatedPO.items = po.items?.map(item => {
        const totalReceived = getReceivedQuantityForItem(po.id, item.product_id) + 
          (itemsToReceive.find(i => i.product_id === item.product_id)?.received_quantity || 0);
        
        if (totalReceived < item.quantity) {
          shouldClose = false;
        }
        
        return {
          ...item,
          received_quantity: totalReceived
        };
      });

      // Update PO status if all items are received
      if (shouldClose && po.status !== 'closed') {
        await PurchaseOrder.update(po.id, { status: 'closed' });
        await logStatusChange("PurchaseOrder", po.id, currentUser.email, po.status, 'closed', { reason: 'All items received' });

        toast({
          title: "Purchase Order Closed",
          description: `${po.poNumber} has been automatically closed as all items are received.`
        });
      } else {
        toast({
          title: "Items Received",
          description: `${itemsToReceive.length} item(s) received via GRN ${grnNumber}`
        });
      }

      // Clear receiving quantities
      setReceivingQuantities(prev => {
        const newQuantities = { ...prev };
        po.items?.forEach((_, index) => {
          delete newQuantities[`${po.id}-${index}`];
        });
        return newQuantities;
      });

      onRefresh();
    } catch (error) {
      console.error("Error receiving items:", error);
      toast({
        title: "Error",
        description: "Failed to receive items. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingPO(null);
    }
  };

  const handleForceCloseClick = (po) => {
    setClosingPO(po);
    setShowCloseConfirm(true);
  };

  const handleConfirmForceClose = async () => {
    if (!closingPO || !canEdit) return;
    setProcessingPO(closingPO.id);
    try {
      await PurchaseOrder.update(closingPO.id, { status: 'closed' });
      await logStatusChange(
        "PurchaseOrder",
        closingPO.id,
        currentUser.email,
        closingPO.status,
        'closed',
        { reason: 'Manual force close by user.' }
      );
      toast({ title: "Success", description: `PO #${closingPO.poNumber} has been closed.` });
      onRefresh();
    } catch (error) {
      console.error("Error force closing PO:", error);
      toast({ title: "Error", description: "Could not close the Purchase Order.", variant: "destructive" });
    } finally {
      setProcessingPO(null);
      setShowCloseConfirm(false);
      setClosingPO(null);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Goods Receipts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const openPOs = purchaseOrders.filter(po => po.status === 'submitted');

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Goods Receipts
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            Receive items from submitted purchase orders.
          </p>
        </CardHeader>
        <CardContent>
          {openPOs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No Submitted Purchase Orders</p>
              <p>There are no purchase orders awaiting goods receipt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Total (GBP)</TableHead>
                    <TableHead>Total (AED)</TableHead>
                    <TableHead>Line Items</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openPOs.map((po) => {
                    const totalOrderedQty = calculateTotalOrderedQuantity(po.id);
                    const totalReceivedQty = calculateTotalReceivedQuantity(po.id);
                    const lineItemsCount = calculateLineItemsCount(po.id);
                    
                    return (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.poNumber}</TableCell>
                        <TableCell>{getBrandName(po.supplierId)}</TableCell>
                        <TableCell>
                          {po.orderDate && !isNaN(new Date(po.orderDate)) ? 
                            format(new Date(po.orderDate), 'dd/MM/yy') : 
                            '-'
                          }
                        </TableCell>
                        <TableCell>GBP {parseFloat(po.totalAmount || 0).toFixed(2)}</TableCell>
                        <TableCell>AED {parseFloat(po.grandTotal || 0).toFixed(2)}</TableCell>
                        <TableCell>{lineItemsCount}</TableCell>
                        <TableCell>{totalOrderedQty}</TableCell>
                        <TableCell>{totalReceivedQty}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-blue-300 text-blue-800 bg-blue-50">
                            {po.status?.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            onClick={() => openReceiveDialog(po)}
                            disabled={!canEdit || processingPO === po.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            {processingPO === po.id ? "Processing..." : "Receive"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Receive Goods Dialog */}
      <Dialog open={!!selectedPOForReceive} onOpenChange={() => {
        setSelectedPOForReceive(null);
        setReceiveQuantities({});
        setReceiveNotes('');
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Receive Goods - PO #{selectedPOForReceive?.poNumber}</DialogTitle>
            <DialogDescription>
              Enter the quantities received for each product. You can receive partial quantities and continue receiving more later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Already Received</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Receiving Now</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPOForReceive?.items?.map((item, index) => {
                  const totalReceived = getReceivedQuantityForItem(selectedPOForReceive.id, item.productId);
                  const remaining = item.quantity - totalReceived;
                  
                  return (
                    <TableRow key={index}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.productName}</p>
                          <p className="text-sm text-gray-500">{item.productSku} • {item.size}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{totalReceived}</TableCell>
                      <TableCell>
                        <Badge variant={remaining > 0 ? "secondary" : "default"}>
                          {remaining}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          placeholder="0"
                          value={receiveQuantities[item.id] || ''}
                          onChange={(e) => handleReceiveQuantityChange(item.id, e.target.value)}
                          disabled={remaining <= 0}
                          className="w-24"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="space-y-2">
              <Label htmlFor="receive-notes">Notes (optional)</Label>
              <Textarea
                id="receive-notes"
                placeholder="Add any notes about this goods receipt..."
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => {
              setSelectedPOForReceive(null);
              setReceiveQuantities({});
              setReceiveNotes('');
            }}>
              Cancel
            </Button>
            
            {/* Dynamic button logic based on whether all quantities match */}
            {(() => {
              const allItemsFullyReceived = selectedPOForReceive?.items?.every(item => {
                const totalReceived = getReceivedQuantityForItem(selectedPOForReceive.id, item.productId);
                const currentReceiving = receiveQuantities[item.id] || 0;
                return (totalReceived + currentReceiving) >= item.quantity;
              });

              const hasQuantitiesToReceive = selectedPOForReceive?.items?.some(item => receiveQuantities[item.id] > 0);

              if (allItemsFullyReceived && hasQuantitiesToReceive) {
                // All quantities match - only show "Save & Close"
                return (
                  <Button 
                    onClick={() => handleSaveReceive(true)}
                    disabled={processingPO === selectedPOForReceive?.id}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {processingPO === selectedPOForReceive?.id ? "Processing..." : "Save & Close"}
                  </Button>
                );
              } else {
                // Not all quantities match - show both options
                return (
                  <>
                    <Button 
                      variant="outline"
                      onClick={() => handleSaveReceive(false)}
                      disabled={processingPO === selectedPOForReceive?.id || !hasQuantitiesToReceive}
                    >
                      {processingPO === selectedPOForReceive?.id ? "Processing..." : "Save"}
                    </Button>
                    <Button 
                      onClick={() => handleSaveReceive(true)}
                      disabled={processingPO === selectedPOForReceive?.id}
                      variant="destructive"
                    >
                      {processingPO === selectedPOForReceive?.id ? "Processing..." : "Save & Close"}
                    </Button>
                  </>
                );
              }
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SimpleConfirmDialog
        open={showCloseConfirm}
        onOpenChange={setShowCloseConfirm}
        title="Force Close Purchase Order"
        description={`Are you sure you want to manually close PO #${closingPO?.poNumber}? This should only be done if you are not expecting any more items. This action cannot be undone.`}
        onConfirm={handleConfirmForceClose}
        confirmText="Yes, Close PO"
        variant="destructive"
      />
    </>
  );
}
