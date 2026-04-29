import SimpleConfirmDialog from "../../common/SimpleConfirmDialog";
import type { PORow } from "./types";

interface DeleteConfirmDialogProps {
  open: boolean;
  deletingPO: PORow | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmDialog({ open, deletingPO, onClose, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <SimpleConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Delete Purchase Order"
      description={`Are you sure you want to delete purchase order ${deletingPO?.poNumber}? This action will move it to the recycle bin where it can be restored later.`}
      confirmText="Yes, Delete"
      cancelText="No, Cancel"
      confirmVariant="destructive"
    />
  );
}
