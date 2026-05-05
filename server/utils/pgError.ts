export type PgErrorMeta = { code?: string; constraint?: string };

export function extractPgErrorMeta(err: unknown): PgErrorMeta {
  let cur: unknown = err;
  for (let i = 0; i < 8 && cur && typeof cur === 'object'; i++) {
    const e = cur as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof e.code === 'string') {
      return {
        code: e.code,
        constraint: typeof e.constraint === 'string' ? e.constraint : undefined,
      };
    }
    cur = e.cause;
  }
  return {};
}

export function isProductsStockNonNegativeViolation(err: unknown): boolean {
  const meta = extractPgErrorMeta(err);
  return meta.code === '23514' && meta.constraint === 'products_stock_quantity_non_negative_chk';
}

export function isUniqueViolation(err: unknown, constraintMatch?: (c: string) => boolean): boolean {
  const meta = extractPgErrorMeta(err);
  if (meta.code !== '23505') return false;
  if (!constraintMatch) return true;
  return typeof meta.constraint === 'string' && constraintMatch(meta.constraint);
}
