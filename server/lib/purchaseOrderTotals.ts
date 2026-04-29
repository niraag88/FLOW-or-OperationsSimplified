// Purchase-order totals + line-item validation, centralised so both POST
// and PUT to /api/purchase-orders compute the same numbers from the same
// trusted inputs. The route handlers MUST ignore client-supplied
// lineTotal / totalAmount / grandTotal and use the values returned here
// instead — that is the whole point of this helper. See task-351.

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
    // parseFloat (NOT Number) so we exactly mirror the prior route
    // semantics: `parseFloat("4.5abc") === 4.5`, `parseFloat("0x10") === 0`,
    // `parseFloat("abc") === NaN`. Number() would treat "0x10" as 16 and
    // reject "12abc" outright — both would silently change the persisted
    // total or 400 a payload that today's clients send successfully.
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
      // Reject negative quantities outright. Lines without a productId
      // or with quantity <= 0 / non-integer are silently skipped — this
      // matches the today behaviour where `if (productId && qty > 0)`
      // filtered them out before the insert.
      if (qty !== null && qty < 0) {
        throw new PurchaseOrderRequestError(400, {
          error: "Quantity cannot be negative",
        });
      }
      if (
        !raw?.productId ||
        qty === null ||
        qty <= 0 ||
        !Number.isInteger(qty)
      ) {
        continue;
      }

      const unitPrice = coerceFiniteNumber(raw?.unitPrice);
      if (unitPrice === null) {
        throw new PurchaseOrderRequestError(400, {
          error: "Unit price must be a number",
        });
      }
      if (unitPrice < 0) {
        throw new PurchaseOrderRequestError(400, {
          error: "Unit price cannot be negative",
        });
      }

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

  // Mirror the today fxRate fallback exactly: `parseFloat(...) || 4.85`
  // — i.e. NaN, empty, and zero all fall back to 4.85; a negative number
  // is preserved (negative-fx scenarios are not policed by this task,
  // see task-351 scope).
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
