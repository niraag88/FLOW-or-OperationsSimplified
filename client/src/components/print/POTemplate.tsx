import React from 'react';
import { format, isValid, parseISO } from 'date-fns';
import PrintPage from './shared/PrintPage';
import PrintHeader from './shared/PrintHeader';
import PrintTable from './shared/PrintTable';
import TotalsSummary from './shared/TotalsSummary';
import NotesSection from './shared/NotesSection';
import SignatureSection from './shared/SignatureSection';

interface POTemplateProps {
  data: Record<string, any>;
  brand: Record<string, any>;
  settings: Record<string, any>;
}
export default function POTemplate({ data, brand, settings }: POTemplateProps) {
  const formatDate = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yy') : '';
    } catch (error: any) {
      return '';
    }
  };

  const headers = [
    { label: 'Product Code', align: 'left' },
    { label: 'Description', align: 'left' },
    { label: 'Size', align: 'center' },
    { label: 'Qty', align: 'center' },
    { label: `Unit Price (${data.currency})`, align: 'right' },
    { label: `Line Total (${data.currency})`, align: 'right' }
  ];

  return (
    <PrintPage className="p-8">
      <PrintHeader
        documentTitle="PURCHASE ORDER"
        documentNumber={data.po_number}
        documentDate={formatDate(data.order_date)}
        logoUrl={settings?.logo}
        companyName={settings?.companyName}
        companyAddress={settings?.address}
        companyPhone={settings?.phone}
        companyEmail={settings?.email}
        companyTrn={settings?.taxNumber}
      />

      {/* Brand and PO Details */}
      <section className="grid grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">Brand</h3>
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

      <PrintTable
        headers={headers}
        items={data.items}
        currency={data.currency}
        showSize={true}
        colSpan={6}
      />

      <TotalsSummary
        subtotal={data.subtotal}
        taxAmount={data.tax_amount}
        totalAmount={data.total_amount}
        currency={data.currency}
        showTax={data.tax_amount && data.tax_amount > 0}
        taxLabel="Tax"
      />

      <NotesSection title="Notes" content={data.notes} />
      <NotesSection title="Terms & Conditions" content={data.terms_conditions} />

      <SignatureSection
        leftSignatureLabel={`For ${settings?.company_name || ''}`}
        rightSignatureLabel={`For ${brand?.name || 'Brand'}`}
      />
    </PrintPage>
  );
}