import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Customer } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function CustomerActionsDropdown({ customer, onEdit, onRefresh }: any) {
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    try {
      await Customer.delete(customer.id);

      toast({
        title: 'Customer Deleted',
        description: `${customer.name} has been moved to the recycle bin.`
      });

      setShowDeleteDialog(false);
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete the customer. Please try again.',
        variant: 'destructive'
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" >
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(customer)}>
            <Edit2 className="w-4 h-4 mr-2" />
            Edit
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
        description={`Do you wish to confirm deleting customer "${customer.name}"? It will be moved to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}
