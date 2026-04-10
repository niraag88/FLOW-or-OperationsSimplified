export interface CurrencySettings {
  fxGbpToAed?: string | number | null;
  fxUsdToAed?: string | number | null;
  fxInrToAed?: string | number | null;
}

const SUPPORTED_CURRENCIES = ['AED', 'GBP', 'USD', 'INR'];

export function getRateToAed(currency: string | null | undefined, settings?: CurrencySettings | null): number {
  if (!currency) return 1.0;
  const c = String(currency).toUpperCase();
  if (c === 'AED') return 1.0;
  if (c === 'GBP') return parseFloat(String(settings?.fxGbpToAed ?? 4.85));
  if (c === 'USD') return parseFloat(String(settings?.fxUsdToAed ?? 3.6725));
  if (c === 'INR') return parseFloat(String(settings?.fxInrToAed ?? 0.044));
  return parseFloat(String(settings?.fxGbpToAed ?? 4.85));
}

export function convertToAed(amount: number | string | null | undefined, currency: string | null | undefined, settings?: CurrencySettings | null): number {
  const rate = getRateToAed(currency, settings);
  return parseFloat(String(amount ?? 0)) * rate;
}

export function formatCurrency(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const c = String(currency ?? 'AED').toUpperCase();
  const num = parseFloat(String(amount ?? 0)).toFixed(2);
  return `${c} ${num}`;
}

export { SUPPORTED_CURRENCIES };
