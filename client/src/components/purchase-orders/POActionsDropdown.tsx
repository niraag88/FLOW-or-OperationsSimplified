
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, CheckCircle, RotateCcw, Upload, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportPODetailToXLSX, printPOGRNSummary } from "../utils/export";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import MarkPOPaidDialog from "./MarkPOPaidDialog";
import UploadFileDialog from "../common/UploadFileDialog";

export default function POActionsDropdown({ po, canEdit, onEdit, onRefresh, currentUser }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  const handleExportXLSX = async () => {
    try {
      await exportPODetailToXLSX(po.id, po.poNumber);
      toast({ title: 'Export successful', description: `${po.poNumber} exported to Excel.` });
    } catch (error: any) {
      console.error('Error exporting XLSX:', error);
      toast({ title: 'Export Failed', description: 'Failed to export XLSX. Please try again.', variant: 'destructive' });
    }
  };

  const handlePrintGRNSummary = async () => {
    try {
      await printPOGRNSummary(po.id);
    } catch {
      toast({ title: 'Error', description: 'Could not load purchase order details for printing.', variant: 'destructive' });
    }
  };

  const handleViewPrint = () => {
    const printUrl = `/po-print?id=${po.id}`;
    window.open(printUrl, '_blank');
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete the purchase order.');
      }
      toast({
        title: 'Purchase Order Deleted',
        description: `${po.poNumber} has been moved to the recycle bin.`
      });
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete the purchase order. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleMarkOutstanding = async () => {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/payment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paymentStatus: 'outstanding' }),
      });
      if (!res.ok) throw new Error('Failed to update payment status');
      toast({ title: 'Updated', description: `PO ${po.poNumber} marked as outstanding.` });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleUploadSuccess = async (storageKey) => {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/scan-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanKey: storageKey }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to link file to purchase order');
      }
      onRefresh();
    } catch (error: any) {
      console.error('Error saving scan key:', error);
      toast({
        title: 'Warning',
        description: 'File uploaded but failed to link it to the purchase order.',
        variant: 'destructive'
      });
    }
  };

  const poNumber = po.poNumber || po.po_number || `po-${po.id}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem onClick={() => onEdit(po)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleViewPrint}>
            <Eye className="w-4 h-4 mr-2" />
            View & Print PO
          </DropdownMenuItem>
          {(po.status === 'closed' || Number(po.receivedQty) > 0) && (
            <DropdownMenuItem onClick={handlePrintGRNSummary}>
              <Printer className="w-4 h-4 mr-2" />
              View & Print GRN Summary
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleExportXLSX}>
            <Download className="w-4 h-4 mr-2" />
            Export to XLSX
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {po.paymentStatus !== 'paid' && po.payment_status !== 'paid' ? (
            <DropdownMenuItem onClick={() => setShowMarkPaidDialog(true)} className="text-green-700 focus:text-green-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark as Paid
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleMarkOutstanding} className="text-amber-700 focus:text-amber-700">
              <RotateCcw className="w-4 h-4 mr-2" />
              Mark as Outstanding
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowUploadDialog(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MarkPOPaidDialog
        open={showMarkPaidDialog}
        onClose={() => setShowMarkPaidDialog(false)}
        po={po}
        onSuccess={onRefresh}
      />
      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting Purchase Order "${poNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
        recordType="purchase-orders"
        recordId={po.id}
        documentNumber={poNumber}
        maxSizeMB={2}
      />
    </>
  );
}
