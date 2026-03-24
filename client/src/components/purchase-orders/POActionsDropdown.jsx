
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, CheckCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { exportToXLSX, exportPurchaseOrderToPDF } from "../utils/export";
import { format } from 'date-fns';
import { PurchaseOrder } from "@/api/entities";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import MarkPOPaidDialog from "./MarkPOPaidDialog";

export default function POActionsDropdown({ po, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
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
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const handleExportXLSX = async () => {
    try {
      const response = await fetch(`/api/purchase-orders/${po.id}/items`);
      const items = await response.json();
      
      const exportData = [];
      
      exportData.push({
        'Document Type': 'PURCHASE ORDER',
        'PO Number': po.poNumber,
        'Order Date': format(new Date(po.orderDate), 'yyyy-MM-dd'),
        'Expected Delivery': po.expectedDelivery ? format(new Date(po.expectedDelivery), 'yyyy-MM-dd') : '',
        'Currency': 'GBP',
        'Status': po.status
      });

      exportData.push({});

      exportData.push({
        'Product Code': 'PRODUCT CODE',
        'Description': 'DESCRIPTION',
        'Quantity': 'QTY',
        'Unit Price': 'UNIT PRICE',
        'Line Total': 'LINE TOTAL'
      });

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

      exportData.push({});

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
    const printUrl = `/po-print?id=${po.id}`;
    window.open(printUrl, '_blank');
  };

  const handleDelete = async () => {
    try {
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
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const poNumber = po.poNumber || po.po_number || `po-${po.id}`;

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
    </>
  );
}
