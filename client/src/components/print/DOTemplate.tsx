import React from 'react';
import { format, isValid, parseISO } from 'date-fns';

export default function DOTemplate({ data, customer, settings }: any) {
  const formatDate = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '';
    } catch (error: any) {
      return '';
    }
  };

  const showTax = data.tax_amount && data.tax_amount > 0;

  return (
    <div className="p-8 font-sans invoice-container">
      <style>{`
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
            height: 100%;
            margin: 0;
            padding: 0;
            box-shadow: none;
            border: none;
            display: flex;
            flex-direction: column;
          }
          header, section {
            margin-bottom: 1.5rem !important;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          .signature-section {
            margin-top: auto;
          }
        }
      `}</style>
    
      {/* Header */}
      <header className="flex justify-between items-start mb-10 border-b pb-6">
        <div>
          <h1 className="text-4xl font-bold text-gray-800">DELIVERY ORDER</h1>
          <div className="mt-2 text-gray-600">
            <p>DO Number: <span className="font-semibold">{data.do_number}</span></p>
            <p>Order Date: <span className="font-semibold">{formatDate(data.order_date)}</span></p>
          </div>
        </div>
        <div className="text-right">
          {(settings?.logo || settings?.company_logo_url) && (
            <img 
              src={settings.logo || settings.company_logo_url} 
              alt="Company Logo" 
              className="h-16 w-auto mb-4 ml-auto"
            />
          )}
          {(settings?.companyName || settings?.company_name) && (
            <div>
              <h2 className="text-xl font-bold text-gray-800">{settings.companyName || settings.company_name}</h2>
              {(settings.address || settings.company_address) && (
                <p className="text-gray-600 mt-1">{settings.address || settings.company_address}</p>
              )}
              <div className="mt-2 text-sm text-gray-600">
                {(settings.phone || settings.company_phone) && <p>Tel: {settings.phone || settings.company_phone}</p>}
                {(settings.email || settings.company_email) && <p>Email: {settings.email || settings.company_email}</p>}
                {(settings.taxNumber || settings.vatNumber || settings.company_trn) && <p>TRN: {settings.taxNumber || settings.vatNumber || settings.company_trn}</p>}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Customer and DO Details */}
      <section className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Deliver To</h3>
          <div className="text-gray-700">
            <p className="font-semibold text-lg">{customer?.name || customer?.customer_name || 'Unknown Customer'}</p>
            {(customer?.contactPerson || customer?.contact_name) && <p>Contact: {customer.contactPerson || customer.contact_name}</p>}
            {customer?.address && <p className="mt-1">{customer.address}</p>}
            {customer?.type && <p className="text-sm text-gray-600 mt-1">Type: {customer.type}</p>}
            {customer?.trn_number && <p className="text-sm text-gray-600">TRN: {customer.trn_number}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-700">
            {data.reference && (
              <p className="text-gray-500">Reference: <span className="font-semibold text-gray-700">{data.reference}</span></p>
            )}
            {data.reference_date && (
              <p className="text-gray-500">Reference Date: <span className="font-semibold text-gray-700">{formatDate(data.reference_date)}</span></p>
            )}
            <p className="text-gray-500">Currency: <span className="font-semibold text-gray-700">{data.currency}</span></p>
          </div>
        </div>
      </section>

      {/* Items Table */}
      <section className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Product Code</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Brand</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Description</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Qty</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700 border-r border-gray-200">Unit Price</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items && data.items.length > 0 ? (
              data.items.map((item: any, index: any) => (
                <tr key={index} className="border-b border-gray-200">
                  <td className="py-3 px-4 border-r border-gray-200 font-medium">{item.product_code || '-'}</td>
                  <td className="py-3 px-4 border-r border-gray-200">{item.brand_name || '-'}</td>
                  <td className="py-3 px-4 border-r border-gray-200">
                    <div>{item.description}</div>
                    {item.size && <div className="text-xs text-gray-400 mt-0.5">{item.size}</div>}
                  </td>
                  <td className="text-center py-3 px-4 border-r border-gray-200">{item.quantity}</td>
                  <td className="text-right py-3 px-4 border-r border-gray-200">{(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right py-3 px-4 font-medium">{(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="flex justify-end mb-8">
        <div className="w-full md:w-1/3">
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Subtotal:</span>
            <span className="font-semibold">{data.currency} {(data.subtotal || 0).toFixed(2)}</span>
          </div>
          {showTax && (
            <div className="flex justify-between py-2">
              <span className="text-gray-600">VAT ({(data.tax_rate * 100).toFixed(1)}%):</span>
              <span className="font-semibold">{data.currency} {(data.tax_amount || 0).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 text-xl font-bold border-t-2 border-gray-400 mt-2">
            <span>Total:</span>
            <span className="text-amber-600">{data.currency} {(data.total_amount || 0).toFixed(2)}</span>
          </div>
        </div>
      </section>

      {/* Payment Terms */}
      {data.terms && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Payment Terms</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.terms}</p>
        </section>
      )}

      {/* Remarks */}
      {data.remarks && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Remarks</h3>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{data.remarks}</p>
        </section>
      )}

      {/* Signature Section */}
      <section className="signature-section mt-auto pt-8 border-t">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-6"></div>
            <p className="text-sm font-medium">For {settings?.companyName || settings?.company_name || 'Company'}</p>
          </div>
          <div className="text-center">
            <div className="border-b border-gray-400 mb-2 pb-6"></div>
            <p className="text-sm font-medium">Received by Customer</p>
          </div>
        </div>
        
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Goods received in good order and condition.</p>
        </div>
      </section>
    </div>
  );
}