
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye, XCircle } from "lucide-react";
import { exportToCsv, exportQuotationToXLSX } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { Quotation as QuotationEntity } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";
import type { Quotation } from "@shared/schema";


interface QuotationActionsDropdownProps {
  quotation: Record<string, any>;
  canEdit: boolean;
  canCreate: boolean;
  canOverride: boolean;
  onEdit: (quotation: Record<string, any>) => void;
  onRefresh: () => void;
  currentUser?: { email?: string; role?: string } | null;
}

export default function QuotationActionsDropdown({ quotation, canEdit, canCreate, canOverride, onEdit, onRefresh, currentUser }: QuotationActionsDropdownProps) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const formatDate = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '';
    } catch (error: any) {
      return '';
    }
  };

  const formatDateForExport = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'yyyy-MM-dd') : '';
    } catch (error: any) {
      return '';
    }
  };
  
  const handleExportXLSX = async () => {
    try {
      await exportQuotationToXLSX(quotation);
      toast({
        title: 'Export Successful',
        description: `Quotation ${quotation.quoteNumber} exported to Excel.`
      });
    } catch (error: any) {
      console.error('XLSX export error:', error);
      toast({
        title: 'Export Failed', 
        description: 'Failed to export quotation to Excel. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleViewPrint = () => {
    // Open print view in new tab for optimal speed
    const printUrl = `/quotation-print?id=${quotation.id}`;
    window.open(printUrl, '_blank');
  };

  const handleDelete = async () => {
    try {
      await QuotationEntity.delete(quotation.id);

      toast({
        title: 'Quotation Deleted',
        description: `${quotation.quotation_number || quotation.quoteNumber} has been moved to the recycle bin.`
      });

      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting quotation:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the quotation. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleCancel = async () => {
    try {
      const resp = await fetch(`/api/quotations/${quotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}`);
      }
      toast({
        title: 'Quotation Cancelled',
        description: `${quotation.quotation_number || quotation.quoteNumber} has been cancelled.`,
      });
      setShowCancelDialog(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error cancelling quotation:', error);
      toast({
        title: 'Cancel Failed',
        description: 'Failed to cancel the quotation. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isCancellable = canEdit && quotation.status !== 'cancelled' && quotation.status !== 'paid';


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
          {isCancellable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowCancelDialog(true)}
                className="text-orange-600 focus:text-orange-600"
                data-testid="menuitem-cancel-quotation"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel Quotation
              </DropdownMenuItem>
            </>
          )}
          {canEdit && quotation.status !== 'cancelled' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setShowDeleteDialog(true)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
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
      <SimpleConfirmDialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={handleCancel}
        title="Cancel Quotation"
        description={`Are you sure you want to cancel Quotation "${quotation.quotation_number || quotation.quoteNumber}"? This action cannot be undone.`}
        confirmText="Yes, Cancel Quotation"
        confirmVariant="destructive"
      />
    </>
  );
}
