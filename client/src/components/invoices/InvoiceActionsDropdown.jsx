
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
import { useToast } from "@/components/ui/use-toast";
import { exportInvoiceToXLSX } from "../utils/export";
import { format } from 'date-fns';
import { Invoice } from "@/api/entities";
import { User } from "@/api/entities";
import MarkPaidDialog from "./MarkPaidDialog"; // Added
import SimpleConfirmDialog from "../common/SimpleConfirmDialog"; // Added, replaces ConfirmDeleteDialog
import CreateInvoiceFromQuotationDialog from './CreateInvoiceFromQuotationDialog'; // Added
import CreateFromExistingDialog from './CreateFromExistingDialog'; // Added

export default function InvoiceActionsDropdown({ invoice, canEdit, onEdit, onRefresh }) { // Kept onEdit as it's used in the JSX
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false); // Added for MarkPaidDialog
  const [showCreateInvoiceFromQuotationDialog, setShowCreateInvoiceFromQuotationDialog] = useState(false); // Added for CreateInvoiceFromQuotationDialog
  const [showCreateFromExistingDialog, setShowCreateFromExistingDialog] = useState(false); // Added for CreateFromExistingDialog


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
      await exportInvoiceToXLSX(invoice);
      toast({
        title: 'Export Successful',
        description: `Invoice ${invoice.invoice_number} exported to Excel.`
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
        description={`Do you wish to confirm deleting Invoice "${invoice.invoice_number}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
      <CreateInvoiceFromQuotationDialog
        open={showCreateInvoiceFromQuotationDialog}
        onClose={() => setShowCreateInvoiceFromQuotationDialog(false)}
        quotationId={null} // Placeholder, assuming it takes a quotation ID
        onInvoiceCreated={onRefresh}
      />
      <CreateFromExistingDialog
        open={showCreateFromExistingDialog}
        onClose={() => setShowCreateFromExistingDialog(false)}
        existingDocument={invoice} // Pass the current invoice or relevant data
        onDocumentCreated={onRefresh}
      />
    </>
  );
}
