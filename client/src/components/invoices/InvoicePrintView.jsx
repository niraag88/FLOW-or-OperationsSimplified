import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { Invoice, CompanySettings } from '@/api/entities';

export default function InvoicePrintView() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [invoiceData, companyData] = await Promise.all([
          Invoice.getById(id),
          CompanySettings.get()
        ]);
        setInvoice(invoiceData);
        setCompanySettings(companyData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadData();
    }
  }, [id]);

  useEffect(() => {
    if (!loading && invoice && companySettings) {
      // Auto-trigger print dialog
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, invoice, companySettings]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!invoice || !companySettings) {
    return <div className="p-8">Error loading invoice data</div>;
  }

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const formatCurrency = (amount, currency = 'GBP') => {
    return `${currency} ${parseFloat(amount || 0).toFixed(2)}`;
  };

  return (
    <div className="print-container">
      <div className="print-page">
        {/* Header with Logo and Title */}
        <div className="print-header">
          <div className="print-logo-container">
            {companySettings.logo && (
              <img 
                src={companySettings.logo} 
                alt="Company Logo" 
                className="print-logo"
              />
            )}
          </div>
          <div className="print-title">TAX INVOICE</div>
        </div>

        {/* Company and Invoice Info Section */}
        <div className="print-info-section">
          <div className="print-supplier-info">
            <div className="print-section-title">From:</div>
            <div className="print-company-details">
              <div className="print-company-name">{companySettings.companyName}</div>
              {companySettings.address && <div>{companySettings.address}</div>}
              {companySettings.email && <div>Email: {companySettings.email}</div>}
              {companySettings.phone && <div>Phone: {companySettings.phone}</div>}
            </div>
          </div>
          
          <div className="print-document-info">
            <div className="print-section-title">Invoice Details:</div>
            <div className="print-details-grid">
              <div><span className="print-label">Invoice Number:</span> {invoice.invoice_number}</div>
              <div><span className="print-label">Date:</span> {formatDate(invoice.invoice_date)}</div>
              <div><span className="print-label">Customer:</span> {invoice.customer_name}</div>
              {invoice.reference && <div><span className="print-label">Reference:</span> {invoice.reference}</div>}
              {invoice.reference_date && <div><span className="print-label">Reference Date:</span> {formatDate(invoice.reference_date)}</div>}
              <div><span className="print-label">Status:</span> {invoice.status?.toUpperCase()}</div>
              {invoice.payment_date && <div><span className="print-label">Payment Date:</span> {formatDate(invoice.payment_date)}</div>}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="print-table-container">
          <table className="print-table">
            <thead>
              <tr>
                <th className="col-code">Product Code</th>
                <th className="col-description">Description</th>
                <th className="col-size">Size</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">Unit Price (GBP)</th>
                <th className="col-total">Line Total (GBP)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, index) => (
                <tr key={index}>
                  <td className="col-code">{item.product_code}</td>
                  <td className="col-description">{item.description}</td>
                  <td className="col-size">{item.size || '-'}</td>
                  <td className="col-qty">{item.quantity}</td>
                  <td className="col-price">{parseFloat(item.unit_price || 0).toFixed(2)}</td>
                  <td className="col-total">{parseFloat(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="print-totals">
          <div className="print-totals-content">
            <div className="print-total-row">
              <span className="print-total-label">Subtotal:</span>
              <span className="print-total-value">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.tax_treatment === 'StandardRated' && invoice.tax_amount > 0 && (
              <div className="print-total-row">
                <span className="print-total-label">VAT ({(invoice.tax_rate * 100).toFixed(0)}%):</span>
                <span className="print-total-value">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
              </div>
            )}
            <div className="print-total-row print-final-total">
              <span className="print-total-label">Total:</span>
              <span className="print-total-value">{formatCurrency(invoice.total_amount, invoice.currency)}</span>
            </div>
            {invoice.paid_amount > 0 && (
              <>
                <div className="print-total-row">
                  <span className="print-total-label">Paid Amount:</span>
                  <span className="print-total-value">{formatCurrency(invoice.paid_amount, invoice.currency)}</span>
                </div>
                <div className="print-total-row print-outstanding">
                  <span className="print-total-label">Outstanding:</span>
                  <span className="print-total-value">{formatCurrency((invoice.total_amount || 0) - (invoice.paid_amount || 0), invoice.currency)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment Information */}
        {invoice.payment_reference && (
          <div className="print-payment-info">
            <div className="print-section-title">Payment Information:</div>
            <div className="print-payment-details">
              {invoice.payment_reference && <div><span className="print-label">Payment Reference:</span> {invoice.payment_reference}</div>}
              {invoice.payment_date && <div><span className="print-label">Payment Date:</span> {formatDate(invoice.payment_date)}</div>}
            </div>
          </div>
        )}

        {/* Remarks */}
        {invoice.remarks && (
          <div className="print-remarks">
            <div className="print-section-title">Remarks:</div>
            <div className="print-remarks-content">{invoice.remarks}</div>
          </div>
        )}
      </div>
    </div>
  );
}