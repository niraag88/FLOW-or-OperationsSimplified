
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingCart, CheckCircle2, Package, Truck, MoreHorizontal, XCircle, ChevronDown, ChevronRight, Eye, Download, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import ExportDropdown from "../common/ExportDropdown";
import { format } from "date-fns";
import { PurchaseOrder } from "@/api/entities";
import { GoodsReceipt } from "@/api/entities";
import { InventoryLot } from "@/api/entities";
import { InventoryAudit } from "@/api/entities";
import { useToast } from "@/hooks/use-toast";
import { logStatusChange, logAuditAction } from "../utils/auditLogger";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import { RecycleBin } from "@/api/entities";
import { AuditLog } from "@/api/entities";
import { User } from "@/api/entities";

export default function GoodsReceiptsTab({ purchaseOrders, products, goodsReceipts, loading, canEdit, currentUser, onRefresh }) {
  const [receivingQuantities, setReceivingQuantities] = useState({});
  const [processingPO, setProcessingPO] = useState(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingPO, setClosingPO] = useState(null);
  const [selectedPOForReceive, setSelectedPOForReceive] = useState(null);
  const [receiveQuantities, setReceiveQuantities] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [showClosedReceipts, setShowClosedReceipts] = useState(false);
  const [showOpenReceipts, setShowOpenReceipts] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingPO, setDeletingPO] = useState(null);
  const { toast } = useToast();


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

  // These functions now simply return the server-provided data
  const getLineItemsCount = (po) => po.lineItems || 0;
  const getTotalOrderedQuantity = (po) => po.orderedQty || 0;
  const getTotalReceivedQuantity = (po) => po.receivedQty || 0;

  // Handler functions for closed PO actions
  const handleViewAndPrint = (po) => {
    // Open print view in new tab for PDF printing
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Purchase Order ${po.poNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .print-header { text-align: center; margin-bottom: 30px; }
          .print-header h1 { font-size: 24px; margin-bottom: 5px; }
          .print-header h2 { font-size: 18px; color: #666; margin-top: 0; }
          .print-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .print-table th, .print-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          .print-table th { background-color: #f5f5f5; font-weight: bold; }
          .print-table td { font-size: 12px; }
          .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
          @media print {
            body { margin: 0; }
            .print-table { font-size: 10px; }
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>Purchase Order</h1>
          <h2>${po.poNumber}</h2>
        </div>
        
        <table class="print-table">
          <tr><th>PO Number:</th><td>${po.poNumber}</td></tr>
          <tr><th>Brand:</th><td>${po.brandName || 'Unknown Brand'}</td></tr>
          <tr><th>Order Date:</th><td>${po.orderDate ? new Date(po.orderDate).toLocaleDateString('en-GB') : '-'}</td></tr>
          <tr><th>Total (GBP):</th><td>GBP ${parseFloat(po.totalAmount || 0).toFixed(2)}</td></tr>
          <tr><th>Total (AED):</th><td>AED ${parseFloat(po.grandTotal || 0).toFixed(2)}</td></tr>
          <tr><th>Line Items:</th><td>${po.lineItems || 0}</td></tr>
          <tr><th>Ordered Quantity:</th><td>${po.orderedQty || 0}</td></tr>
          <tr><th>Received Quantity:</th><td>${po.receivedQty || 0}</td></tr>
          <tr><th>Status:</th><td>${po.status?.toUpperCase()}</td></tr>
        </table>
        
        <div class="print-footer">
          <p>Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
        </div>
        
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportToXLSX = (po) => {
    // TODO: Implement XLSX export functionality
    toast({
      title: "Export to XLSX",
      description: `Exporting PO ${po.poNumber} to Excel`,
      variant: "default"
    });
  };

  const handleDeletePO = (po) => {
    setDeletingPO(po);
    setShowDeleteDialog(true);
  };

  const confirmDeletePO = async () => {
    if (!deletingPO) return;
    
    try {
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'PurchaseOrder',
        document_id: deletingPO.id,
        document_number: deletingPO.poNumber,
        document_data: deletingPO,
        deleted_by: currentUser?.email || 'unknown',
        deleted_date: new Date().toISOString(),
        reason: 'Deleted from Goods Receipts',
        original_status: deletingPO.status,
        can_restore: true
      });

      // Log the deletion
      await AuditLog.create({
        entity_type: 'PurchaseOrder',
        entity_id: deletingPO.id,
        action: 'deleted',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          document_number: deletingPO.poNumber,
          deletion_reason: 'Deleted from Goods Receipts UI',
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Delete from main table (this will remove it from the UI)
      const response = await fetch(`/api/purchase-orders/${deletingPO.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete purchase order');
      }

      toast({
        title: 'Purchase Order Deleted',
        description: `${deletingPO.poNumber} has been moved to the recycle bin.`
      });

      setShowDeleteDialog(false);
      setDeletingPO(null);
      
      // Refresh the data
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the purchase order. Please try again.',
        variant: 'destructive'
      });
    }
  };

  // Helper function to render purchase order table
  const renderPOTable = (pos, isClosedSection = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">PO Number</TableHead>
          <TableHead className="w-[140px]">Brand</TableHead>
          <TableHead className="w-[100px]">Order Date</TableHead>
          <TableHead className="w-[110px]">Total (GBP)</TableHead>
          <TableHead className="w-[110px]">Total (AED)</TableHead>
          <TableHead className="w-[90px]">Line Items</TableHead>
          <TableHead className="w-[80px]">Ordered</TableHead>
          <TableHead className="w-[80px]">Received</TableHead>
          <TableHead className="w-[90px]">Status</TableHead>
          <TableHead className="w-[90px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pos.map((po) => (
          <TableRow key={po.id}>
            <TableCell className="font-medium w-[120px]">{po.poNumber}</TableCell>
            <TableCell className="w-[140px]">{po.brandName || 'Unknown Brand'}</TableCell>
            <TableCell className="w-[100px]">
              {po.orderDate && !isNaN(new Date(po.orderDate)) ? 
                format(new Date(po.orderDate), 'dd/MM/yy') : 
                '-'
              }
            </TableCell>
            <TableCell className="w-[110px]">GBP {parseFloat(po.totalAmount || 0).toFixed(2)}</TableCell>
            <TableCell className="w-[110px]">AED {parseFloat(po.grandTotal || 0).toFixed(2)}</TableCell>
            <TableCell className="w-[90px]">{getLineItemsCount(po)}</TableCell>
            <TableCell className="w-[80px]">{getTotalOrderedQuantity(po)}</TableCell>
            <TableCell className="w-[80px]">{getTotalReceivedQuantity(po)}</TableCell>
            <TableCell className="w-[90px]">
              <Badge 
                variant="outline" 
                className={po.status === 'closed' 
                  ? "border-green-300 text-green-800 bg-green-50" 
                  : "border-blue-300 text-blue-800 bg-blue-50"
                }
              >
                {po.status?.toUpperCase()}
              </Badge>
            </TableCell>
            <TableCell className="w-[90px]">
              {isClosedSection ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleViewAndPrint(po)}>
                      <FileText className="w-4 h-4 mr-2" />
                      View & Print
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExportToXLSX(po)}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export to XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDeletePO(po)}
                      className="text-red-600"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  onClick={() => openReceiveDialog(po)}
                  disabled={!canEdit || processingPO === po.id}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {processingPO === po.id ? "Processing..." : "Receive"}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const openReceiveDialog = async (po) => {
    try {
      // Fetch the purchase order items only when opening the dialog
      const response = await fetch(`/api/purchase-orders/${po.id}/items`);
      if (!response.ok) {
        throw new Error('Failed to fetch purchase order items');
      }
      const items = await response.json();
      
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
      
    } catch (error) {
      console.error('Error fetching PO items:', error);
      toast({
        title: "Error",
        description: "Failed to load purchase order items. Please try again.",
        variant: "destructive"
      });
    }
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
      toast({ title: "Success", description: `${closingPO.poNumber} has been closed.` });
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
  const closedPOs = purchaseOrders.filter(po => po.status === 'closed');

  // Context-aware export data function
  const getContextAwareExportData = () => {
    let exportData = [];
    let exportType = "Goods Receipts";
    let itemCount = 0;

    if (showOpenReceipts && !showClosedReceipts) {
      // Export only open goods receipts
      exportData = openPOs;
      exportType = "Open Goods Receipts";
      itemCount = openPOs.length;
    } else if (!showOpenReceipts && showClosedReceipts) {
      // Export only closed goods receipts
      exportData = closedPOs;
      exportType = "Closed Goods Receipts";
      itemCount = closedPOs.length;
    } else if (showOpenReceipts && showClosedReceipts) {
      // Export all goods receipts
      exportData = [...openPOs, ...closedPOs];
      exportType = "All Goods Receipts";
      itemCount = openPOs.length + closedPOs.length;
    }


    return { exportData, exportType, itemCount };
  };

  const { exportData: contextExportData, exportType, itemCount } = getContextAwareExportData();

  // Define columns for goods receipts export
  const goodsReceiptsColumns = {
    poNumber: "PO Number",
    brandName: "Brand",
    orderDate: {
      label: "Order Date",
      transform: (date) => date && !isNaN(new Date(date)) ? format(new Date(date), 'dd/MM/yyyy') : ''
    },
    totalAmount: {
      label: "Total (GBP)",
      transform: (amount) => `GBP ${parseFloat(amount || 0).toFixed(2)}`
    },
    grandTotal: {
      label: "Total (AED)", 
      transform: (amount) => `AED ${parseFloat(amount || 0).toFixed(2)}`
    },
    lineItems: "Line Items",
    orderedQty: "Ordered",
    receivedQty: "Received",
    status: {
      label: "Status",
      transform: (status) => status?.toUpperCase() || ''
    }
  };

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
          {/* Open Purchase Orders Section - Collapsible */}
          <div className="mb-6">
            <Collapsible open={showOpenReceipts} onOpenChange={setShowOpenReceipts}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-between text-left h-auto p-4 border-gray-300 mb-3"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold">Open ({openPOs.length})</span>
                  </div>
                  {showOpenReceipts ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {openPOs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="font-semibold">No Submitted Purchase Orders</p>
                    <p>There are no purchase orders awaiting goods receipt.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm" style={{tableLayout: 'fixed'}}>
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '120px'}}>PO Number</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '140px'}}>Brand</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '100px'}}>Order Date</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (GBP)</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (AED)</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Line Items</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Ordered</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Received</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Status</th>
                          <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPOs.map((po) => (
                          <tr key={po.id} className="border-b transition-colors hover:bg-muted/50">
                            <td className="p-2 align-middle font-medium" style={{width: '120px'}}>{po.poNumber}</td>
                            <td className="p-2 align-middle" style={{width: '140px'}}>{po.brandName || 'Unknown Brand'}</td>
                            <td className="p-2 align-middle" style={{width: '100px'}}>
                              {po.orderDate && !isNaN(new Date(po.orderDate)) ? 
                                format(new Date(po.orderDate), 'dd/MM/yy') : 
                                '-'
                              }
                            </td>
                            <td className="p-2 align-middle" style={{width: '110px'}}>GBP {parseFloat(po.totalAmount || 0).toFixed(2)}</td>
                            <td className="p-2 align-middle" style={{width: '110px'}}>AED {parseFloat(po.grandTotal || 0).toFixed(2)}</td>
                            <td className="p-2 align-middle" style={{width: '90px'}}>{getLineItemsCount(po)}</td>
                            <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalOrderedQuantity(po)}</td>
                            <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalReceivedQuantity(po)}</td>
                            <td className="p-2 align-middle" style={{width: '90px'}}>
                              <Badge 
                                variant="outline" 
                                className="border-blue-300 text-blue-800 bg-blue-50"
                              >
                                {po.status?.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="p-2 align-middle" style={{width: '90px'}}>
                              <Button
                                size="sm"
                                onClick={() => openReceiveDialog(po)}
                                disabled={!canEdit || processingPO === po.id}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                {processingPO === po.id ? "Processing..." : "Receive"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Closed Purchase Orders Section - Collapsible */}
          {closedPOs.length > 0 && (
            <Collapsible open={showClosedReceipts} onOpenChange={setShowClosedReceipts}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full justify-between text-left h-auto p-4 border-gray-300"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-semibold">Closed ({closedPOs.length})</span>
                  </div>
                  {showClosedReceipts ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm" style={{tableLayout: 'fixed'}}>
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '120px'}}>PO Number</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '140px'}}>Brand</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '100px'}}>Order Date</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (GBP)</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (AED)</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Line Items</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Ordered</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Received</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Status</th>
                        <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedPOs.map((po) => (
                        <tr key={po.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-2 align-middle font-medium" style={{width: '120px'}}>{po.poNumber}</td>
                          <td className="p-2 align-middle" style={{width: '140px'}}>{po.brandName || 'Unknown Brand'}</td>
                          <td className="p-2 align-middle" style={{width: '100px'}}>
                            {po.orderDate && !isNaN(new Date(po.orderDate)) ? 
                              format(new Date(po.orderDate), 'dd/MM/yy') : 
                              '-'
                            }
                          </td>
                          <td className="p-2 align-middle" style={{width: '110px'}}>GBP {parseFloat(po.totalAmount || 0).toFixed(2)}</td>
                          <td className="p-2 align-middle" style={{width: '110px'}}>AED {parseFloat(po.grandTotal || 0).toFixed(2)}</td>
                          <td className="p-2 align-middle" style={{width: '90px'}}>{getLineItemsCount(po)}</td>
                          <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalOrderedQuantity(po)}</td>
                          <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalReceivedQuantity(po)}</td>
                          <td className="p-2 align-middle" style={{width: '90px'}}>
                            <Badge 
                              variant="outline" 
                              className="border-green-300 text-green-800 bg-green-50"
                            >
                              {po.status?.toUpperCase()}
                            </Badge>
                          </td>
                          <td className="p-2 align-middle" style={{width: '90px'}}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewAndPrint(po)}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  View & Print
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportToXLSX(po)}>
                                  <Download className="w-4 h-4 mr-2" />
                                  Export to XLSX
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeletePO(po)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingPO(null);
        }}
        onConfirm={confirmDeletePO}
        title="Delete Purchase Order"
        description={`Are you sure you want to delete purchase order ${deletingPO?.poNumber}? This action will move it to the recycle bin where it can be restored later.`}
        confirmText="Yes, Delete"
        cancelText="No, Cancel"
        confirmVariant="destructive"
      />
      
      {/* Receive Goods Dialog */}
      <Dialog open={!!selectedPOForReceive} onOpenChange={() => {
        setSelectedPOForReceive(null);
        setReceiveQuantities({});
        setReceiveNotes('');
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Receive Goods - {selectedPOForReceive?.brandName || 'Unknown Brand'} - {selectedPOForReceive?.poNumber}
              {selectedPOForReceive?.orderDate && !isNaN(new Date(selectedPOForReceive.orderDate)) && 
                ` - ${format(new Date(selectedPOForReceive.orderDate), 'dd/MM/yyyy')}`
              }
            </DialogTitle>
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
        description={`Are you sure you want to manually close ${closingPO?.poNumber}? This should only be done if you are not expecting any more items. This action cannot be undone.`}
        onConfirm={handleConfirmForceClose}
        confirmText="Yes, Close PO"
        variant="destructive"
      />
    </>
  );
}
