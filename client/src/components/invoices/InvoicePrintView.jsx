import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import "../../styles/print.css";
import { format } from 'date-fns';

export default function InvoicePrintView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      navigate('/Invoices');
      return;
    }

    const loadData = async () => {
      try {
        // Load invoice data and company settings (same pattern as QuotationPrintView)
        const [invoiceResponse, companyResponse] = await Promise.all([
          fetch(`/api/export/invoice?invoiceId=${id}`),
          fetch('/api/company-settings')
        ]);
        
        const invoiceResult = await invoiceResponse.json();
        const companyResult = await companyResponse.json();
        
        if (invoiceResult.success) {
          setInvoice(invoiceResult.data);
          setCompanySettings(companyResult);
        } else {
          console.error('Error loading invoice:', invoiceResult.error);
          navigate('/Invoices');
        }
        
      } catch (error) {
        console.error('Error loading data:', error);
        navigate('/Invoices');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, navigate]);

  // Remove auto-print behavior to match quotations - let user choose when to print

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? '' : format(date, 'dd/MM/yy');
    } catch { return ''; }
  };

  const formatCurrency = (amount, currency = 'AED') => {
    const num = parseFloat(amount) || 0;
    return `${currency} ${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="print-loading">
        <p>Loading Invoice...</p>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="print-error">
        <p>Invoice not found</p>
      </div>
    );
  }

  const showTax = invoice.tax_amount && parseFloat(invoice.tax_amount) > 0;

  return (
    <div className="print-container">
      <div className="print-page">
        {/* Header with Logo and Title - EXACT COPY from QuotationPrintView */}
        <div className="print-header">
          <div className="header-content">
            {companySettings?.logo && (
              <div className="header-logo">
                <img src={companySettings.logo} alt="Company Logo" />
              </div>
            )}
            <h1 className="print-title">TAX INVOICE</h1>
          </div>
        </div>

        {/* Company and Invoice Info Section - EXACT COPY from QuotationPrintView */}
        <div className="print-info-section">
          {/* Left Column - Company Info */}
          <div className="print-company-info">
            <div className="company-name">{companySettings?.companyName}</div>
            {companySettings?.address && (
              <div className="company-address">{companySettings.address}</div>
            )}
            {companySettings?.phone && (
              <div className="company-contact">Tel: {companySettings.phone}</div>
            )}
            {companySettings?.email && (
              <div className="company-contact">Email: {companySettings.email}</div>
            )}
            {companySettings?.taxNumber && (
              <div className="company-contact">TRN: {companySettings.taxNumber}</div>
            )}
          </div>

          {/* Right Column - Invoice Info */}
          <div className="print-po-info">
            <div className="po-info-row">
              <span className="po-label">Invoice Number</span>
              <span className="po-value">{invoice.invoice_number}</span>
            </div>
            <div className="po-info-row">
              <span className="po-label">Invoice Date</span>
              <span className="po-value">{formatDate(invoice.invoice_date)}</span>
            </div>
          </div>
        </div>

        {/* Customer Section - EXACT COPY from QuotationPrintView */}
        <div className="print-info-section">
          {/* Left Column - Customer Info */}
          <div className="print-company-info">
            <div className="company-name">BILL TO</div>
            <div className="company-name">{invoice.customer?.name || 'Unknown Customer'}</div>
            {invoice.customer?.address && (
              <div className="company-address">{invoice.customer.address}</div>
            )}
            {invoice.customer?.contact_name && (
              <div className="company-contact">Contact: {invoice.customer.contact_name}</div>
            )}
            {invoice.customer?.email && (
              <div className="company-contact">Email: {invoice.customer.email}</div>
            )}
            {invoice.customer?.phone && (
              <div className="company-contact">Tel: {invoice.customer.phone}</div>
            )}
            {invoice.customer?.trn_number && (
              <div className="company-contact">TRN: {invoice.customer.trn_number}</div>
            )}
          </div>

          {/* Right Column - Invoice Meta Info */}
          <div className="print-po-info">
            {invoice.reference && (
              <div className="po-info-row">
                <span className="po-label">Reference</span>
                <span className="po-value">{invoice.reference}</span>
              </div>
            )}
            {invoice.reference_date && (
              <div className="po-info-row">
                <span className="po-label">Reference Date</span>
                <span className="po-value">{formatDate(invoice.reference_date)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items Table - EXACT COPY from QuotationPrintView */}
        <div className="print-table-section">
          <table className="print-table">
            <thead>
              <tr>
                <th className="col-code">Product Code</th>
                <th className="col-description">Description</th>
                <th className="col-size">Size</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">Unit Price (AED)</th>
                <th className="col-total">Line Total (AED)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.map((item, index) => (
                <tr key={index}>
                  <td className="text-center">{item.product_code || '-'}</td>
                  <td>{item.description}</td>
                  <td className="text-center">{item.size || '-'}</td>
                  <td className="text-center">{item.quantity}</td>
                  <td className="text-right">{parseFloat(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right">{parseFloat(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section - EXACT COPY from QuotationPrintView */}
        <div className="print-totals-section">
          <div className="totals-row">
            <span className="totals-label">Subtotal</span>
            <span className="totals-value">{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div className="totals-row">
            <span className="totals-label">VAT ({invoice.vat_rate || 0}%)</span>
            <span className="totals-value">{formatCurrency(invoice.tax_amount)}</span>
          </div>
          <div className="totals-row total-final">
            <span className="totals-label">Total</span>
            <span className="totals-value">{formatCurrency(invoice.total_amount)}</span>
          </div>
        </div>

        {/* Notes Section */}
        {invoice.remarks && (
          <div className="print-remarks-section">
            <div className="supplier-title">REMARKS</div>
            <div style={{fontSize: '11px', color: '#333', marginTop: '5px'}}>
              {invoice.remarks}
            </div>
          </div>
        )}

        {/* Payment Confirmation Section */}
        {invoice.paymentStatus === 'paid' && (
          <div className="print-remarks-section" style={{marginTop: '16px', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
              <span style={{fontSize: '11px', fontWeight: '700', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Payment Received</span>
              <span style={{display: 'inline-block', padding: '1px 8px', background: '#16a34a', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: '600'}}>PAID</span>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#166534'}}>
              {invoice.paymentReceivedDate && (
                <div>
                  <span style={{fontWeight: '600'}}>Payment Date: </span>
                  <span>{formatDate(invoice.paymentReceivedDate)}</span>
                </div>
              )}
              {invoice.paymentRemarks && (
                <div>
                  <span style={{fontWeight: '600'}}>Remarks: </span>
                  <span>{invoice.paymentRemarks}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="print-footer">
          <div className="page-number">Page 1/1</div>
        </div>
      </div>
    </div>
  );
}