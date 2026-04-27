import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export interface StockLineItem {
  id: number;
  productId: number;
  description: string;
  quantity: number;
}

interface CancelWithStockDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  documentType: "Delivery Order" | "Invoice";
  documentNumber: string;
  items: StockLineItem[];
  isLoading?: boolean;
}

export default function CancelWithStockDialog({
  open,
  onClose,
  onConfirm,
  documentType,
  documentNumber,
  items,
  isLoading = false,
}: CancelWithStockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {documentType} — Restore Stock</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Cancelling <strong>{documentNumber}</strong> will restore all
                  stock for the items below and cannot be undone.
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="text-sm font-medium text-foreground">
            Items that will be returned to stock:
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y" data-testid="cancel-items-preview">
            {items.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground italic">
                No stock to restore.
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="font-medium text-foreground truncate">
                    {item.description}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    × {item.quantity}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            If the customer is keeping any items, restore stock now and record
            a separate sale or write-off for those items.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Keep as delivered
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
            data-testid="confirm-cancel-button"
          >
            {isLoading ? "Cancelling…" : "Confirm Full Cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
