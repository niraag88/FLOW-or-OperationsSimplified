import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import "../../styles/print.css";

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
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
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
        {/* Header with Logo and Title */}
        <div className="print-header">
          <div className="print-logo-container">
            {companySettings?.logo && (
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
              <div className="print-company-name">{companySettings?.companyName}</div>
              {companySettings?.address && <div>{companySettings.address}</div>}
              {companySettings?.phone && <div>Tel: {companySettings.phone}</div>}
              {companySettings?.email && <div>Email: {companySettings.email}</div>}
              {companySettings?.taxNumber && <div>TRN: {companySettings.taxNumber}</div>}
            </div>
          </div>
          <div className="print-invoice-info">
            <div className="print-section-title">Invoice Details:</div>
            <div className="print-info-item">
              <span>Invoice Number:</span>
              <span>{invoice.invoice_number}</span>
            </div>
            <div className="print-info-item">
              <span>Invoice Date:</span>
              <span>{formatDate(invoice.invoice_date)}</span>
            </div>
            {invoice.reference && (
              <div className="print-info-item">
                <span>Reference:</span>
                <span>{invoice.reference}</span>
              </div>
            )}
            {invoice.reference_date && (
              <div className="print-info-item">
                <span>Reference Date:</span>
                <span>{formatDate(invoice.reference_date)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Information */}
        <div className="print-customer-section">
          <div className="print-section-title">Bill To:</div>
          <div className="print-customer-details">
            <div className="print-customer-name">{invoice.customer?.name}</div>
            {invoice.customer?.contact_name && <div>Contact: {invoice.customer.contact_name}</div>}
            {invoice.customer?.address && <div>{invoice.customer.address}</div>}
            {invoice.customer?.phone && <div>Tel: {invoice.customer.phone}</div>}
            {invoice.customer?.email && <div>Email: {invoice.customer.email}</div>}
            {invoice.customer?.trn_number && <div>TRN: {invoice.customer.trn_number}</div>}
          </div>
        </div>

        {/* Items Table */}
        <div className="print-table-section">
          <table className="print-table">
            <thead>
              <tr>
                <th>Product Code</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit Price (AED)</th>
                <th>Line Total (AED)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items && invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.product_code || '-'}</td>
                  <td>{item.description}</td>
                  <td className="print-qty">{item.quantity}</td>
                  <td className="print-amount">{parseFloat(item.unit_price || 0).toFixed(2)}</td>
                  <td className="print-amount">{parseFloat(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="print-totals-section">
          <div className="print-totals">
            <div className="print-total-row">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {showTax && (
              <div className="print-total-row">
                <span>VAT:</span>
                <span>{formatCurrency(invoice.tax_amount)}</span>
              </div>
            )}
            <div className="print-total-row print-grand-total">
              <span>Total:</span>
              <span>{formatCurrency(invoice.total_amount)}</span>
            </div>
          </div>
        </div>

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