
import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Download, Trash2, Eye } from "lucide-react";
import { exportToCsv, exportQuotationToXLSX } from "../utils/export";
import { format, isValid, parseISO } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { Quotation } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";


export default function QuotationActionsDropdown({ quotation, canEdit, canCreate, onEdit, onRefresh, currentUser }) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '';
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
  
  const handleExportXLSX = async () => {
    try {
      await exportQuotationToXLSX(quotation);
      toast({
        title: 'Export Successful',
        description: `Quotation ${quotation.quoteNumber} exported to Excel.`
      });
    } catch (error) {
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
      await Quotation.delete(quotation.id);

      toast({
        title: 'Quotation Deleted',
        description: `${quotation.quotation_number || quotation.quoteNumber} has been moved to the recycle bin.`
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
          {canEdit && (
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
    </>
  );
}
