
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, FileText, Download, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToCsv } from "../utils/export";
import { format } from 'date-fns';
import { PurchaseOrder } from "@/api/entities";
import { RecycleBin } from "@/api/entities";
import { AuditLog } from "@/api/entities";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function POActionsDropdown({ po, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  React.useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load current user:", error);
      // Fallback for demo or if user loading fails
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const handleExportXLSX = () => {
    const exportData = [];
    
    // Add PO header info
    exportData.push({
      'Document Type': 'PURCHASE ORDER',
      'PO Number': po.po_number,
      'Order Date': format(new Date(po.order_date), 'yyyy-MM-dd'),
      'Expected Delivery': po.expected_delivery_date ? format(new Date(po.expected_delivery_date), 'yyyy-MM-dd') : '',
      'Currency': po.currency,
      'Status': po.status
    });

    // Add empty row
    exportData.push({});

    // Add line items header
    exportData.push({
      'Product Code': 'PRODUCT CODE',
      'Description': 'DESCRIPTION',
      'Quantity': 'QTY',
      'Unit Price': 'UNIT PRICE',
      'Line Total': 'LINE TOTAL'
    });

    // Add line items - Removed AED currency references
    if (po.items && po.items.length > 0) {
      po.items.forEach(item => {
        exportData.push({
          'Product Code': item.product_code || '',
          'Description': item.description || '',
          'Quantity': item.quantity || 0,
          'Unit Price': (item.unit_price || 0).toFixed(2),
          'Line Total': (item.line_total || 0).toFixed(2)
        });
      });
    }

    // Add empty row
    exportData.push({});

    // Add totals - Removed AED references
    exportData.push({
      'Product Code': '',
      'Description': '',
      'Quantity': '',
      'Unit Price': 'Subtotal:',
      'Line Total': (po.subtotal || 0).toFixed(2)
    });

    if (po.tax_amount && po.tax_amount > 0) {
      exportData.push({
        'Product Code': '',
        'Description': '',
        'Quantity': '',
        'Unit Price': 'Tax:',
        'Line Total': (po.tax_amount || 0).toFixed(2)
      });
    }

    exportData.push({
      'Product Code': '',
      'Description': '',
      'Quantity': '',
      'Unit Price': 'TOTAL:',
      'Line Total': (po.total_amount || 0).toFixed(2)
    });
    
    exportToCsv(exportData, `Purchase_Order_${po.po_number}`);
  };

  const handleExportPDF = () => {
    window.open(`/Print?type=po&id=${po.id}`, '_blank');
  };

  const handleDelete = async () => {
    try {
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'PurchaseOrder',
        document_id: po.id,
        document_number: po.po_number,
        document_data: po,
        deleted_by: currentUser?.email || 'unknown',
        deleted_date: new Date().toISOString(),
        reason: '', // Reason is no longer collected
        original_status: po.status,
        can_restore: true
      });

      // Log the deletion
      await AuditLog.create({
        entity_type: 'PurchaseOrder',
        entity_id: po.id,
        action: 'deleted',
        user_email: currentUser?.email || 'unknown',
        changes: { 
          document_number: po.po_number,
          deletion_reason: 'Deleted from UI',
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Delete from main table
      await PurchaseOrder.delete(po.id);

      toast({
        title: 'Purchase Order Deleted',
        description: `${po.po_number} has been moved to the recycle bin.`
      });

      setShowDeleteDialog(false);
      onRefresh();
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the purchase order. Please try again.',
        variant: 'destructive'
      });
    }
  };

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
            <DropdownMenuItem onClick={() => onEdit(po)}>
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
        description={`Do you wish to confirm deleting Purchase Order "${po.po_number}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
