import React from 'react';
import { format, isValid, parseISO } from 'date-fns';

export default function POTemplate({ data, brand, settings }) {
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
      `}</style>

      {/* Header */}
      <header className="flex justify-between items-start mb-10 border-b pb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">PURCHASE ORDER</h1>
          <div className="mt-2 text-gray-600">
            <p>PO Number: <span className="font-semibold">{data.po_number}</span></p>
            <p>Order Date: <span className="font-semibold">{formatDate(data.order_date)}</span></p>
          </div>
        </div>
        <div className="text-right">
          {settings?.company_logo_url && (
            <img 
              src={settings.company_logo_url} 
              alt="Company Logo" 
              className="h-16 w-auto mb-4 ml-auto"
            />
          )}
          {settings?.company_name && (
            <div>
              <h2 className="text-xl font-bold text-gray-800">{settings.company_name}</h2>
              {settings.company_address && (
                <p className="text-gray-600 mt-1">{settings.company_address}</p>
              )}
              <div className="mt-2 text-sm text-gray-600">
                {settings.company_phone && <p>Tel: {settings.company_phone}</p>}
                {settings.company_email && <p>Email: {settings.company_email}</p>}
                {settings.company_trn && <p>TRN: {settings.company_trn}</p>}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Supplier/Brand and PO Details */}
      <section className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Supplier/Brand</h3>
          <div className="text-gray-700">
            <p className="font-semibold text-lg">{brand?.name || 'Unknown Brand'}</p>
            {brand?.contact_person && <p>Contact: {brand.contact_person}</p>}
            {brand?.contact_email && <p>Email: {brand.contact_email}</p>}
            {brand?.contact_phone && <p>Phone: {brand.contact_phone}</p>}
            {brand?.website && <p>Website: {brand.website}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-700">
            {data.expected_delivery_date && (
              <p className="text-gray-500">Expected Delivery: <span className="font-semibold text-gray-700">{formatDate(data.expected_delivery_date)}</span></p>
            )}
            <p className="text-gray-500">Currency: <span className="font-semibold text-gray-700">{data.currency}</span></p>
            <p className="text-gray-500">Status: <span className="font-semibold text-gray-700 capitalize">{data.status}</span></p>
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
              <th className="text-right py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Unit Price ({data.currency})</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Line Total ({data.currency})</th>
            </tr>
          </thead>
          <tbody>
            {data.items && data.items.length > 0 ? (
              data.items.map((item, index) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3 px-4 border-r border-gray-200 font-medium">{item.product_code || '-'}</td>
                  <td className="py-3 px-4 border-r border-gray-200">{item.description}</td>
                  <td className="text-center py-3 px-4 border-r border-gray-200">{item.quantity}</td>
                  <td className="text-right py-3 px-4 border-r border-gray-200">{(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right py-3 px-4 font-medium">{(item.line_total || 0).toFixed(2)}</td>
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

      {/* Totals - Removed AED conversion */}
      <section className="flex justify-end mb-8">
        <div className="w-full md:w-1/2">
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-semibold">{(data.subtotal || 0).toFixed(2)} {data.currency}</span>
          </div>
          {data.tax_amount && data.tax_amount > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-gray-600">Tax:</span>
              <span className="font-semibold">{(data.tax_amount || 0).toFixed(2)} {data.currency}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-t-2 border-gray-300 mt-2">
            <span className="font-bold text-lg">Total:</span>
            <span className="font-bold text-lg">{(data.total_amount || 0).toFixed(2)} {data.currency}</span>
          </div>
        </div>
      </section>

      {/* Notes */}
      {data.notes && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Notes</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.notes}</p>
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
            <p className="text-sm font-medium">For {settings?.company_name || 'Supernature'}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-6"></div>
            <p className="text-sm font-medium">For {brand?.name || 'Supplier'}</p>
          </div>
        </div>
      </section>
    </div>
  );
}