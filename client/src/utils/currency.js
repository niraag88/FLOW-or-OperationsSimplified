const SUPPORTED_CURRENCIES = ['AED', 'GBP', 'USD', 'INR'];

export function getRateToAed(currency, settings) {
  if (!currency || currency === 'AED') return 1.0;
  const c = String(currency).toUpperCase();
  if (c === 'GBP') return parseFloat(settings?.fxGbpToAed ?? 4.85);
  if (c === 'USD') return parseFloat(settings?.fxUsdToAed ?? 3.6725);
  if (c === 'INR') return parseFloat(settings?.fxInrToAed ?? 0.044);
  return parseFloat(settings?.fxGbpToAed ?? 4.85);
}

export function convertToAed(amount, currency, settings) {
  const rate = getRateToAed(currency, settings);
  return parseFloat(amount ?? 0) * rate;
}

export function formatCurrency(amount, currency) {
  const c = String(currency ?? 'AED').toUpperCase();
  const num = parseFloat(amount ?? 0).toFixed(2);
  return `${c} ${num}`;
}

export { SUPPORTED_CURRENCIES };
