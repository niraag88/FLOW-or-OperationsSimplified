
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, FileText, Download, Trash2, Eye } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToCsv, exportToXLSX, exportPurchaseOrderToPDF } from "../utils/export";
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

  const handleExportXLSX = async () => {
    try {
      // Fetch line items for this PO
      const response = await fetch(`/api/purchase-orders/${po.id}/items`);
      const items = await response.json();
      
      const exportData = [];
      
      // Add PO header info
      exportData.push({
        'Document Type': 'PURCHASE ORDER',
        'PO Number': po.poNumber,
        'Order Date': format(new Date(po.orderDate), 'yyyy-MM-dd'),
        'Expected Delivery': po.expectedDelivery ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd') : '',
        'Currency': 'GBP',
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

      // Add line items
      if (items && items.length > 0) {
        items.forEach(item => {
          exportData.push({
            'Product Code': item.productSku || '',
            'Description': item.productName || '',
            'Quantity': item.quantity || 0,
            'Unit Price': parseFloat(item.unitPrice || 0).toFixed(2),
            'Line Total': parseFloat(item.lineTotal || 0).toFixed(2)
          });
        });
      }

      // Add empty row
      exportData.push({});

      // Add totals
      exportData.push({
        'Product Code': '',
        'Description': '',
        'Quantity': '',
        'Unit Price': 'TOTAL (GBP):',
        'Line Total': parseFloat(po.totalAmount || 0).toFixed(2)
      });
      
      exportToXLSX(exportData, `Purchase_Order_${po.poNumber}`);
    } catch (error) {
      console.error('Error exporting XLSX:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export XLSX. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleViewPrint = () => {
    // Open print view in new tab
    const printUrl = `/po-print?id=${po.id}`;
    window.open(printUrl, '_blank');
  };

  const handleExportPDF = async () => {
    try {
      // Get the PO data with line items from the server
      const response = await fetch(`/api/export/po?poId=${po.id}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error('Failed to get PO data');
      }
      
      const purchaseOrder = result.data;
      console.log('Purchase Order data:', purchaseOrder);
      
      // Use the existing export function
      exportPurchaseOrderToPDF(purchaseOrder);
      
    } catch (error) {
      console.error('Error exporting PDF:', error);
      console.error('Error details:', error.message, error.stack);
      toast({
        title: 'Export Failed',
        description: `Failed to export PDF: ${error.message}`,
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async () => {
    try {
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'PurchaseOrder',
        document_id: po.id,
        document_number: po.poNumber,
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
          document_number: po.poNumber,
          deletion_reason: 'Deleted from UI',
          moved_to_recycle_bin: true
        },
        timestamp: new Date().toISOString()
      });

      // Delete from main table
      await PurchaseOrder.delete(po.id);

      toast({
        title: 'Purchase Order Deleted',
        description: `${po.poNumber} has been moved to the recycle bin.`
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
          <DropdownMenuItem onClick={handleViewPrint}>
            <Eye className="w-4 h-4 mr-2" />
            View & Print
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportXLSX}>
            <Download className="w-4 h-4 mr-2" />
            Export to XLSX
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
        description={`Do you wish to confirm deleting Purchase Order "${po.poNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
