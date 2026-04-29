export class PurchaseOrderRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: { error: string },
  ) {
    super(responseBody.error);
    this.name = "PurchaseOrderRequestError";
  }
}

export type PurchaseOrderItemInput = {
  productId?: number | string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
  productName?: string | null;
  size?: string | null;
};

export type ComputedPurchaseOrderItem = {
  productId: number;
  quantity: number;
  unitPriceStr: string;
  lineTotalStr: string;
  descriptionOverride: string | null;
  sizeOverride: string | null;
};

export type ComputedPurchaseOrderTotals = {
  items: ComputedPurchaseOrderItem[];
  totalAmountStr: string;
  grandTotalStr: string;
};

export const PO_DEFAULT_FX_RATE_TO_AED = 4.85;

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    // parseFloat (NOT Number) preserves prior route coercion semantics:
    // "4.5abc" -> 4.5, "12abc" -> 12, "0x10" -> 0, "abc" -> NaN.
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function unitPriceWasProvided(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

export function computePurchaseOrderTotals(
  rawItems: PurchaseOrderItemInput[] | undefined | null,
  currency: string | null | undefined,
  fxRateToAed: number | string | null | undefined,
): ComputedPurchaseOrderTotals {
  const computed: ComputedPurchaseOrderItem[] = [];
  let totalAmount = 0;

  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      const qty = coerceFiniteNumber(raw?.quantity);
      if (qty !== null && qty < 0) {
        throw new PurchaseOrderRequestError(400, {
          error: "Quantity cannot be negative",
        });
      }
      // Quantity column is integer-typed; a fractional value would
      // crash at insert time today. Reject up front with a clear 400.
      if (qty !== null && !Number.isInteger(qty)) {
        throw new PurchaseOrderRequestError(400, {
          error: "Quantity must be a whole number",
        });
      }

      // Validate unitPrice on every line where the caller actually
      // supplied one, even if the line will later be skipped for a
      // missing productId or zero qty. A non-numeric or negative price
      // must reject the whole request, not be hidden behind a silent skip.
      if (unitPriceWasProvided(raw?.unitPrice)) {
        const probe = coerceFiniteNumber(raw?.unitPrice);
        if (probe === null) {
          throw new PurchaseOrderRequestError(400, {
            error: "Unit price must be a number",
          });
        }
        if (probe < 0) {
          throw new PurchaseOrderRequestError(400, {
            error: "Unit price cannot be negative",
          });
        }
      }

      // Lines without a productId or with quantity <= 0 are silently
      // skipped — same as today's `if (productId && qty > 0)` filter.
      if (!raw?.productId || qty === null || qty <= 0) {
        continue;
      }

      const unitPrice = coerceFiniteNumber(raw?.unitPrice) ?? 0;

      const productIdNum =
        typeof raw.productId === "number"
          ? raw.productId
          : parseInt(String(raw.productId), 10);
      if (!Number.isFinite(productIdNum) || !Number.isInteger(productIdNum)) {
        continue;
      }

      const lineTotal = round2(qty * unitPrice);
      totalAmount += lineTotal;

      computed.push({
        productId: productIdNum,
        quantity: qty,
        unitPriceStr: unitPrice.toFixed(2),
        lineTotalStr: lineTotal.toFixed(2),
        descriptionOverride: raw.productName ?? null,
        sizeOverride: raw.size ?? null,
      });
    }
  }

  totalAmount = round2(totalAmount);

  // Mirror prior fxRate fallback exactly: parseFloat(...) || 4.85.
  // NaN, empty, and zero all fall back to the default; negatives pass through.
  const fxParsed = coerceFiniteNumber(fxRateToAed);
  const fxRate =
    fxParsed !== null && fxParsed !== 0 ? fxParsed : PO_DEFAULT_FX_RATE_TO_AED;

  const effectiveCurrency = currency ?? "GBP";
  const grandTotal =
    effectiveCurrency === "AED" ? totalAmount : round2(totalAmount * fxRate);

  return {
    items: computed,
    totalAmountStr: totalAmount.toFixed(2),
    grandTotalStr: grandTotal.toFixed(2),
  };
}
