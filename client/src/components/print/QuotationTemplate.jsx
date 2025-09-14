import React from 'react';
import { format, isValid, parseISO } from 'date-fns';

export default function QuotationTemplate({ data, customer, settings }) {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
    } catch (error) {
      return '';
    }
  };

  return (
    <div className="invoice-container" style={{ maxWidth: '210mm', margin: '0 auto', padding: '20mm', background: 'white' }}>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.2cm;
          }
          body, html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: 10pt;
          }
          .invoice-container {
            width: 100%;
            margin: 0;
            padding: 0;
            box-shadow: none;
            border: none;
          }
        }
        @media screen {
          .invoice-container {
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            background: white;
          }
        }
      `}</style>

      {/* Header - Logo LEFT, Title RIGHT */}
      <header className="flex justify-between items-start mb-6">
        <div>
          {settings?.logo && (
            <img 
              src={settings.logo} 
              alt="Company Logo" 
              className="h-16 w-auto"
            />
          )}
        </div>
        <div className="text-right">
          <h1 className="text-4xl font-bold text-gray-800">QUOTATION</h1>
        </div>
      </header>

      {/* Horizontal divider line */}
      <div className="border-b-2 border-gray-800 mb-8"></div>

      {/* Company Details LEFT, Document Details RIGHT */}
      <section className="flex justify-between items-start mb-10">
        <div>
          {settings?.companyName && (
            <div>
              <h2 className="text-xl font-bold text-gray-800">{settings.companyName}</h2>
              {settings.address && (
                <p className="text-gray-600 mt-1">{settings.address}</p>
              )}
              <div className="mt-2 text-sm text-gray-600">
                {settings.phone && <p>Tel: {settings.phone}</p>}
                {settings.email && <p>Email: {settings.email}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-gray-600">
            <p>Quote Number: <span className="font-semibold">{data.quoteNumber}</span></p>
            <p>Quote Date: <span className="font-semibold">{formatDate(data.quoteDate)}</span></p>
            {data.reference && (
              <p>Reference: <span className="font-semibold">{data.reference}</span></p>
            )}
            {data.referenceDate && (
              <p>Reference Date: <span className="font-semibold">{formatDate(data.referenceDate)}</span></p>
            )}
          </div>
        </div>
      </section>

      {/* Bill To Section */}
      <section className="mb-8">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
          <div className="text-gray-700">
            <p className="font-semibold text-lg">{data.customerName || 'Unknown Customer'}</p>
            {data.customerContactPerson && <p>Contact: {data.customerContactPerson}</p>}
            {data.customerEmail && <p>Email: {data.customerEmail}</p>}
            {data.customerPhone && <p>Phone: {data.customerPhone}</p>}
            {data.customerBillingAddress && <p>{data.customerBillingAddress}</p>}
          </div>
        </div>
      </section>

      {/* Items Table */}
      <section className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Product Code</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Description</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Size</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Qty</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Unit Price ({data.currency || 'AED'})</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Line Total ({data.currency || 'AED'})</th>
            </tr>
          </thead>
          <tbody>
            {data.items && data.items.length > 0 ? (
              data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3 px-4 border-r border-gray-200 font-medium">{item.product_code || '-'}</td>
                  <td className="py-3 px-4 border-r border-gray-200">{item.description}</td>
                  <td className="text-center py-3 px-4 border-r border-gray-200">{item.size || '-'}</td>
                  <td className="text-center py-3 px-4 border-r border-gray-200">{item.quantity}</td>
                  <td className="text-right py-3 px-4 border-r border-gray-200">{(parseFloat(item.unit_price) || 0).toFixed(2)}</td>
                  <td className="text-right py-3 px-4 font-medium">{(parseFloat(item.line_total) || 0).toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="py-8 text-center text-gray-500 text-sm">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Totals - Right aligned */}
      <section className="flex justify-end mb-8">
        <div>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-8 py-1 font-semibold text-right">Subtotal</td>
                <td className="py-1 text-right">{data.currency || 'AED'} {(parseFloat(data.totalAmount) || 0).toFixed(2)}</td>
              </tr>
              {data.vatAmount && parseFloat(data.vatAmount) > 0 && (
                <tr>
                  <td className="pr-8 py-1 font-semibold text-right">VAT</td>
                  <td className="py-1 text-right">{data.currency || 'AED'} {(parseFloat(data.vatAmount) || 0).toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="pr-8 py-1 font-bold text-right">Total</td>
                <td className="py-1 text-right font-bold">{data.currency || 'AED'} {(parseFloat(data.grandTotal) || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Notes */}
      {data.remarks && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.remarks}</p>
        </section>
      )}

      {/* Terms & Conditions */}
      {data.terms && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Terms & Conditions</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.terms}</p>
        </section>
      )}

      {/* Signature Section */}
      <section className="mt-16 pt-8 border-t border-gray-300">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-6"></div>
            <p className="text-sm font-medium">For {settings?.companyName || 'Supernature'}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-6"></div>
            <p className="text-sm font-medium">For Customer</p>
          </div>
        </div>
      </section>
    </div>
  );
}