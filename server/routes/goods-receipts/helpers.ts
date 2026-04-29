import { goodsReceipts, purchaseOrders } from "@shared/schema";
import { db } from "../../db";
import { eq, and } from "drizzle-orm";

export type NegativeStockEntry = {
  productId: number;
  productName: string;
  currentStock: number;
  reversalQty: number;
  projectedStock: number;
};

export class GrnCancelNegativeStockError extends Error {
  readonly products: NegativeStockEntry[];
  constructor(products: NegativeStockEntry[]) {
    super('Cancelling this GRN would push one or more products into negative stock');
    this.name = 'GrnCancelNegativeStockError';
    this.products = products;
  }
}

export class PoReceivedQtyUnderflowError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super('Cancelling this GRN would push purchase order received quantities below zero');
    this.name = 'PoReceivedQtyUnderflowError';
    this.details = details;
  }
}

export async function recalculatePOPaymentStatus(poId: number): Promise<void> {
  const grns = await db.select({
    paymentStatus: goodsReceipts.paymentStatus,
  }).from(goodsReceipts).where(
    and(eq(goodsReceipts.poId, poId), eq(goodsReceipts.status, 'confirmed'))
  );

  let derived: 'outstanding' | 'partially_paid' | 'paid';
  if (grns.length === 0) {
    derived = 'outstanding';
  } else {
    const paidCount = grns.filter(g => g.paymentStatus === 'paid').length;
    if (paidCount === 0) {
      derived = 'outstanding';
    } else if (paidCount === grns.length) {
      derived = 'paid';
    } else {
      derived = 'partially_paid';
    }
  }

  await db.update(purchaseOrders)
    .set({ paymentStatus: derived })
    .where(eq(purchaseOrders.id, poId));
}

export class OverReceiveError extends Error {
  readonly details: string[];
  constructor(details: string[]) {
    super('Over-receive not allowed');
    this.name = 'OverReceiveError';
    this.details = details;
  }
}
