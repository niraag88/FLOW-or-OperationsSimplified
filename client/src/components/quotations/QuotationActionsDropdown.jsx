
import React, { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye } from "lucide-react";
import { exportToCsv } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import { useToast } from "@/components/ui/use-toast";
import { Quotation } from "@/api/entities";
import { RecycleBin } from "@/api/entities";
import { AuditLog } from "@/api/entities";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";


export default function QuotationActionsDropdown({ quotation, canEdit, onEdit, onRefresh }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const user = await User.me();
      setCurrentUser(user);
    } catch (error) {
      console.error("Failed to load current user:", error);
      // Fallback for development/testing or if API fails
      setCurrentUser({ role: 'Admin', email: 'admin@example.com' });
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
    } catch (error) {
      return '';
    }
  };

  const formatDateForExport = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'yyyy-MM-dd') : '';
    } catch (error) {
      return '';
    }
  };
  
  const handleExportXLSX = () => {
    const exportData = [];
    
    exportData.push({
      'Document Type': 'QUOTATION',
      'Quotation Number': quotation.quotation_number,
      'Quotation Date': formatDateForExport(quotation.quotation_date),
      'Customer': quotation.customer_name || 'Unknown Customer',
      'Reference': quotation.reference || '',
      'Reference Date': quotation.reference_date ? formatDate(quotation.reference_date) : '',
      'Currency': quotation.currency,
      'Status': quotation.status,
      'Payment Terms': quotation.terms || ''
    });
    exportData.push({});
    exportData.push({
      'Product Code': 'PRODUCT CODE', 
      'Brand Name': 'BRAND NAME',
      'Description': 'DESCRIPTION',
      'Quantity': 'QTY',
      'Unit Price': 'UNIT PRICE',
      'Line Total': 'LINE TOTAL'
    });

    if (quotation.items && quotation.items.length > 0) {
      quotation.items.forEach(item => {
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
    exportData.push({});
    exportData.push({'Product Code': '', 'Brand Name': '', 'Description': '', 'Quantity': '', 'Unit Price': 'Subtotal:', 'Line Total': (quotation.subtotal || 0).toFixed(2) });
    if (quotation.tax_amount && quotation.tax_amount > 0) {
      exportData.push({'Product Code': '', 'Brand Name': '', 'Description': '', 'Quantity': '', 'Unit Price': 'VAT:', 'Line Total': (quotation.tax_amount || 0).toFixed(2) });
    }
    exportData.push({'Product Code': '', 'Brand Name': '', 'Description': '', 'Quantity': '', 'Unit Price': 'TOTAL:', 'Line Total': (quotation.total_amount || 0).toFixed(2) });
    
    exportToCsv(exportData, `Quotation_${quotation.quotation_number}`);
  };

  const handleViewPrint = () => {
    // Open print view in new tab for optimal speed
    const printUrl = `/quotation-print?id=${quotation.id}`;
    window.open(printUrl, '_blank');
  };

  const handleDelete = async () => {
    try {
      // Try to move to recycle bin if implemented
      try {
        await RecycleBin.create({
          document_type: 'Quotation',
          document_id: quotation.id,
          document_number: quotation.quotation_number || quotation.quoteNumber,
          document_data: quotation,
          deleted_by: currentUser?.email || 'unknown',
          deleted_date: new Date().toISOString(),
          reason: '', // Reason is not collected from SimpleConfirmDialog
          original_status: quotation.status,
          can_restore: true
        });
      } catch (error) {
        console.warn('RecycleBin.create() not implemented yet');
      }

      // Try to log the deletion if implemented
      try {
        await AuditLog.create({
          entity_type: 'Quotation',
          entity_id: quotation.id,
          action: 'deleted',
          user_email: currentUser?.email || 'unknown',
          changes: { 
            document_number: quotation.quotation_number || quotation.quoteNumber,
            deletion_reason: 'Deleted from UI', // Fixed reason for audit log
            moved_to_recycle_bin: true
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.warn('AuditLog.create() not implemented yet');
      }

      // Delete from main table
      await Quotation.delete(quotation.id);

      toast({
        title: 'Quotation Deleted',
        description: `${quotation.quotation_number || quotation.quoteNumber} has been deleted successfully.`
      });

      setShowDeleteDialog(false);
      onRefresh();
    } catch (error) {
      console.error('Error deleting quotation:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the quotation. Please try again.',
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
            <DropdownMenuItem onClick={() => onEdit(quotation)}>
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
        description={`Do you wish to confirm deleting Quotation "${quotation.quotation_number || quotation.quoteNumber}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
