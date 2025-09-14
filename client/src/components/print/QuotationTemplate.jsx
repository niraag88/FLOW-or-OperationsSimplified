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
    <div className="p-8 font-sans">

      {/* Header */}
      <header className="flex justify-between items-start mb-10 border-b pb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">QUOTATION</h1>
          <div className="mt-2 text-gray-600">
            <p>Quotation Number: <span className="font-semibold">{data.quoteNumber}</span></p>
            <p>Quotation Date: <span className="font-semibold">{formatDate(data.quoteDate)}</span></p>
          </div>
        </div>
        <div className="text-right">
          {settings?.logo && (
            <img 
              src={settings.logo} 
              alt="Company Logo" 
              className="h-16 w-auto mb-4 ml-auto"
            />
          )}
          {settings?.companyName && (
            <div>
              <h2 className="text-xl font-bold text-gray-800">{settings.companyName}</h2>
              {settings.address && (
                <p className="text-gray-600 mt-1">{settings.address}</p>
              )}
              <div className="mt-2 text-sm text-gray-600">
                {settings.phone && <p>Tel: {settings.phone}</p>}
                {settings.email && <p>Email: {settings.email}</p>}
                {settings.trn && <p>TRN: {settings.trn}</p>}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Customer and Quotation Details */}
      <section className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
          <div className="text-gray-700">
            <p className="font-semibold text-lg">{data.customerName || 'Unknown Customer'}</p>
            {data.customerContactPerson && <p>Contact: {data.customerContactPerson}</p>}
            {data.customerEmail && <p>Email: {data.customerEmail}</p>}
            {data.customerPhone && <p>Phone: {data.customerPhone}</p>}
            {data.customerBillingAddress && <p className="mt-1">{data.customerBillingAddress}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-700">
            {data.reference && (
              <p className="text-gray-500">Reference: <span className="font-semibold text-gray-700">{data.reference}</span></p>
            )}
            {data.referenceDate && (
              <p className="text-gray-500">Reference Date: <span className="font-semibold text-gray-700">{formatDate(data.referenceDate)}</span></p>
            )}
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
              <th className="text-center py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Qty</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Unit Price (AED)</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Line Total (AED)</th>
            </tr>
          </thead>
          <tbody>
            {data.items && data.items.length > 0 ? (
              data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3 px-4 border-r border-gray-200 font-medium">{item.product_code || '-'}</td>
                  <td className="py-3 px-4 border-r border-gray-200">{item.description}</td>
                  <td className="text-center py-3 px-4 border-r border-gray-200">{item.quantity}</td>
                  <td className="text-right py-3 px-4 border-r border-gray-200">{parseFloat(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right py-3 px-4 font-medium">{parseFloat(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="py-8 text-center text-gray-500">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="flex justify-end mb-8">
        <div className="w-full md:w-1/2">
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-semibold">{parseFloat(data.totalAmount || 0).toFixed(2)} AED</span>
          </div>
          {data.vatAmount && parseFloat(data.vatAmount) > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-gray-600">VAT:</span>
              <span className="font-semibold">{parseFloat(data.vatAmount || 0).toFixed(2)} AED</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-t-2 border-gray-300 mt-2">
            <span className="font-bold text-lg">Total:</span>
            <span className="font-bold text-lg">{parseFloat(data.grandTotal || 0).toFixed(2)} AED</span>
          </div>
        </div>
      </section>

      {/* Remarks */}
      {data.remarks && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Remarks</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.remarks}</p>
        </section>
      )}

      {/* Terms & Conditions */}
      {data.terms_conditions && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Terms & Conditions</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.terms_conditions}</p>
        </section>
      )}

      {/* Signature Section */}
      <section className="mt-auto pt-8 border-t">
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