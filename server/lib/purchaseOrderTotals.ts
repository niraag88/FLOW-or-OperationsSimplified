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

// Task #369 (RF-3B): strict numeric coercion. Replaces the old parseFloat
// behaviour which silently accepted partially-numeric strings like
// "12abc" -> 12, "4.5abc" -> 4.5, "0x10" -> 0, and special string values
// "Infinity" / "NaN". After this change, only finite numbers and clean
// numeric strings (digits, optional single decimal point, optional leading
// sign, surrounding whitespace tolerated) are accepted; everything else
// returns null and is rejected upstream by the caller's "was provided"
// check. Scientific notation ("1e5") is also rejected — PO inputs are
// human-entered decimals, not exponents.
const STRICT_NUMERIC_PATTERN = /^-?\d+(\.\d+)?$/;

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    if (!STRICT_NUMERIC_PATTERN.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function valueWasProvided(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

// Task #369 (RF-3B): a supplied fxRateToAed must be a strict positive
// finite number. Genuinely blank / omitted values fall back to the
// default. Zero, negative, NaN, Infinity, and partially-numeric strings
// are rejected with 400 instead of silently coerced. Used by both the
// helper below and the header-only PUT branch in the route, so the
// PUT can validate BEFORE writing the header row.
export function parseFxRateOrDefault(value: unknown): number {
  if (!valueWasProvided(value)) return PO_DEFAULT_FX_RATE_TO_AED;
  const parsed = coerceFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    throw new PurchaseOrderRequestError(400, {
      error: "FX rate must be a positive number",
    });
  }
  return parsed;
}

export function computePurchaseOrderTotals(
  rawItems: PurchaseOrderItemInput[] | undefined | null,
  currency: string | null | undefined,
  fxRateToAed: number | string | null | undefined,
): ComputedPurchaseOrderTotals {
  // Validate fx FIRST so a bad fx never hides behind item-loop errors
  // and so the helper has a stable, validated value for the grand-total
  // calculation below.
  const fxRate = parseFxRateOrDefault(fxRateToAed);

  const computed: ComputedPurchaseOrderItem[] = [];
  let totalAmount = 0;

  if (Array.isArray(rawItems)) {
    for (const raw of rawItems) {
      // Task #369 (RF-3B): when quantity is explicitly supplied (non-blank)
      // but is not a valid number, reject up front rather than letting it
      // fall into the silent-skip branch below. Genuinely blank quantity
      // (undefined / null / "") still skips silently for UI placeholder rows.
      const qty = coerceFiniteNumber(raw?.quantity);
      if (valueWasProvided(raw?.quantity) && qty === null) {
        throw new PurchaseOrderRequestError(400, {
          error: "Quantity must be a number",
        });
      }
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
      if (valueWasProvided(raw?.unitPrice)) {
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

      // Task #369 (RF-3B): if productId was explicitly supplied (non-blank)
      // but is not a valid positive integer, reject with 400. Today the
      // helper silently drops the line, which means a typo'd productId
      // could quietly disappear from the saved PO. Genuinely blank
      // productId (undefined / null / "") still skips silently below.
      if (valueWasProvided(raw?.productId)) {
        const pidParsed =
          typeof raw!.productId === "number"
            ? raw!.productId
            : coerceFiniteNumber(raw!.productId);
        if (
          pidParsed === null ||
          !Number.isFinite(pidParsed) ||
          !Number.isInteger(pidParsed) ||
          pidParsed <= 0
        ) {
          throw new PurchaseOrderRequestError(400, {
            error: "Product ID must be a positive integer",
          });
        }
      }

      // Lines without a productId or with quantity <= 0 are silently
      // skipped — same as today's `if (productId && qty > 0)` filter.
      // After RF-3B, only fully-blank productId/quantity reach here;
      // explicitly malformed values were already rejected above.
      if (!raw?.productId || qty === null || qty <= 0) {
        continue;
      }

      const unitPrice = coerceFiniteNumber(raw?.unitPrice) ?? 0;

      const productIdNum =
        typeof raw.productId === "number"
          ? raw.productId
          : (coerceFiniteNumber(raw.productId) as number);
      // Already validated by the productId block above; this assertion
      // is defensive only.
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

  const effectiveCurrency = currency ?? "GBP";
  const grandTotal =
    effectiveCurrency === "AED" ? totalAmount : round2(totalAmount * fxRate);

  return {
    items: computed,
    totalAmountStr: totalAmount.toFixed(2),
    grandTotalStr: grandTotal.toFixed(2),
  };
}
