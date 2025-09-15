import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import "../../styles/print.css";

export default function QuotationPrintView() {
  const navigate = useNavigate();
  const [quotation, setQuotation] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get Quotation ID from URL params (same pattern as POPrintView)
    const urlParams = new URLSearchParams(window.location.search);
    const quotationId = urlParams.get('id');
    
    if (!quotationId) {
      navigate('/Quotations');
      return;
    }

    const loadData = async () => {
      try {
        // Load quotation data and company settings (same pattern as POPrintView)
        const [quotationResponse, companyResponse] = await Promise.all([
          fetch(`/api/export/quotation?quotationId=${quotationId}`),
          fetch('/api/company-settings')
        ]);
        
        const quotationResult = await quotationResponse.json();
        const companyResult = await companyResponse.json();
        
        if (quotationResult.success) {
          setQuotation(quotationResult.data);
          setCompanySettings(companyResult);
        } else {
          console.error('Error loading quotation:', quotationResult.error);
          navigate('/Quotations');
        }
        
      } catch (error) {
        console.error('Error loading data:', error);
        navigate('/Quotations');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [navigate]);

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
        <p>Loading Quotation...</p>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="print-error">
        <p>Quotation not found.</p>
      </div>
    );
  }

  return (
    <div className="print-container">
      <div className="print-page">
        {/* Header with Logo and Title */}
        <div className="print-header">
          <div className="header-content">
            {companySettings?.logo && (
              <div className="header-logo">
                <img src={companySettings.logo} alt="Company Logo" />
              </div>
            )}
            <h1 className="print-title">QUOTATION</h1>
          </div>
        </div>

        {/* Company and Quotation Info Section */}
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

          {/* Right Column - Quotation Info */}
          <div className="print-po-info">
            <div className="po-info-row">
              <span className="po-label">Quote Number</span>
              <span className="po-value">{quotation.quoteNumber}</span>
            </div>
            <div className="po-info-row">
              <span className="po-label">Quote Date</span>
              <span className="po-value">{formatDate(quotation.quoteDate)}</span>
            </div>
          </div>
        </div>

        {/* Customer Section */}
        <div className="print-info-section">
          {/* Left Column - Customer Info */}
          <div className="print-company-info">
            <div className="company-name">BILL TO</div>
            <div className="company-name">{quotation.customerName || 'Unknown Customer'}</div>
            {quotation.customerBillingAddress && (
              <div className="company-address">{quotation.customerBillingAddress}</div>
            )}
            {quotation.customerContactPerson && (
              <div className="company-contact">Contact: {quotation.customerContactPerson}</div>
            )}
            {quotation.customerEmail && (
              <div className="company-contact">Email: {quotation.customerEmail}</div>
            )}
            {quotation.customerPhone && (
              <div className="company-contact">Tel: {quotation.customerPhone}</div>
            )}
            {quotation.customerVatNumber && (
              <div className="company-contact">TRN: {quotation.customerVatNumber}</div>
            )}
          </div>

          {/* Right Column - Customer Meta Info */}
          <div className="print-po-info">
            {quotation.reference && (
              <div className="po-info-row">
                <span className="po-label">Reference</span>
                <span className="po-value">{quotation.reference}</span>
              </div>
            )}
            {quotation.referenceDate && (
              <div className="po-info-row">
                <span className="po-label">Reference Date</span>
                <span className="po-value">{formatDate(quotation.referenceDate)}</span>
              </div>
            )}
            {quotation.terms && (
              <div className="po-info-row">
                <span className="po-label">Payment Terms</span>
                <span className="po-value">{quotation.terms}</span>
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="print-table-section">
          <table className="print-table">
            <thead>
              <tr>
                <th className="col-code">Product Code</th>
                <th className="col-description">Description</th>
                <th className="col-size">Size</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">Unit Price ({quotation.currency || 'AED'})</th>
                <th className="col-total">Line Total ({quotation.currency || 'AED'})</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items?.map((item, index) => (
                <tr key={index}>
                  <td className="col-code">{item.product_code}</td>
                  <td className="col-description">{item.description}</td>
                  <td className="col-size">{item.size || '-'}</td>
                  <td className="col-qty">{item.quantity}</td>
                  <td className="col-price">{parseFloat(item.unit_price).toFixed(2)}</td>
                  <td className="col-total">{parseFloat(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="print-totals-section">
          <div className="totals-row">
            <span className="totals-label">Subtotal</span>
            <span className="totals-value">{formatCurrency(quotation.totalAmount, quotation.currency)}</span>
          </div>
          {quotation.vatAmount && parseFloat(quotation.vatAmount) > 0 && (
            <div className="totals-row">
              <span className="totals-label">VAT</span>
              <span className="totals-value">{formatCurrency(quotation.vatAmount, quotation.currency)}</span>
            </div>
          )}
          <div className="totals-row total-final">
            <span className="totals-label">Total</span>
            <span className="totals-value">{formatCurrency(quotation.grandTotal, quotation.currency)}</span>
          </div>
        </div>

        {/* Notes Section */}
        {quotation.remarks && (
          <div className="print-supplier-section" style={{marginTop: '30px'}}>
            <div className="supplier-title">REMARKS</div>
            <div style={{fontSize: '11px', color: '#333', marginTop: '5px'}}>
              {quotation.remarks}
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