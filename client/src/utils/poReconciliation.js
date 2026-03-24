/**
 * Utility for PO delivery reconciliation calculations.
 * Used by POList, POForm, MarkPOPaidDialog, and GoodsReceiptsTab.
 */

/**
 * Compute reconciled payable total from PO line items.
 * reconciledTotal = sum(receivedQuantity × unitPrice) per item.
 *
 * @param {Array} items - PO items with {quantity, receivedQuantity, unitPrice}
 * @returns {{ orderedTotal, reconciledTotal, difference, hasGRNData, isShortDelivery }}
 */
export function computeReconciliation(items) {
  if (!items || items.length === 0) {
    return { orderedTotal: 0, reconciledTotal: 0, difference: 0, hasGRNData: false, isShortDelivery: false };
  }

  const hasGRNData = items.some(i => (i.receivedQuantity ?? 0) > 0);

  const orderedTotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
  }, 0);

  const reconciledTotal = items.reduce((sum, item) => {
    return sum + (Number(item.receivedQuantity) ?? 0) * (parseFloat(item.unitPrice) || 0);
  }, 0);

  const difference = orderedTotal - reconciledTotal;
  const isShortDelivery = hasGRNData && difference > 0.001;

  return { orderedTotal, reconciledTotal, difference, hasGRNData, isShortDelivery };
}

/**
 * Compute reconciled total for a single GRN.
 * @param {Array} grnItems - GRN items with {receivedQuantity, unitPrice}
 * @returns {number} total received value
 */
export function computeGRNTotal(grnItems) {
  if (!grnItems || grnItems.length === 0) return 0;
  return grnItems.reduce((sum, item) => {
    return sum + (Number(item.receivedQuantity ?? item.received_quantity) || 0) * (parseFloat(item.unitPrice ?? item.unit_price) || 0);
  }, 0);
}

/**
 * Check if a GRN represents a short delivery (some items received < ordered).
 * @param {Array} grnItems - GRN items with {receivedQuantity, orderedQuantity}
 * @returns {boolean}
 */
export function isGRNShortDelivery(grnItems) {
  if (!grnItems || grnItems.length === 0) return false;
  return grnItems.some(item => {
    const received = Number(item.receivedQuantity ?? item.received_quantity) || 0;
    const ordered = Number(item.orderedQuantity ?? item.ordered_quantity) || 0;
    return ordered > 0 && received < ordered;
  });
}
