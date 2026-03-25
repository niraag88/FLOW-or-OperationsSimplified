import React from 'react';
import { format, isValid, parseISO } from 'date-fns';
import PrintPage from './shared/PrintPage';
import PrintHeader from './shared/PrintHeader';
import PrintTable from './shared/PrintTable';
import TotalsSummary from './shared/TotalsSummary';
import NotesSection from './shared/NotesSection';
import SignatureSection from './shared/SignatureSection';

export default function QuotationTemplate({ data, customer, settings }) {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '';
    } catch (error) {
      return '';
    }
  };

  const showTax = data.vatAmount && data.vatAmount > 0;
  
  const headers = [
    { label: 'Product Code', align: 'left' },
    { label: 'Description', align: 'left' },
    { label: 'Size', align: 'center' },
    { label: 'Qty', align: 'center' },
    { label: `Unit Price (${data.currency || 'AED'})`, align: 'right' },
    { label: `Line Total (${data.currency || 'AED'})`, align: 'right' }
  ];

  return (
    <PrintPage className="p-8">
      <PrintHeader
        documentTitle="QUOTATION"
        documentNumber={data.quoteNumber}
        documentDate={formatDate(data.quoteDate)}
        logoUrl={settings?.logo}
        companyName={settings?.companyName}
        companyAddress={settings?.address}
        companyPhone={settings?.phone}
        companyEmail={settings?.email}
        companyTrn={settings?.trn}
      />

      {/* Customer and Quote Details */}
      <section className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Bill To</h3>
          <div className="text-gray-700">
            <p className="font-semibold text-lg">{data.customerName || 'Unknown Customer'}</p>
            {data.customerContactPerson && <p>Contact: {data.customerContactPerson}</p>}
            {data.customerBillingAddress && <p className="mt-1">{data.customerBillingAddress}</p>}
            {data.customerPhone && <p>Tel: {data.customerPhone}</p>}
            {data.customerEmail && <p>Email: {data.customerEmail}</p>}
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
            <p className="text-gray-500">Currency: <span className="font-semibold text-gray-700">{data.currency || 'AED'}</span></p>
          </div>
        </div>
      </section>

      <PrintTable
        headers={headers}
        items={data.items}
        currency={data.currency || 'AED'}
        showSize={true}
        colSpan={6}
      />

      <TotalsSummary
        subtotal={data.totalAmount}
        taxAmount={data.vatAmount}
        totalAmount={data.grandTotal}
        currency={data.currency || 'AED'}
        showTax={showTax}
        taxLabel="VAT"
      />

      <NotesSection title="Remarks" content={data.remarks} />

      <SignatureSection
        leftSignatureLabel={`For ${settings?.companyName || 'Supernature'}`}
        rightSignatureLabel="For Customer"
      />
    </PrintPage>
  );
}