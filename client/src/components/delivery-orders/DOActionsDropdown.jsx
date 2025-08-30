
import React, { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator, // Added for separator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, FileText, Download, Trash2 } from "lucide-react"; // Added Trash2
import { useToast } from "@/components/ui/use-toast";
import { exportToCsv } from "../utils/export";
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

  const handleExportXLSX = () => {
    const exportData = [];
    
    // Add DO header info
    exportData.push({
      'Document Type': 'DELIVERY ORDER',
      'DO Number': doOrder.do_number,
      'Order Date': format(new Date(doOrder.order_date), 'yyyy-MM-dd'),
      'Customer': doOrder.customer_name || 'Unknown Customer',
      'Reference': doOrder.reference || '',
      'Reference Date': doOrder.reference_date ? formatDate(doOrder.reference_date) : '',
      'Currency': doOrder.currency,
      'Status': doOrder.status
    });

    // Add empty row
    exportData.push({});

    // Add line items header
    exportData.push({
      'Product Code': 'PRODUCT CODE', 
      'Brand Name': 'BRAND NAME',
      'Description': 'DESCRIPTION',
      'Quantity': 'QTY',
      'Unit Price': 'UNIT PRICE',
      'Line Total': 'LINE TOTAL'
    });

    // Add line items
    if (doOrder.items && doOrder.items.length > 0) {
      doOrder.items.forEach(item => {
        exportData.push({
          'Product Code': item.product_code || '',
          'Brand Name': item.brand_name || '',
          'Description': item.description || '',
          'Quantity': item.quantity || 0,
          'Unit Price': (item.unit_price || 0).toFixed(2),
          'Line Total': (item.line_total || 0).toFixed(2)
        });
      });
    }

    // Add empty row
    exportData.push({});

    // Add totals
    exportData.push({
      'Product Code': '',
      'Brand Name': '',
      'Description': '',
      'Quantity': '',
      'Unit Price': 'Subtotal:',
      'Line Total': (doOrder.subtotal || 0).toFixed(2)
    });

    if (doOrder.tax_amount && doOrder.tax_amount > 0) {
      exportData.push({
        'Product Code': '',
        'Brand Name': '',
        'Description': '',
        'Quantity': '',
        'Unit Price': 'VAT:',
        'Line Total': (doOrder.tax_amount || 0).toFixed(2)
      });
    }

    exportData.push({
      'Product Code': '',
      'Brand Name': '',
      'Description': '',
      'Quantity': '',
      'Unit Price': 'TOTAL:',
      'Line Total': (doOrder.total_amount || 0).toFixed(2)
    });
    
    exportToCsv(exportData, `Delivery_Order_${doOrder.do_number}`);
  };

  const handleExportPDF = () => {
    window.open(`/Print?type=do&id=${doOrder.id}`, '_blank');
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
          <DropdownMenuItem onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-2" />
            Export as PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportXLSX}>
            <Download className="w-4 h-4 mr-2" />
            Export as XLSX
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
