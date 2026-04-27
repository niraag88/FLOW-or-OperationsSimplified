export type RawLineItem = {
  product_id?: number | string | null;
  brand_id?: number | string | null;
  product_code?: string | null;
  description?: string | null;
  product_name?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  [k: string]: unknown;
};

export type ResolvedLineItem = RawLineItem & {
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type ResolvedTotals = {
  items: ResolvedLineItem[];
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  taxTreatment: 'StandardRated' | 'ZeroRated';
};

export class InvalidLineItemError extends Error {
  readonly status = 400 as const;
  readonly code = 'invalid_line_item' as const;
  constructor(message: string, public readonly index: number) {
    super(message);
  }
}

export class NoLineItemsError extends Error {
  readonly status = 400 as const;
  readonly code = 'no_line_items' as const;
  constructor(message = 'At least one valid line item is required') {
    super(message);
  }
}

export function isTotalsError(err: unknown): err is InvalidLineItemError | NoLineItemsError {
  return err instanceof InvalidLineItemError || err instanceof NoLineItemsError;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const STANDARD_TREATMENTS = new Set(['standardrated', 'standard', 'local']);

// Conservative default: anything we don't explicitly recognise as
// standard-rated (including missing/non-string values) resolves to
// zero-rated. This avoids silently charging 5% VAT on documents whose
// tax treatment we can't confirm.
export function normalizeTaxTreatment(raw: unknown): 'StandardRated' | 'ZeroRated' {
  if (typeof raw !== 'string') return 'ZeroRated';
  const lower = raw.trim().toLowerCase();
  if (STANDARD_TREATMENTS.has(lower)) return 'StandardRated';
  return 'ZeroRated';
}

export function resolveDocumentTotals(input: {
  items: unknown;
  taxTreatment: unknown;
  defaultVatRate: number;
}): ResolvedTotals {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new NoLineItemsError();
  }

  const treatment = normalizeTaxTreatment(input.taxTreatment);
  const rate = Number.isFinite(input.defaultVatRate) && input.defaultVatRate > 0
    ? input.defaultVatRate
    : 0.05;
  const vatRate = treatment === 'StandardRated' ? rate : 0;

  const resolvedItems: ResolvedLineItem[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const raw = (input.items[i] ?? {}) as RawLineItem;
    const qtyN = Number(raw.quantity);
    const priceN = Number(raw.unit_price);
    if (!Number.isFinite(qtyN) || qtyN <= 0) {
      throw new InvalidLineItemError(
        `Line ${i + 1}: quantity must be a positive number`,
        i,
      );
    }
    if (!Number.isFinite(priceN) || priceN < 0) {
      throw new InvalidLineItemError(
        `Line ${i + 1}: unit_price must be zero or positive`,
        i,
      );
    }
    const lineTotal = round2(qtyN * priceN);
    resolvedItems.push({
      ...raw,
      quantity: qtyN,
      unit_price: priceN,
      line_total: lineTotal,
    });
  }

  const subtotal = round2(resolvedItems.reduce((s, it) => s + it.line_total, 0));
  const vatAmount = round2(subtotal * vatRate);
  const totalAmount = round2(subtotal + vatAmount);

  return {
    items: resolvedItems,
    subtotal,
    vatRate,
    vatAmount,
    totalAmount,
    taxTreatment: treatment,
  };
}

// Mirror normalizeTaxTreatment so customers stored as 'standard'/'Local'/
// 'StandardRated' resolve to standard-rated and anything else (including
// 'exempt', 'reverse_charge', 'International', null, or unknown values)
// resolves to zero-rated. Conservative on missing data — never silently
// adds 5% VAT.
export function inferTaxTreatmentFromCustomer(
  customerVatTreatment: string | null | undefined,
): 'StandardRated' | 'ZeroRated' {
  return normalizeTaxTreatment(customerVatTreatment);
}

// Customer is authoritative for VAT compliance: if the customer record
// has an explicit VAT category that resolves to ZeroRated (e.g.
// 'exempt', 'reverse_charge', 'International', 'ZeroRated'), the
// document MUST be ZeroRated regardless of the client-supplied
// tax_treatment. This protects against a crafted request charging VAT
// to a customer who is exempt/zero-rated by status.
//
// When the customer record has no explicit treatment (or no customer
// is attached), the function falls back through:
//   body > existing > inferred-from-customer (still ZeroRated by
//   default for unknown values).
export function resolveAuthoritativeTaxTreatment(
  bodyTreatment: unknown,
  existingTreatment: string | null | undefined,
  customerVatTreatment: string | null | undefined,
): 'StandardRated' | 'ZeroRated' {
  const customerHasExplicit =
    typeof customerVatTreatment === 'string' && customerVatTreatment.trim() !== '';
  if (customerHasExplicit) {
    const customerInferred = normalizeTaxTreatment(customerVatTreatment);
    if (customerInferred === 'ZeroRated') return 'ZeroRated';
  }

  if (bodyTreatment !== undefined && bodyTreatment !== null) {
    return normalizeTaxTreatment(bodyTreatment);
  }
  if (existingTreatment !== undefined && existingTreatment !== null) {
    return normalizeTaxTreatment(existingTreatment);
  }
  return normalizeTaxTreatment(customerVatTreatment);
}
