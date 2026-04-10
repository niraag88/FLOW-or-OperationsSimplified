export interface POItem {
  quantity?: number | string | null;
  receivedQuantity?: number | string | null;
  unitPrice?: number | string | null;
}

export interface GRNItem {
  receivedQuantity?: number | string | null;
  received_quantity?: number | string | null;
  unitPrice?: number | string | null;
  unit_price?: number | string | null;
  orderedQuantity?: number | string | null;
  ordered_quantity?: number | string | null;
}

export interface ReconciliationResult {
  orderedTotal: number;
  reconciledTotal: number;
  difference: number;
  hasGRNData: boolean;
  isShortDelivery: boolean;
}

export function computeReconciliation(items: POItem[]): ReconciliationResult {
  if (!items || items.length === 0) {
    return { orderedTotal: 0, reconciledTotal: 0, difference: 0, hasGRNData: false, isShortDelivery: false };
  }

  const hasGRNData = items.some(i => (Number(i.receivedQuantity) ?? 0) > 0);

  const orderedTotal = items.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (parseFloat(String(item.unitPrice ?? 0)) || 0);
  }, 0);

  const reconciledTotal = items.reduce((sum, item) => {
    return sum + (Number(item.receivedQuantity) || 0) * (parseFloat(String(item.unitPrice ?? 0)) || 0);
  }, 0);

  const difference = orderedTotal - reconciledTotal;
  const isShortDelivery = hasGRNData && difference > 0.001;

  return { orderedTotal, reconciledTotal, difference, hasGRNData, isShortDelivery };
}

export function computeGRNTotal(grnItems: GRNItem[]): number {
  if (!grnItems || grnItems.length === 0) return 0;
  return grnItems.reduce((sum, item) => {
    return sum + (Number(item.receivedQuantity ?? item.received_quantity) || 0) * (parseFloat(String(item.unitPrice ?? item.unit_price ?? 0)) || 0);
  }, 0);
}

export function isGRNShortDelivery(grnItems: GRNItem[]): boolean {
  if (!grnItems || grnItems.length === 0) return false;
  return grnItems.some(item => {
    const received = Number(item.receivedQuantity ?? item.received_quantity) || 0;
    const ordered = Number(item.orderedQuantity ?? item.ordered_quantity) || 0;
    return ordered > 0 && received < ordered;
  });
}
