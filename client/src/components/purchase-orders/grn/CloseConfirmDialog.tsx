import SimpleConfirmDialog from "../../common/SimpleConfirmDialog";
import type { PORow } from "./types";

interface CloseConfirmDialogProps {
  open: boolean;
  closingPO: PORow | null;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CloseConfirmDialog({ open, closingPO, onClose, onConfirm }: CloseConfirmDialogProps) {
  return (
    <SimpleConfirmDialog
      open={open}
      onClose={onClose}
      title="Force Close Purchase Order"
      description={`Are you sure you want to manually close ${closingPO?.poNumber}? This should only be done if you are not expecting any more items. This action cannot be undone.`}
      onConfirm={onConfirm}
      confirmText="Yes, Close PO"
      confirmVariant="destructive"
    />
  );
}
