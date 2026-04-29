
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, Upload, Paperclip, X, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportDeliveryOrderToXLSX } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import CancelWithStockDialog, { type StockLineItem } from "../common/CancelWithStockDialog";
import { DeliveryOrder as DOEntity } from "@/api/entities";
import UploadFileDialog from "../common/UploadFileDialog";
import type { DeliveryOrder } from "@shared/schema";

interface DOActionsDropdownProps {
  doOrder: DeliveryOrder;
  canEdit: boolean;
  onEdit: (doOrder: DeliveryOrder) => void;
  onRefresh: () => void;
  currentUser?: { email?: string; role?: string } | null;
}

export default function DOActionsDropdown({ doOrder, canEdit, onEdit, onRefresh, currentUser }: DOActionsDropdownProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showRemoveFileDialog, setShowRemoveFileDialog] = useState(false);
  const [cancelItems, setCancelItems] = useState<StockLineItem[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);

  const handleExportXLSX = async () => {
    try {
      const response = await fetch(`/api/delivery-orders/${doOrder.id}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch delivery order details for export');
      }
      const fullDO = await response.json();
      await exportDeliveryOrderToXLSX(fullDO);
      toast({
        title: 'Export Successful',
        description: `Delivery Order ${fullDO.do_number || doOrder.orderNumber} exported to Excel.`
      });
    } catch (error: unknown) {
      console.error('XLSX export error:', error instanceof Error ? error.message : error);
      toast({
        title: 'Export Failed', 
        description: 'Failed to export delivery order to Excel. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleViewPrint = () => {
    window.open(`/delivery-orders/${doOrder.id}/print`, '_blank');
  };

  const handleDelete = async () => {
    try {
      await DOEntity.delete(doOrder.id);
      toast({
        title: 'Delivery Order Deleted',
        description: `${doOrder.orderNumber} has been moved to the recycle bin.`
      });
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: unknown) {
      console.error('Error deleting delivery order:', error instanceof Error ? error.message : error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the delivery order. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCancelClick = async () => {
    // For delivered DOs, fetch line items and show the stock-choice dialog
    try {
      const res = await fetch(`/api/delivery-orders/${doOrder.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch delivery order details');
      const fullDO = await res.json();
      const items: StockLineItem[] = (fullDO.items || []).map((item: any) => ({
        id: item.id,
        productId: item.product_id ?? item.productId,
        description: item.description || item.product_name || `Product ${item.product_id ?? item.productId}`,
        quantity: item.quantity,
      })).filter((i: StockLineItem) => i.productId);
      setCancelItems(items);
      setShowCancelDialog(true);
    } catch {
      toast({
        title: 'Error',
        description: 'Could not load delivery order details. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/delivery-orders/${doOrder.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Failed to cancel delivery order');
      }
      const isDelivered = doOrder.status === 'delivered';
      toast({
        title: 'Delivery Order Cancelled',
        description: isDelivered
          ? `${doOrder.orderNumber} cancelled. All stock has been restored.`
          : `${doOrder.orderNumber} cancelled — no stock to reverse.`,
      });
      setShowCancelDialog(false);
      onRefresh();
    } catch (error: unknown) {
      console.error('Error cancelling delivery order:', error instanceof Error ? error.message : error);
      toast({
        title: 'Cancel Failed',
        description: error instanceof Error ? error.message : 'Failed to cancel the delivery order. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleUploadSuccess = async (storageKey?: string) => {
    if (!storageKey) return;
    try {
      const res = await fetch(`/api/delivery-orders/${doOrder.id}/scan-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanKey: storageKey }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to link file to delivery order');
      }
      onRefresh();
    } catch (error: unknown) {
      console.error('Error saving scan key:', error instanceof Error ? error.message : error);
      toast({
        title: 'Warning',
        description: 'File uploaded but failed to link it to the delivery order.',
        variant: 'destructive'
      });
    }
  };

  const handleViewFile = async () => {
    const scanKey = doOrder.scanKey;
    if (!scanKey) return;
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get download link');
      window.open(data.url, '_blank');
    } catch (error: unknown) {
      console.error('Error viewing file:', error instanceof Error ? error.message : error);
      toast({
        title: 'Error',
        description: 'Could not retrieve the file. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveFile = async () => {
    try {
      const res = await fetch(`/api/delivery-orders/${doOrder.id}/scan-key`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove file');
      }
      toast({ title: 'File Removed', description: 'The attachment has been removed.' });
      onRefresh();
    } catch (error: unknown) {
      console.error('Error removing file:', error instanceof Error ? error.message : error);
      toast({ title: 'Error', description: 'Could not remove the file. Please try again.', variant: 'destructive' });
    }
  };

  const hasScanKey = !!(doOrder.scanKey);
  const doNumber = doOrder.orderNumber || `do-${doOrder.id}`;
  const canDelete = ['Admin', 'Manager'].includes(currentUser?.role ?? '');
  const isDelivered = doOrder.status === 'delivered';
  const isCancelled = doOrder.status === 'cancelled';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && !isCancelled && (
            <DropdownMenuItem onClick={() => onEdit(doOrder)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleViewPrint}>
            <Eye className="w-4 h-4 mr-2" />
            View & Print
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportXLSX}>
            <Download className="w-4 h-4 mr-2" />
            Export to XLSX
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowUploadDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </DropdownMenuItem>
          {hasScanKey && (
            <>
              <DropdownMenuItem onClick={handleViewFile}>
                <Paperclip className="w-4 h-4 mr-2" />
                View File
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowRemoveFileDialog(true)}
                className="text-orange-600 focus:text-orange-600"
              >
                <X className="w-4 h-4 mr-2" />
                Remove File
              </DropdownMenuItem>
            </>
          )}
          {canDelete && !isCancelled && (
            <>
              <DropdownMenuSeparator />
              {isDelivered ? (
                <DropdownMenuItem
                  onClick={handleCancelClick}
                  className="text-orange-600 focus:text-orange-600"
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Cancel Order
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting Delivery Order "${doNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
      <CancelWithStockDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        documentType="Delivery Order"
        documentNumber={doNumber}
        items={cancelItems}
        isLoading={cancelLoading}
      />
      <SimpleConfirmDialog
        open={showRemoveFileDialog}
        onClose={() => setShowRemoveFileDialog(false)}
        onConfirm={handleRemoveFile}
        title="Remove Attachment"
        description={`Remove the uploaded file from Delivery Order "${doNumber}"? The file will be permanently deleted.`}
        confirmText="Yes, Remove"
        confirmVariant="destructive"
      />
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
        recordType="delivery"
        recordId={doOrder.id}
        documentNumber={doNumber}
        documentYear={new Date(doOrder.orderDate || doOrder.createdAt || Date.now()).getUTCFullYear()}
      />
    </>
  );
}
