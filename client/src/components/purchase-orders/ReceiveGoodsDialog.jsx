import React, { useState, useEffect } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GoodsReceipt } from "@/api/entities";
import { InventoryLot } from "@/api/entities";
import { InventoryAudit } from "@/api/entities";
import { PurchaseOrder } from "@/api/entities";
import { Product } from "@/api/entities";
import { AuditLog } from "@/api/entities";

export default function ReceiveGoodsDialog({ open, onClose, purchaseOrder, currentUser, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [formData, setFormData] = useState({
    grn_number: "",
    receipt_date: new Date().toISOString().split('T')[0],
    delivery_note_ref: "",
    notes: "",
    items: []
  });

  useEffect(() => {
    if (open && purchaseOrder) {
      loadProducts();
      generateGRNNumber();
      initializeItems();
    }
  }, [open, purchaseOrder]);

  const loadProducts = async () => {
    try {
      const productsData = await Product.list();
      setProducts(productsData);
    } catch (error) {
      console.error("Error loading products:", error);
    }
  };

  const generateGRNNumber = () => {
    const timestamp = Date.now().toString().slice(-6);
    const grnNumber = `GRN-${timestamp}`;
    setFormData(prev => ({ ...prev, grn_number: grnNumber }));
  };

  const initializeItems = () => {
    const items = purchaseOrder.items?.map(item => ({
      product_id: item.product_id,
      ordered_quantity: item.quantity,
      received_quantity: 0,
      unit_price: item.unit_price,
      batch_no: "",
      expiry_date: "",
      location: "Warehouse A"
    })) || [];

    setFormData(prev => ({
      ...prev,
      items
    }));
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData(prev => ({
      ...prev,
      items: newItems
    }));
  };

  const getProductInfo = (productId) => {
    return products.find(p => p.id === productId) || {};
  };

  const getTotalReceived = () => {
    return formData.items.reduce((sum, item) => sum + (item.received_quantity || 0), 0);
  };

  const logAuditAction = async (action, entityType, entityId, changes = {}) => {
    try {
      await AuditLog.create({
        entity_type: entityType,
        entity_id: entityId,
        action,
        user_email: currentUser.email,
        changes,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error logging audit action:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create GRN
      const grnData = {
        grn_number: formData.grn_number,
        purchase_order_id: purchaseOrder.id,
        supplier_id: purchaseOrder.supplier_id,
        receipt_date: formData.receipt_date,
        received_by: currentUser.email,
        delivery_note_ref: formData.delivery_note_ref,
        notes: formData.notes,
        items: formData.items
      };

      const newGRN = await GoodsReceipt.create(grnData);
      await logAuditAction("create", "GoodsReceipt", newGRN.id, { grn_number: formData.grn_number });

      // Update inventory lots and create audit entries
      for (const item of formData.items) {
        if (item.received_quantity > 0) {
          // Create inventory lot
          const lotData = {
            product_id: item.product_id,
            batch_no: item.batch_no || `BATCH-${Date.now()}`,
            expiry_date: item.expiry_date || null,
            location: item.location || "Warehouse A",
            qty_on_hand: item.received_quantity,
            cost_per_unit: item.unit_price,
            currency: purchaseOrder.currency,
            notes: `Received via GRN ${formData.grn_number}`,
            is_active: true
          };

          const newLot = await InventoryLot.create(lotData);

          // Create inventory audit entry
          await InventoryAudit.create({
            inventory_lot_id: newLot.id,
            product_id: item.product_id,
            adjustment_type: "increase",
            previous_qty: 0,
            adjusted_qty: item.received_quantity,
            difference: item.received_quantity,
            reason: `Goods received via PO ${purchaseOrder.po_number}`,
            reference_document: purchaseOrder.po_number,
            adjusted_by: currentUser.email,
            adjustment_date: new Date().toISOString()
          });
        }
      }

      // Update PO items with received quantities
      const updatedItems = purchaseOrder.items?.map(poItem => {
        const receivedItem = formData.items.find(item => item.product_id === poItem.product_id);
        return {
          ...poItem,
          received_quantity: (poItem.received_quantity || 0) + (receivedItem?.received_quantity || 0)
        };
      }) || [];

      // Check if PO is fully received
      const allFullyReceived = updatedItems.every(item => 
        (item.received_quantity || 0) >= item.quantity
      );

      // Update PO status if needed
      let newStatus = purchaseOrder.status;
      if (allFullyReceived && newStatus === 'issued') {
        newStatus = 'received';
      } else if (getTotalReceived() > 0 && newStatus === 'issued') {
        newStatus = 'received'; // Partially received
      }

      await PurchaseOrder.update(purchaseOrder.id, {
        items: updatedItems,
        status: newStatus
      });

      await logAuditAction("goods_received", "PurchaseOrder", purchaseOrder.id, {
        grn_number: formData.grn_number,
        items_received: formData.items.filter(item => item.received_quantity > 0).length
      });

      onSuccess();
    } catch (error) {
      console.error("Error receiving goods:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!purchaseOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Receive Goods - {purchaseOrder.po_number}</DialogTitle>
          <DialogDescription>
            Record the receipt of goods and update inventory levels
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* GRN Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="grn_number">GRN Number *</Label>
              <Input
                id="grn_number"
                value={formData.grn_number}
                onChange={(e) => handleInputChange('grn_number', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receipt_date">Receipt Date *</Label>
              <Input
                id="receipt_date"
                type="date"
                value={formData.receipt_date}
                onChange={(e) => handleInputChange('receipt_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery_note_ref">Delivery Note Ref</Label>
              <Input
                id="delivery_note_ref"
                value={formData.delivery_note_ref}
                onChange={(e) => handleInputChange('delivery_note_ref', e.target.value)}
                placeholder="Supplier's delivery note"
              />
            </div>
          </div>

          {/* Items to Receive */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Items to Receive</h3>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Ordered</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Batch No</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.items.map((item, index) => {
                    const product = getProductInfo(item.product_id);
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-gray-500 font-mono">{product.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.ordered_quantity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max={item.ordered_quantity}
                            value={item.received_quantity}
                            onChange={(e) => updateItem(index, 'received_quantity', parseInt(e.target.value) || 0)}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.batch_no}
                            onChange={(e) => updateItem(index, 'batch_no', e.target.value)}
                            placeholder="Batch number"
                            className="w-32"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={item.expiry_date}
                            onChange={(e) => updateItem(index, 'expiry_date', e.target.value)}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.location}
                            onChange={(e) => updateItem(index, 'location', e.target.value)}
                            placeholder="Storage location"
                            className="w-32"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total Items Receiving</p>
                <p className="font-semibold text-lg">{getTotalReceived()}</p>
              </div>
              <div>
                <p className="text-gray-600">Items with Quantities</p>
                <p className="font-semibold text-lg">
                  {formData.items.filter(item => item.received_quantity > 0).length} / {formData.items.length}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes about the receipt..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || getTotalReceived() === 0}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? "Processing..." : "Receive Goods"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}