
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  onConfirm: (productIdsToReverse: number[]) => void;
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
  const [checkedIds, setCheckedIds] = useState<Set<number>>(() => new Set(items.map((i) => i.productId)));

  const allChecked = items.every((i) => checkedIds.has(i.productId));
  const noneChecked = items.every((i) => !checkedIds.has(i.productId));

  const handleToggle = (productId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setCheckedIds(new Set(items.map((i) => i.productId)));
  };

  const handleDeselectAll = () => {
    setCheckedIds(new Set());
  };

  const handleConfirm = () => {
    onConfirm(Array.from(checkedIds));
  };

  React.useEffect(() => {
    if (open) {
      setCheckedIds(new Set(items.map((i) => i.productId)));
    }
  }, [open, items]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel {documentType} — Inventory Return</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong>{documentNumber}</strong> has already been delivered — stock has left your warehouse.
                  Select which items were physically returned so their stock can be added back.
                  Uncheck items the customer is keeping (e.g. as a goodwill gesture).
                </span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Line items to return to stock:</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-blue-600 hover:underline disabled:opacity-40"
                disabled={allChecked}
              >
                Select all
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={handleDeselectAll}
                className="text-blue-600 hover:underline disabled:opacity-40"
                disabled={noneChecked}
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={checkedIds.has(item.productId)}
                  onCheckedChange={() => handleToggle(item.productId)}
                />
                <Label htmlFor={`item-${item.id}`} className="flex-1 cursor-pointer text-sm font-normal">
                  <span className="font-medium">{item.description}</span>
                  <span className="ml-2 text-muted-foreground">× {item.quantity}</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {checkedIds.has(item.productId) ? "↩ return" : "— keep"}
                </span>
              </div>
            ))}
          </div>

          {noneChecked && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 border border-amber-200">
              No items will be returned to stock. The cancellation will proceed but inventory will remain as-is.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Keep as delivered
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Cancelling…" : "Confirm Cancellation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
