
import React, { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, Upload, Paperclip } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportDeliveryOrderToXLSX } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import { DeliveryOrder } from "@/api/entities";
import { User } from "@/api/entities";
import UploadFileDialog from "../common/UploadFileDialog";

export default function DOActionsDropdown({ doOrder, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load current user:", error);
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const handleExportXLSX = async () => {
    try {
      await exportDeliveryOrderToXLSX(doOrder);
      toast({
        title: 'Export Successful',
        description: `Delivery Order ${doOrder.do_number} exported to Excel.`
      });
    } catch (error) {
      console.error('XLSX export error:', error);
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
      await DeliveryOrder.delete(doOrder.id);
      toast({
        title: 'Delivery Order Deleted',
        description: `${doOrder.do_number} has been moved to the recycle bin.`
      });
      setShowDeleteDialog(false);
      onRefresh();
    } catch (error) {
      console.error('Error deleting delivery order:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the delivery order. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleUploadSuccess = async (storageKey) => {
    try {
      await fetch(`/api/delivery-orders/${doOrder.id}/scan-key`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanKey: storageKey }),
        credentials: 'include',
      });
      onRefresh();
    } catch (error) {
      console.error('Error saving scan key:', error);
      toast({
        title: 'Warning',
        description: 'File uploaded but failed to link it to the delivery order.',
        variant: 'destructive'
      });
    }
  };

  const handleViewFile = async () => {
    const scanKey = doOrder.scanKey || doOrder.scan_key;
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

  const hasScanKey = !!(doOrder.scanKey || doOrder.scan_key);
  const doNumber = doOrder.do_number || doOrder.orderNumber || `do-${doOrder.id}`;

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
            <DropdownMenuItem onClick={handleViewFile}>
              <Paperclip className="w-4 h-4 mr-2" />
              View File
            </DropdownMenuItem>
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

      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting Delivery Order "${doNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
      <UploadFileDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={handleUploadSuccess}
        recordType="delivery"
        recordId={doOrder.id}
        documentNumber={doNumber}
      />
    </>
  );
}
