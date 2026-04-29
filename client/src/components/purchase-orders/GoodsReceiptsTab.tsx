import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck } from "lucide-react";
import UploadFileDialog from "../common/UploadFileDialog";
import POQuickViewModal from "./POQuickViewModal";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { GoodsReceipt } from "@shared/schema";

import OpenPOsSection from "./grn/OpenPOsSection";
import ClosedPOsSection from "./grn/ClosedPOsSection";
import ReceiveDialog from "./grn/ReceiveDialog";
import CloseConfirmDialog from "./grn/CloseConfirmDialog";
import DeleteConfirmDialog from "./grn/DeleteConfirmDialog";
import { useGrnDocs } from "./grn/useGrnDocs";
import {
  getAedEquivalent,
  getLineItemsCount,
  getTotalOrderedQuantity,
  getTotalReceivedQuantity,
} from "./grn/exportColumns";
import {
  uniqueSupplierOptions,
  filterOpenPOs,
  filterClosedPOs,
  isOpenFiltersActive,
  isClosedFiltersActive,
} from "./grn/filterUtils";
import {
  makeViewAndPrint,
  makeExportToXLSX,
  makeReopenPO,
  deletePORequest,
  forceClosePORequest,
} from "./grn/poActions";
import type { GoodsReceiptsTabProps, PORow } from "./grn/types";

export type { PORow } from "./grn/types";

export default function GoodsReceiptsTab({
  purchaseOrders,
  goodsReceipts,
  loading,
  canEdit,
  onRefresh,
  showOpenReceipts,
  setShowOpenReceipts,
  showClosedReceipts,
  setShowClosedReceipts,
}: GoodsReceiptsTabProps) {
  const [processingPOId, setProcessingPOId] = useState<number | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [closingPO, setClosingPO] = useState<PORow | null>(null);
  const [selectedPOForReceive, setSelectedPOForReceive] = useState<PORow | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveRefNumber, setReceiveRefNumber] = useState('');
  const [receiveRefDate, setReceiveRefDate] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingPO, setDeletingPO] = useState<PORow | null>(null);
  const [quickViewPoId, setQuickViewPoId] = useState<number | null>(null);
  // Inline filter state — Open section
  const [openSupplier, setOpenSupplier] = useState('all');
  const [openDateFrom, setOpenDateFrom] = useState('');
  const [openDateTo, setOpenDateTo] = useState('');
  // Inline filter state — Closed section
  const [closedSupplier, setClosedSupplier] = useState('all');
  const [closedDateFrom, setClosedDateFrom] = useState('');
  const [closedDateTo, setClosedDateTo] = useState('');
  const [closedDelivery, setClosedDelivery] = useState('all');
  const { toast } = useToast();

  const {
    pendingDocs,
    setPendingDocs,
    attachGrnState,
    setAttachGrnState,
    updatePendingDoc,
    handlePendingDocSelect,
    uploadGrnDocToStorage,
    handleGrnAttachSuccess,
  } = useGrnDocs({ toast, onRefresh });

  const handleReceiveQuantityChange = (itemId: number, value: number) => {
    setReceiveQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, Math.floor(value) || 0)
    }));
  };

  // Handler functions for closed PO actions — delegate to shared utilities
  const handleViewAndPrint = makeViewAndPrint(toast);
  const handleExportToXLSX = makeExportToXLSX(toast);
  const handleReopenPO = makeReopenPO(toast, onRefresh);

  const handleDeletePO = (po: PORow) => {
    setDeletingPO(po);
    setShowDeleteDialog(true);
  };

  const confirmDeletePO = async () => {
    if (!deletingPO) return;
    try {
      await deletePORequest(deletingPO);
      toast({
        title: 'Purchase Order Deleted',
        description: `${deletingPO.poNumber} has been moved to the recycle bin.`,
      });
      setShowDeleteDialog(false);
      setDeletingPO(null);
      if (onRefresh) onRefresh();
    } catch (error: unknown) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'Failed to delete the purchase order. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const openReceiveDialog = async (po: PORow) => {
    try {
      // Fetch the purchase order items only when opening the dialog
      const response = await fetch(`/api/purchase-orders/${po.id}/items`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch purchase order items');
      }
      const items = await response.json();

      // Set the selected PO with items
      setSelectedPOForReceive({ ...po, items });

      // Initialize receive quantities to 0 for all items
      const initialQuantities: Record<string, number> = {};
      items.forEach((item: Record<string, any>) => {
        initialQuantities[item.id] = 0;
      });
      setReceiveQuantities(initialQuantities);

    } catch (error: unknown) {
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
      setProcessingPOId(selectedPOForReceive.id);

      const items = (selectedPOForReceive.items as Record<string, any>[] | undefined)?.map((item: Record<string, any>) => {
        const receivedQuantity = receiveQuantities[item.id] || 0;
        return {
          poItemId: item.id,
          productId: item.productId,
          orderedQuantity: item.quantity,
          receivedQuantity: receivedQuantity,
          unitPrice: item.unitPrice
        };
      }) || [];

      if (items && items.every((item: Record<string, any>) => item.receivedQuantity === 0) && !forceClose) {
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
        credentials: 'include',
        body: JSON.stringify({
          poId: selectedPOForReceive.id,
          items: items,
          notes: receiveNotes,
          forceClose: forceClose,
          receivedDate: receiveDate,
          referenceNumber: receiveRefNumber || undefined,
          referenceDate: receiveRefDate || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create goods receipt');
      }

      const result = await response.json();

      // Upload any pending documents (non-fatal)
      const docsSelected = pendingDocs.some((f) => f !== null);
      if (docsSelected && result.id) {
        for (let i = 0; i < 3; i++) {
          const file = pendingDocs[i];
          if (file) {
            try {
              await uploadGrnDocToStorage(result.id, i + 1, file);
            } catch (docErr) {
              console.error(`Failed to upload GRN doc slot ${i + 1}:`, docErr);
            }
          }
        }
      }
      setPendingDocs([null, null, null]);

      toast({
        title: "Goods received successfully",
        description: result.message,
        variant: "default"
      });

      // Reset form state
      setSelectedPOForReceive(null);
      setReceiveQuantities({});
      setReceiveNotes('');
      setReceiveDate(new Date().toISOString().slice(0, 10));
      setReceiveRefNumber('');
      setReceiveRefDate('');

      // Invalidate cached data so Inventory and Dashboard reflect the new stock counts immediately
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard'] });

      // Refresh the data
      if (onRefresh) {
        onRefresh();
      }

    } catch (error: unknown) {
      console.error('Error creating goods receipt:', error);
      toast({
        title: "Error",
        description: "Failed to receive goods. Please try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingPOId(null);
    }
  };

  const getReceivedQuantityForItem = (poId: number, productId: number) => {
    const relatedGRNs = goodsReceipts.filter((grn: GoodsReceipt) => (grn.poId ?? (grn as Record<string, unknown>).purchase_order_id) === poId);
    let totalReceived = 0;
    relatedGRNs.forEach((grn: GoodsReceipt) => {
      (grn as Record<string, any>).items?.forEach((item: Record<string, any>) => {
        if ((item.productId ?? item.product_id) === productId) {
          totalReceived += item.receivedQuantity ?? item.received_quantity ?? 0;
        }
      });
    });
    return totalReceived;
  };

  const handleConfirmForceClose = async () => {
    if (!closingPO || !canEdit) return;
    setProcessingPOId(closingPO.id);
    try {
      await forceClosePORequest(closingPO);
      toast({ title: "Success", description: `${closingPO.poNumber} has been closed.` });
      onRefresh();
    } catch (error: unknown) {
      console.error("Error force closing PO:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : 'Could not close the Purchase Order.', variant: "destructive" });
    } finally {
      setProcessingPOId(null);
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

  const openPOs: PORow[] = purchaseOrders.filter(po => po.status === 'submitted');
  const closedPOs: PORow[] = purchaseOrders.filter(po => po.status === 'closed');

  const openSupplierOptions = uniqueSupplierOptions(openPOs);
  const closedSupplierOptions = uniqueSupplierOptions(closedPOs);

  const openFilters = { openSupplier, openDateFrom, openDateTo };
  const closedFilters = { closedSupplier, closedDateFrom, closedDateTo, closedDelivery };

  const filteredOpenPOs = filterOpenPOs(openPOs, openFilters);
  const filteredClosedPOs = filterClosedPOs(closedPOs, closedFilters);

  const openFiltersActive = isOpenFiltersActive(openFilters);
  const closedFiltersActive = isClosedFiltersActive(closedFilters);

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
          <OpenPOsSection
            showOpenReceipts={showOpenReceipts}
            setShowOpenReceipts={setShowOpenReceipts}
            openPOs={openPOs}
            filteredOpenPOs={filteredOpenPOs}
            openSupplier={openSupplier}
            setOpenSupplier={setOpenSupplier}
            openSupplierOptions={openSupplierOptions}
            openDateFrom={openDateFrom}
            setOpenDateFrom={setOpenDateFrom}
            openDateTo={openDateTo}
            setOpenDateTo={setOpenDateTo}
            openFiltersActive={openFiltersActive}
            canEdit={canEdit}
            processingPOId={processingPOId}
            onReceive={openReceiveDialog}
            getLineItemsCount={getLineItemsCount}
            getTotalOrderedQuantity={getTotalOrderedQuantity}
            getTotalReceivedQuantity={getTotalReceivedQuantity}
            getAedEquivalent={getAedEquivalent}
          />

          <ClosedPOsSection
            showClosedReceipts={showClosedReceipts}
            setShowClosedReceipts={setShowClosedReceipts}
            closedPOs={closedPOs}
            filteredClosedPOs={filteredClosedPOs}
            closedSupplier={closedSupplier}
            setClosedSupplier={setClosedSupplier}
            closedSupplierOptions={closedSupplierOptions}
            closedDateFrom={closedDateFrom}
            setClosedDateFrom={setClosedDateFrom}
            closedDateTo={closedDateTo}
            setClosedDateTo={setClosedDateTo}
            closedDelivery={closedDelivery}
            setClosedDelivery={setClosedDelivery}
            closedFiltersActive={closedFiltersActive}
            goodsReceipts={goodsReceipts}
            setQuickViewPoId={setQuickViewPoId}
            onViewAndPrint={handleViewAndPrint}
            onExportToXLSX={handleExportToXLSX}
            onReopenPO={handleReopenPO}
            onDeletePO={handleDeletePO}
            getLineItemsCount={getLineItemsCount}
            getTotalOrderedQuantity={getTotalOrderedQuantity}
            getTotalReceivedQuantity={getTotalReceivedQuantity}
            getAedEquivalent={getAedEquivalent}
          />
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        deletingPO={deletingPO}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeletingPO(null);
        }}
        onConfirm={confirmDeletePO}
      />

      <ReceiveDialog
        selectedPOForReceive={selectedPOForReceive}
        onClose={() => {
          setSelectedPOForReceive(null);
          setReceiveQuantities({});
          setReceiveNotes('');
          setReceiveDate(new Date().toISOString().slice(0, 10));
          setReceiveRefNumber('');
          setReceiveRefDate('');
          setPendingDocs([null, null, null]);
        }}
        receiveQuantities={receiveQuantities}
        onReceiveQuantityChange={handleReceiveQuantityChange}
        receiveNotes={receiveNotes}
        setReceiveNotes={setReceiveNotes}
        receiveDate={receiveDate}
        setReceiveDate={setReceiveDate}
        receiveRefNumber={receiveRefNumber}
        setReceiveRefNumber={setReceiveRefNumber}
        receiveRefDate={receiveRefDate}
        setReceiveRefDate={setReceiveRefDate}
        pendingDocs={pendingDocs}
        updatePendingDoc={updatePendingDoc}
        handlePendingDocSelect={handlePendingDocSelect}
        processingPOId={processingPOId}
        getReceivedQuantityForItem={getReceivedQuantityForItem}
        onSaveReceive={handleSaveReceive}
      />

      <CloseConfirmDialog
        open={showCloseConfirm}
        closingPO={closingPO}
        onClose={() => setShowCloseConfirm(false)}
        onConfirm={handleConfirmForceClose}
      />

      {/* GRN Document Attachment Dialog */}
      {attachGrnState && (
        <UploadFileDialog
          open={!!attachGrnState}
          onClose={() => setAttachGrnState(null)}
          onSuccess={handleGrnAttachSuccess}
          recordType="goods-receipts"
          recordId={attachGrnState.grnId}
          documentNumber={`${attachGrnState.receiptNumber}-doc${attachGrnState.slot}`}
          documentYear={attachGrnState.receivedDate ? new Date(attachGrnState.receivedDate).getUTCFullYear() : new Date().getUTCFullYear()}
          maxSizeMB={5}
        />
      )}

      {/* PO Quick View Modal */}
      <POQuickViewModal
        poId={quickViewPoId}
        open={!!quickViewPoId}
        onClose={() => setQuickViewPoId(null)}
      />
    </>
  );
}
