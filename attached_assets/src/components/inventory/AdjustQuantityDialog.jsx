import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Plus, Minus } from "lucide-react";
import { InventoryLot } from "@/api/entities";
import { InventoryAudit } from "@/api/entities";

export default function AdjustQuantityDialog({ open, onClose, lot, product, currentUser, onSuccess }) {
  const [adjustmentType, setAdjustmentType] = useState("increase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [referenceDocument, setReferenceDocument] = useState("");
  const [loading, setLoading] = useState(false);

  if (!lot || !product) return null;

  const calculateNewQuantity = () => {
    const qty = parseFloat(quantity) || 0;
    switch (adjustmentType) {
      case "increase":
        return lot.qty_on_hand + qty;
      case "decrease":
        return Math.max(0, lot.qty_on_hand - qty);
      case "correction":
        return Math.max(0, qty);
      default:
        return lot.qty_on_hand;
    }
  };

  const getDifference = () => {
    const newQty = calculateNewQuantity();
    return newQty - lot.qty_on_hand;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!quantity || !reason.trim()) return;

    setLoading(true);
    try {
      const newQuantity = calculateNewQuantity();
      const difference = getDifference();

      // Update inventory lot
      await InventoryLot.update(lot.id, {
        qty_on_hand: newQuantity
      });

      // Create audit log entry
      await InventoryAudit.create({
        inventory_lot_id: lot.id,
        product_id: lot.product_id,
        adjustment_type: adjustmentType,
        previous_qty: lot.qty_on_hand,
        adjusted_qty: newQuantity,
        difference: difference,
        reason: reason.trim(),
        reference_document: referenceDocument.trim() || null,
        adjusted_by: currentUser.email,
        adjustment_date: new Date().toISOString()
      });

      onSuccess();
    } catch (error) {
      console.error("Error adjusting quantity:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAdjustmentType("increase");
    setQuantity("");
    setReason("");
    setReferenceDocument("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Inventory Quantity</DialogTitle>
          <DialogDescription>
            Make adjustments to inventory lot quantities with audit trail
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Lot Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">{product.name}</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">SKU:</span> {product.sku}
              </div>
              <div>
                <span className="text-gray-500">Batch:</span> {lot.batch_no}
              </div>
              <div>
                <span className="text-gray-500">Location:</span> {lot.location}
              </div>
              <div>
                <span className="text-gray-500">Current Qty:</span> 
                <Badge variant="outline" className="ml-2">{lot.qty_on_hand}</Badge>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-green-600" />
                      Increase Quantity
                    </div>
                  </SelectItem>
                  <SelectItem value="decrease">
                    <div className="flex items-center gap-2">
                      <Minus className="w-4 h-4 text-red-600" />
                      Decrease Quantity
                    </div>
                  </SelectItem>
                  <SelectItem value="correction">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Set Exact Quantity
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                {adjustmentType === "correction" ? "New Quantity" : "Quantity to Adjust"}
              </Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                required
              />
            </div>

            {quantity && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-sm">
                  <p><strong>New Quantity:</strong> {calculateNewQuantity()}</p>
                  <p><strong>Net Change:</strong> 
                    <span className={getDifference() >= 0 ? 'text-green-600' : 'text-red-600'}>
                      {getDifference() >= 0 ? '+' : ''}{getDifference()}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Adjustment *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the reason for this adjustment..."
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference Document (Optional)</Label>
              <Input
                id="reference"
                value={referenceDocument}
                onChange={(e) => setReferenceDocument(e.target.value)}
                placeholder="PO number, DO number, etc."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !quantity || !reason.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {loading ? "Processing..." : "Apply Adjustment"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}