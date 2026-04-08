import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DeliveryOrder, CompanySettings } from '@/api/entities';
import "../../styles/print.css";
import { format } from 'date-fns';

export default function DOPrintView() {
  const { id } = useParams();
  const [deliveryOrder, setDeliveryOrder] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const doData = await DeliveryOrder.getById(id);
        setDeliveryOrder(doData);
        // Use the snapshot captured at creation time; fall back to live settings for older DOs
        if (doData?.company_snapshot) {
          setCompanySettings(doData.company_snapshot);
        } else {
          const companyResponse = await fetch('/api/company-settings', { credentials: 'include' });
          setCompanySettings(await companyResponse.json());
        }
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
    if (!loading && deliveryOrder && companySettings) {
      // Auto-trigger print dialog
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, deliveryOrder, companySettings]);

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (!deliveryOrder || !companySettings) {
    return <div className="p-8">Error loading delivery order data</div>;
  }

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? '' : format(date, 'dd/MM/yy');
    } catch { return ''; }
  };

  const formatCurrency = (amount, currency = 'AED') => {
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
          <div className="print-title">DELIVERY ORDER</div>
        </div>

        {/* Company and DO Info Section */}
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
            <div className="print-section-title">Delivery Order Details:</div>
            <div className="print-details-grid">
              <div><span className="print-label">DO Number:</span> {deliveryOrder.do_number}</div>
              <div><span className="print-label">Order Date:</span> {formatDate(deliveryOrder.order_date)}</div>
              <div><span className="print-label">Customer:</span> {deliveryOrder.customer_name}</div>
              {deliveryOrder.reference && <div><span className="print-label">Reference:</span> {deliveryOrder.reference}</div>}
              {deliveryOrder.reference_date && <div><span className="print-label">Reference Date:</span> {formatDate(deliveryOrder.reference_date)}</div>}
              <div><span className="print-label">Status:</span> {deliveryOrder.status?.toLowerCase() === 'submitted' ? 'SUBMITTED' : deliveryOrder.status?.replace(/_/g, ' ').toUpperCase()}</div>
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
                <th className="col-price">Unit Price (AED)</th>
                <th className="col-total">Line Total (AED)</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrder.items?.map((item, index) => (
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
              <span className="print-total-value">{formatCurrency(deliveryOrder.subtotal, deliveryOrder.currency)}</span>
            </div>
            {deliveryOrder.tax_treatment === 'StandardRated' && deliveryOrder.tax_amount > 0 && (
              <div className="print-total-row">
                <span className="print-total-label">VAT ({(deliveryOrder.tax_rate * 100).toFixed(0)}%):</span>
                <span className="print-total-value">{formatCurrency(deliveryOrder.tax_amount, deliveryOrder.currency)}</span>
              </div>
            )}
            <div className="print-total-row print-final-total">
              <span className="print-total-label">Total:</span>
              <span className="print-total-value">{formatCurrency(deliveryOrder.total_amount, deliveryOrder.currency)}</span>
            </div>
          </div>
        </div>

        {/* Remarks */}
        {deliveryOrder.show_remarks && deliveryOrder.remarks && (
          <div className="print-remarks">
            <div className="print-section-title">Remarks:</div>
            <div className="print-remarks-content" style={{whiteSpace: 'pre-line'}}>{deliveryOrder.remarks}</div>
          </div>
        )}
      </div>
    </div>
  );
}