
import React, { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator, // Added for separator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye } from "lucide-react"; // Added Trash2
import { useToast } from "@/components/ui/use-toast";
import { exportDeliveryOrderToXLSX } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import SimpleConfirmDialog from "../common/SimpleConfirmDialog"; // Changed import from ConfirmDeleteDialog
import { DeliveryOrder } from "@/api/entities"; // New import
import { RecycleBin } from "@/api/entities"; // New import
import { AuditLog } from "@/api/entities"; // New import
import { User } from "@/api/entities"; // New import

export default function DOActionsDropdown({ doOrder, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false); // New state
  const [currentUser, setCurrentUser] = useState(null); // New state

  // New useEffect hook to load current user
  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      // Fallback or error handling if user cannot be loaded
      // This is a placeholder for development/testing if User.me() fails
      console.error("Failed to load current user:", error);
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
    } catch (error) {
      console.error("Error formatting date:", error);
      return '';
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

  // Modified handleDelete function - no longer accepts a 'reason' parameter
  const handleDelete = async () => {
    try {
      await RecycleBin.create({
        document_type: 'DeliveryOrder',
        document_id: doOrder.id,
        document_number: doOrder.do_number,
        document_data: doOrder,
        deleted_by: currentUser?.email || 'unknown',
        deleted_date: new Date().toISOString(),
        reason: '', // Set reason to empty string as per simplification
        original_status: doOrder.status,
        can_restore: true
      });

      await AuditLog.create({
        entity_type: 'DeliveryOrder',
        entity_id: doOrder.id,
        action: 'deleted',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          document_number: doOrder.do_number,
          deletion_reason: 'Deleted from UI', // Set specific deletion reason
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Assuming DeliveryOrder.delete marks the order as inactive/deleted
      // or removes it from the primary list view, as it's moved to recycle bin.
      await DeliveryOrder.delete(doOrder.id);

      toast({
        title: 'Delivery Order Deleted',
        description: `${doOrder.do_number} has been moved to the recycle bin.`
      });

      setShowDeleteDialog(false);
      onRefresh(); // Refresh parent component to update the list
    } catch (error) {
      console.error('Error deleting delivery order:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the delivery order. Please try again.',
        variant: 'destructive'
      });
    }
  };

  return (
    <> {/* React Fragment to wrap multiple elements */}
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
          <DropdownMenuSeparator /> {/* Separator for delete option */}
          <DropdownMenuItem 
            onClick={() => setShowDeleteDialog(true)}
            className="text-red-600 focus:text-red-600" // Styling for delete
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Changed to SimpleConfirmDialog component */}
      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Confirm Deletion"
        description={`Do you wish to confirm deleting Delivery Order "${doOrder.do_number}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
