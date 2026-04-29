import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Paperclip, X } from "lucide-react";
import { format } from "date-fns";
import type { POItem, PORow } from "./types";

interface ReceiveDialogProps {
  selectedPOForReceive: PORow | null;
  onClose: () => void;
  receiveQuantities: Record<string, number>;
  onReceiveQuantityChange: (itemId: number, value: number) => void;
  receiveNotes: string;
  setReceiveNotes: (value: string) => void;
  receiveDate: string;
  setReceiveDate: (value: string) => void;
  receiveRefNumber: string;
  setReceiveRefNumber: (value: string) => void;
  receiveRefDate: string;
  setReceiveRefDate: (value: string) => void;
  pendingDocs: (File | null)[];
  updatePendingDoc: (idx: number, file: File | null) => void;
  handlePendingDocSelect: (idx: number, e: React.ChangeEvent<HTMLInputElement>) => void;
  processingPOId: number | null;
  getReceivedQuantityForItem: (poId: number, productId: number) => number;
  onSaveReceive: (forceClose?: boolean) => void;
}

export default function ReceiveDialog({
  selectedPOForReceive,
  onClose,
  receiveQuantities,
  onReceiveQuantityChange,
  receiveNotes,
  setReceiveNotes,
  receiveDate,
  setReceiveDate,
  receiveRefNumber,
  setReceiveRefNumber,
  receiveRefDate,
  setReceiveRefDate,
  pendingDocs,
  updatePendingDoc,
  handlePendingDocSelect,
  processingPOId,
  getReceivedQuantityForItem,
  onSaveReceive,
}: ReceiveDialogProps) {
  const allItemsFullyReceived = selectedPOForReceive?.items?.every((item: POItem) => {
    const totalReceived = getReceivedQuantityForItem(selectedPOForReceive?.id ?? 0, item.productId ?? 0);
    const currentReceiving = receiveQuantities[item.id] || 0;
    return (totalReceived + currentReceiving) >= (item.quantity ?? 0);
  });

  const hasQuantitiesToReceive = selectedPOForReceive?.items?.some((item: POItem) => receiveQuantities[item.id] > 0);

  return (
    <Dialog open={!!selectedPOForReceive} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Receive Goods - {selectedPOForReceive?.brandName || 'Unknown Brand'} - {selectedPOForReceive?.poNumber}
            {selectedPOForReceive?.orderDate && !isNaN(new Date(selectedPOForReceive.orderDate).getTime()) && ` - ${format(new Date(selectedPOForReceive.orderDate), 'dd/MM/yy')}`}
          </DialogTitle>
          <DialogDescription>
            Enter the quantities received for each product. You can receive partial quantities and continue receiving more later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Already Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Receiving Now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedPOForReceive?.items?.map((item: POItem, index: number) => {
                const totalReceived = getReceivedQuantityForItem(selectedPOForReceive?.id ?? 0, item.productId ?? 0);
                const remaining = (item.quantity ?? 0) - totalReceived;

                return (
                  <TableRow key={index}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{item.productName}</p>
                        <p className="text-sm text-gray-500">{item.productSku} • {item.size}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{totalReceived}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={remaining > 0 ? "secondary" : "default"}>
                        {remaining}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        max={remaining}
                        placeholder="0"
                        value={receiveQuantities[item.id] || ''}
                        onChange={(e) => onReceiveQuantityChange(item.id, parseInt(e.target.value) || 0)}
                        disabled={remaining <= 0}
                        className="w-24 text-right ml-auto"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="receive-date">Received Date</Label>
              <Input
                id="receive-date"
                type="date"
                value={receiveDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setReceiveDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receive-notes">Notes (optional)</Label>
              <Textarea
                id="receive-notes"
                placeholder="Add any notes about this goods receipt..."
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="receive-ref-number">Reference No. (optional)</Label>
              <Input
                id="receive-ref-number"
                type="text"
                placeholder="e.g. REF-2024-001"
                value={receiveRefNumber}
                onChange={(e) => setReceiveRefNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receive-ref-date">Reference Date (optional)</Label>
              <Input
                id="receive-ref-date"
                type="date"
                value={receiveRefDate}
                onChange={(e) => setReceiveRefDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label>Attach Delivery Documents (optional)</Label>
            <p className="text-xs text-gray-500">Up to 3 documents — PDF, JPG, PNG, max 5 MB each. Attached automatically after saving.</p>
            <div className="flex gap-2 flex-wrap">
              {[0, 1, 2].map((idx: number) => {
                const slotLabel = `Supporting Documentation ${idx + 1}`;
                const file = pendingDocs[idx];
                return (
                  <div key={idx} className="flex-1 min-w-[160px]">
                    {file ? (
                      <div className="flex items-center gap-2 p-2 rounded text-xs border bg-blue-50 border-blue-200">
                        <FileText className="w-4 h-4 flex-shrink-0 text-blue-600" />
                        <span className="flex-1 truncate text-blue-800">{file.name}</span>
                        <button type="button" onClick={() => updatePendingDoc(idx, null)} className="text-gray-400 hover:text-red-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 p-2 border border-dashed rounded text-xs cursor-pointer transition-colors border-gray-300 hover:border-blue-400 hover:bg-blue-50 text-gray-500">
                        <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{slotLabel}</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handlePendingDocSelect(idx, e)}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

          {/* Dynamic button logic based on whether all quantities match */}
          {allItemsFullyReceived && hasQuantitiesToReceive ? (
            <Button
              onClick={() => onSaveReceive(true)}
              disabled={processingPOId === selectedPOForReceive?.id}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processingPOId === selectedPOForReceive?.id ? "Processing..." : "Save & Close"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onSaveReceive(false)}
                disabled={processingPOId === selectedPOForReceive?.id || !hasQuantitiesToReceive}
              >
                {processingPOId === selectedPOForReceive?.id ? "Processing..." : "Save"}
              </Button>
              <Button
                onClick={() => onSaveReceive(true)}
                disabled={processingPOId === selectedPOForReceive?.id}
                variant="destructive"
              >
                {processingPOId === selectedPOForReceive?.id ? "Processing..." : "Save & Close"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
