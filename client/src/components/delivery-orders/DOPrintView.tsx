import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import "../../styles/print.css";
import { format } from 'date-fns';

export default function DOPrintView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deliveryOrder, setDeliveryOrder] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      navigate('/delivery-orders');
      return;
    }

    const loadData = async () => {
      try {
        const doResponse = await fetch(`/api/delivery-orders/${id}`, { credentials: 'include' });
        if (!doResponse.ok) throw new Error(`HTTP ${doResponse.status}`);
        const doData = await doResponse.json();
        setDeliveryOrder(doData);

        if (doData.company_snapshot) {
          setCompanySettings(doData.company_snapshot);
        } else {
          const companyResponse = await fetch('/api/company-settings', { credentials: 'include' });
          setCompanySettings(await companyResponse.json());
        }
      } catch (error: any) {
        console.error('Error loading data:', error);
        navigate('/delivery-orders');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, navigate]);

  // No auto-print — let the user choose when to print (matches Invoice & Quotation behaviour)

  const formatDate = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? '' : format(date, 'dd/MM/yy');
    } catch { return ''; }
  };

  const formatCurrency = (amount: any, currency = 'AED') => {
    const num = parseFloat(amount) || 0;
    return `${currency} ${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="print-loading">
        <p>Loading Delivery Order...</p>
      </div>
    );
  }

  if (!deliveryOrder || !companySettings) {
    return (
      <div className="print-error">
        <p>Delivery order not found</p>
      </div>
    );
  }

  const showTax = deliveryOrder.tax_treatment === 'StandardRated' && parseFloat(deliveryOrder.tax_amount || 0) > 0;
  const taxRatePct = Math.round((parseFloat(deliveryOrder.tax_rate || 0.05)) * 100);
  const customer = deliveryOrder.customer || {};

  return (
    <div className="print-container">
      <div className="print-page">
        {/* Header: logo left, title right */}
        <div className="print-header">
          <div className="header-content">
            {companySettings?.logo && (
              <div className="header-logo">
                <img src={companySettings.logo} alt="Company Logo" />
              </div>
            )}
            <h1 className="print-title">DELIVERY ORDER</h1>
          </div>
        </div>

        {/* Company info (left) & DO details (right) */}
        <div className="print-info-section">
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

          <div className="print-po-info">
            <div className="po-info-row">
              <span className="po-label">DO Number</span>
              <span className="po-value">{deliveryOrder.do_number}</span>
            </div>
            <div className="po-info-row">
              <span className="po-label">Order Date</span>
              <span className="po-value">{formatDate(deliveryOrder.order_date)}</span>
            </div>
          </div>
        </div>

        {/* Customer section (left) & Reference info (right) */}
        <div className="print-info-section">
          <div className="print-company-info">
            <div className="company-name">DELIVER TO</div>
            <div className="company-name">{customer.name || deliveryOrder.customer_name || 'Unknown Customer'}</div>
            {customer.address && (
              <div className="company-address">{customer.address}</div>
            )}
            {customer.contact_name && (
              <div className="company-contact">Contact: {customer.contact_name}</div>
            )}
            {customer.email && (
              <div className="company-contact">Email: {customer.email}</div>
            )}
            {customer.phone && (
              <div className="company-contact">Tel: {customer.phone}</div>
            )}
            {customer.trn_number && (
              <div className="company-contact">TRN: {customer.trn_number}</div>
            )}
          </div>

          <div className="print-po-info">
            {deliveryOrder.reference && (
              <div className="po-info-row">
                <span className="po-label">Reference</span>
                <span className="po-value">{deliveryOrder.reference}</span>
              </div>
            )}
            {deliveryOrder.reference_date && (
              <div className="po-info-row">
                <span className="po-label">Reference Date</span>
                <span className="po-value">{formatDate(deliveryOrder.reference_date)}</span>
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
                <th className="col-price">Unit Price (AED)</th>
                <th className="col-total">Line Total (AED)</th>
              </tr>
            </thead>
            <tbody>
              {deliveryOrder.items && deliveryOrder.items.map((item: any, index: any) => (
                <tr key={index}>
                  <td className="text-center">{item.product_code || '-'}</td>
                  <td>{item.description || item.product_name || '-'}</td>
                  <td className="text-center">{item.size || '-'}</td>
                  <td className="text-center">{item.quantity}</td>
                  <td className="text-right">{parseFloat(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right">{parseFloat(item.line_total || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="print-totals-section">
          <div className="totals-row">
            <span className="totals-label">Subtotal</span>
            <span className="totals-value">{formatCurrency(deliveryOrder.subtotal)}</span>
          </div>
          {showTax && (
            <div className="totals-row">
              <span className="totals-label">VAT ({taxRatePct}%)</span>
              <span className="totals-value">{formatCurrency(deliveryOrder.tax_amount)}</span>
            </div>
          )}
          <div className="totals-row total-final">
            <span className="totals-label">Grand Total</span>
            <span className="totals-value">{formatCurrency(deliveryOrder.total_amount)}</span>
          </div>
        </div>

        {/* Remarks — only when show_remarks is enabled */}
        {deliveryOrder.show_remarks && deliveryOrder.remarks && (
          <div className="print-remarks-section">
            <div className="supplier-title">REMARKS</div>
            <div style={{ fontSize: '11px', color: '#333', marginTop: '5px', whiteSpace: 'pre-line' }}>
              {deliveryOrder.remarks}
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
