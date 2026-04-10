interface TotalsSummaryProps {
  subtotal: string | number;
  taxAmount?: string | number;
  totalAmount: string | number;
  currency?: string;
  showTax?: boolean;
  taxLabel?: string;
}
export default function TotalsSummary({
  subtotal,
  taxAmount,
  totalAmount,
  currency = 'AED',
  showTax = false,
  taxLabel = 'Tax'
}: TotalsSummaryProps) {
  return (
    <section className="flex justify-end mb-8">
      <div className="w-full md:w-1/2">
        <div className="flex justify-between py-2">
          <span className="text-gray-600">Subtotal:</span>
          <span className="font-semibold">{currency} {(parseFloat(String(subtotal)) || 0).toFixed(2)}</span>
        </div>
        {showTax && taxAmount !== undefined && parseFloat(String(taxAmount)) > 0 && (
          <div className="flex justify-between py-2">
            <span className="text-gray-600">{taxLabel}:</span>
            <span className="font-semibold">{currency} {(parseFloat(String(taxAmount)) || 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between py-2 border-t-2 border-gray-300 mt-2">
          <span className="font-bold text-lg">Total:</span>
          <span className="font-bold text-lg">{currency} {(parseFloat(String(totalAmount)) || 0).toFixed(2)}</span>
        </div>
      </div>
    </section>
  );
}
