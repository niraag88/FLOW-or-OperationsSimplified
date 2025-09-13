import React, { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { CompanySettings } from '@/api/entities';
import "../../styles/print.css";

export default function QuotationPrintView() {
  const { id } = useParams();
  const [quotation, setQuotation] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get Quotation ID from URL params if not from wouter params
    const urlParams = new URLSearchParams(window.location.search);
    const quotationId = id || urlParams.get('id');
    
    if (!quotationId) {
      console.error('No quotation ID provided');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        // Use optimized export API for speed like Purchase Orders
        const [quotationResponse, companyData] = await Promise.all([
          fetch(`/api/export/quotation?quotationId=${quotationId}`),
          CompanySettings.get()
        ]);
        
        const quotationResult = await quotationResponse.json();
        
        if (quotationResult.success) {
          setQuotation(quotationResult.data);
        } else {
          console.error('Error loading quotation:', quotationResult.error);
        }
        
        setCompanySettings(companyData);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id]);

  useEffect(() => {
    if (!loading && quotation && companySettings) {
      // Auto-trigger print dialog
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, quotation, companySettings]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!quotation || !companySettings) {
    return <div className="p-8">Error loading quotation data</div>;
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
          <div className="print-title">QUOTATION</div>
        </div>

        {/* Company and Quotation Info Section */}
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
            <div className="print-section-title">Quotation Details:</div>
            <div className="print-details-grid">
              <div><span className="print-label">Quotation Number:</span> {quotation.quotation_number}</div>
              <div><span className="print-label">Date:</span> {formatDate(quotation.quotation_date)}</div>
              <div><span className="print-label">Customer:</span> {quotation.customer_name}</div>
              {quotation.reference && <div><span className="print-label">Reference:</span> {quotation.reference}</div>}
              {quotation.reference_date && <div><span className="print-label">Reference Date:</span> {formatDate(quotation.reference_date)}</div>}
              <div><span className="print-label">Status:</span> {quotation.status?.toUpperCase()}</div>
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
              {quotation.items?.map((item, index) => (
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
              <span className="print-total-value">{formatCurrency(quotation.subtotal, quotation.currency)}</span>
            </div>
            {quotation.tax_treatment === 'StandardRated' && quotation.tax_amount > 0 && (
              <div className="print-total-row">
                <span className="print-total-label">VAT ({(quotation.tax_rate * 100).toFixed(0)}%):</span>
                <span className="print-total-value">{formatCurrency(quotation.tax_amount, quotation.currency)}</span>
              </div>
            )}
            <div className="print-total-row print-final-total">
              <span className="print-total-label">Total:</span>
              <span className="print-total-value">{formatCurrency(quotation.total_amount, quotation.currency)}</span>
            </div>
          </div>
        </div>

        {/* Remarks */}
        {quotation.remarks && (
          <div className="print-remarks">
            <div className="print-section-title">Remarks:</div>
            <div className="print-remarks-content">{quotation.remarks}</div>
          </div>
        )}
      </div>
    </div>
  );
}