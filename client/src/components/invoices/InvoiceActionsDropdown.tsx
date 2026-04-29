
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, Upload, Paperclip, X, CheckCircle, RotateCcw, Ban } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportInvoiceToXLSX } from "../utils/export";
import { format } from 'date-fns';
import { Invoice as InvoiceEntity } from "@/api/entities";
import MarkPaidDialog from "./MarkPaidDialog";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import CancelWithStockDialog, { type StockLineItem } from "../common/CancelWithStockDialog";
import UploadFileDialog from "../common/UploadFileDialog";
import type { Invoice } from "@shared/schema";

interface InvoiceActionsDropdownProps {
  invoice: Invoice;
  canEdit: boolean;
  canOverride: boolean;
  onEdit: (invoice: Invoice) => void;
  onRefresh: () => void;
  currentUser?: { email?: string; role?: string } | null;
}

export default function InvoiceActionsDropdown({ invoice, canEdit, canOverride, onEdit, onRefresh, currentUser }: InvoiceActionsDropdownProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showRemoveFileDialog, setShowRemoveFileDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showStockCancelDialog, setShowStockCancelDialog] = useState(false);
  const [cancelItems, setCancelItems] = useState<StockLineItem[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);

  const isCancelled = invoice.status === 'cancelled';
  const isDelivered = invoice.status === 'delivered';
  // Task #363 (RF-1): delivered/stockDeducted invoices must go through Cancel Invoice (server enforces the same rule).
  const canDelete = !isCancelled && !isDelivered && !invoice.stockDeducted;

  const handleExportXLSX = async () => {
    try {
      const response = await fetch(`/api/invoices/${invoice.id}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch invoice details for export');
      }
      const fullInvoice = await response.json();
      await exportInvoiceToXLSX(fullInvoice);
      const invoiceNum = fullInvoice.invoice_number || invoiceNumber;
      toast({
        title: 'Export Successful',
        description: `Invoice ${invoiceNum} exported to Excel.`
      });
    } catch (error: unknown) {
      console.error('XLSX export error:', error);
      toast({
        title: 'Export Failed', 
        description: 'Failed to export invoice to Excel. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleViewPrint = () => {
    window.open(`/invoices/${invoice.id}/print`, '_blank');
  };

  const handleDelete = async () => {
    try {
      await InvoiceEntity.delete(invoice.id);
      toast({
        title: 'Invoice Deleted',
        description: `${invoice.invoiceNumber} has been moved to the recycle bin.`
      });
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: unknown) {
      console.error('Error deleting invoice:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the invoice. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCancelClick = async () => {
    if (isDelivered) {
      // Fetch line items so user can choose which to return to stock
      try {
        const res = await fetch(`/api/invoices/${invoice.id}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch invoice details');
        const fullInvoice = await res.json();
        const items: StockLineItem[] = (fullInvoice.items || []).map((item: any) => ({
          id: item.id,
          productId: item.product_id ?? item.productId,
          description: item.description || item.product_name || `Product ${item.product_id ?? item.productId}`,
          quantity: item.quantity,
        })).filter((i: StockLineItem) => i.productId);
        setCancelItems(items);
        setShowStockCancelDialog(true);
      } catch {
        toast({ title: 'Error', description: 'Could not load invoice details. Please try again.', variant: 'destructive' });
      }
    } else {
      setShowCancelDialog(true);
    }
  };

  const handleCancelInvoice = async () => {
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Failed to cancel invoice');
      }
      const desc = isDelivered
        ? `Invoice ${invoiceNumber} cancelled. All stock has been restored.`
        : `Invoice ${invoiceNumber} cancelled — no stock to reverse.`;
      toast({ title: 'Invoice Cancelled', description: desc });
      setShowCancelDialog(false);
      setShowStockCancelDialog(false);
      onRefresh();
    } catch (error: unknown) {
      console.error('Error cancelling invoice:', error);
      toast({
        title: 'Cancellation Failed',
        description: error instanceof Error ? error.message : 'Failed to cancel the invoice. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCancelLoading(false);
    }
  };

  const handleUploadSuccess = async (storageKey?: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/scan-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanKey: storageKey }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to link file to invoice');
      }
      onRefresh();
    } catch (error: unknown) {
      console.error('Error saving scan key:', error);
      toast({
        title: 'Warning',
        description: 'File uploaded but failed to link it to the invoice.',
        variant: 'destructive'
      });
    }
  };

  const handleViewFile = async () => {
    const scanKey = invoice.scanKey || invoice.scanKey;
    if (!scanKey) return;
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get download link');
      window.open(data.url, '_blank');
    } catch (error: unknown) {
      console.error('Error viewing file:', error);
      toast({
        title: 'Error',
        description: 'Could not retrieve the file. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleRemoveFile = async () => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/scan-key`, {
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
      console.error('Error removing file:', error);
      toast({ title: 'Error', description: 'Could not remove the file. Please try again.', variant: 'destructive' });
    }
  };

  const handleMarkOutstanding = async () => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paymentStatus: 'outstanding' }),
      });
      if (!res.ok) throw new Error('Failed to update payment status');
      toast({ title: 'Updated', description: `Invoice ${invoiceNumber} marked as outstanding.` });
      onRefresh();
    } catch (error: unknown) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'An error occurred.', variant: 'destructive' });
    }
  };

  const hasScanKey = !!(invoice.scanKey || invoice.scanKey);
  const invoiceNumber = invoice.invoiceNumber || invoice.invoiceNumber || `inv-${invoice.id}`;

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
            <DropdownMenuItem onClick={() => onEdit(invoice)}>
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

          {!isCancelled && (
            <>
              <DropdownMenuSeparator />
              {invoice.paymentStatus !== 'paid' && invoice.paymentStatus !== 'paid' ? (
                <DropdownMenuItem data-testid="menuitem-mark-paid" onClick={() => setShowMarkPaidDialog(true)} className="text-green-700 focus:text-green-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark as Paid
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem data-testid="menuitem-mark-outstanding" onClick={handleMarkOutstanding} className="text-amber-700 focus:text-amber-700">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Mark as Outstanding
                </DropdownMenuItem>
              )}
            </>
          )}

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

          <DropdownMenuSeparator />
          {canEdit && !isCancelled && (
            <DropdownMenuItem
              onClick={handleCancelClick}
              className="text-orange-700 focus:text-orange-700"
            >
              <Ban className="w-4 h-4 mr-2" />
              Cancel Invoice
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem 
              onClick={() => setShowDeleteDialog(true)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <MarkPaidDialog
        open={showMarkPaidDialog}
        onClose={() => setShowMarkPaidDialog(false)}
        invoice={invoice}
        onSuccess={onRefresh}
      />
      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting Invoice "${invoiceNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
      <SimpleConfirmDialog
        open={showRemoveFileDialog}
        onClose={() => setShowRemoveFileDialog(false)}
        onConfirm={handleRemoveFile}
        title="Remove Attachment"
        description={`Remove the uploaded file from Invoice "${invoiceNumber}"? The file will be permanently deleted.`}
        confirmText="Yes, Remove"
        confirmVariant="destructive"
      />
      <SimpleConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancelInvoice}
        title="Cancel Invoice"
        description={`Are you sure you want to cancel Invoice "${invoiceNumber}"? This cannot be undone. The invoice will remain on record but will be marked as cancelled.`}
        confirmText="Yes, Cancel Invoice"
        confirmVariant="destructive"
      />
      <CancelWithStockDialog
        open={showStockCancelDialog}
        onClose={() => setShowStockCancelDialog(false)}
        onConfirm={handleCancelInvoice}
        documentType="Invoice"
        documentNumber={invoiceNumber}
        items={cancelItems}
        isLoading={cancelLoading}
      />
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
        recordType="invoices"
        recordId={invoice.id}
        documentNumber={invoiceNumber}
        documentYear={new Date(invoice.invoiceDate || invoice.createdAt || Date.now()).getUTCFullYear()}
      />
    </>
  );
}
