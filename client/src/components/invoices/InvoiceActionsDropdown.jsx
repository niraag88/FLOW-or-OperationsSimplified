
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, Upload, Paperclip, X, CheckCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportInvoiceToXLSX } from "../utils/export";
import { format } from 'date-fns';
import { Invoice } from "@/api/entities";
import MarkPaidDialog from "./MarkPaidDialog";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import CreateInvoiceFromQuotationDialog from './CreateInvoiceFromQuotationDialog';
import CreateFromExistingDialog from './CreateFromExistingDialog';
import UploadFileDialog from "../common/UploadFileDialog";

export default function InvoiceActionsDropdown({ invoice, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [showCreateInvoiceFromQuotationDialog, setShowCreateInvoiceFromQuotationDialog] = useState(false);
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showRemoveFileDialog, setShowRemoveFileDialog] = useState(false);

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
    } catch (error) {
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
      await Invoice.delete(invoice.id);
      toast({
        title: 'Invoice Deleted',
        description: `${invoice.invoice_number} has been moved to the recycle bin.`
      });
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the invoice. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleUploadSuccess = async (storageKey) => {
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
    } catch (error) {
      console.error('Error saving scan key:', error);
      toast({
        title: 'Warning',
        description: 'File uploaded but failed to link it to the invoice.',
        variant: 'destructive'
      });
    }
  };

  const handleViewFile = async () => {
    const scanKey = invoice.scanKey || invoice.scan_key;
    if (!scanKey) return;
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get download link');
      window.open(data.url, '_blank');
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const hasScanKey = !!(invoice.scanKey || invoice.scan_key);
  const invoiceNumber = invoice.invoiceNumber || invoice.invoice_number || `inv-${invoice.id}`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
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
          <DropdownMenuSeparator />
          {invoice.paymentStatus !== 'paid' && invoice.payment_status !== 'paid' ? (
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
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
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
      <CreateInvoiceFromQuotationDialog
        open={showCreateInvoiceFromQuotationDialog}
        onClose={() => setShowCreateInvoiceFromQuotationDialog(false)}
        quotationId={null}
        onInvoiceCreated={onRefresh}
      />
      <CreateFromExistingDialog
        open={showCreateFromExistingDialog}
        onClose={() => setShowCreateFromExistingDialog(false)}
        existingDocument={invoice}
        onDocumentCreated={onRefresh}
      />
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
        recordType="invoices"
        recordId={invoice.id}
        documentNumber={invoiceNumber}
      />
    </>
  );
}
