import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/print.css";
import { format } from 'date-fns';

export default function POPrintView() {
  const navigate = useNavigate();
  const [poData, setPOData] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const poId = urlParams.get('id');
    
    if (!poId) {
      navigate('/PurchaseOrders');
      return;
    }

    loadPrintData(poId);
  }, []);

  const loadPrintData = async (poId: any) => {
    try {
      const poResponse = await fetch(`/api/export/po?poId=${poId}`);
      const poResult = await poResponse.json();

      if (poResult.success) {
        const poData = poResult.data;
        setPOData(poData);
        // Use the snapshot captured at creation time; fall back to live settings for older POs
        if (poData.companySnapshot) {
          setCompanyData(poData.companySnapshot);
        } else {
          const companyResponse = await fetch('/api/company-settings');
          setCompanyData(await companyResponse.json());
        }
      } else {
        console.error('Error loading PO data:', poResult.error);
        navigate('/PurchaseOrders');
      }
    } catch (error: any) {
      console.error('Error loading print data:', error);
      navigate('/PurchaseOrders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: any) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? '' : format(date, 'dd/MM/yy');
    } catch { return ''; }
  };

  const formatAmount = (amount: any, currency: any) => {
    const num = parseFloat(amount) || 0;
    return `${currency} ${num.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="print-loading">
        <p>Loading Purchase Order...</p>
      </div>
    );
  }

  if (!poData) {
    return (
      <div className="print-error">
        <p>Purchase Order not found.</p>
      </div>
    );
  }

  const currency = poData.currency || 'GBP';

  return (
    <div className="print-container">
      <div className="print-page">
        {/* Header with Logo and Title */}
        <div className="print-header">
          <div className="header-content">
            {companyData?.logo && (
              <div className="header-logo">
                <img src={companyData.logo} alt="Company Logo" />
              </div>
            )}
            <h1 className="print-title">PURCHASE ORDER</h1>
          </div>
        </div>

        {/* Company and PO Info Section */}
        <div className="print-info-section">
          {/* Left Column - Company Info */}
          <div className="print-company-info">
            <div className="company-name">{companyData?.companyName}</div>
            {companyData?.address && (
              <div className="company-address">{companyData.address}</div>
            )}
            {companyData?.phone && (
              <div className="company-contact">Tel: {companyData.phone}</div>
            )}
            {companyData?.email && (
              <div className="company-contact">Email: {companyData.email}</div>
            )}
            {companyData?.vatNumber && (
              <div className="company-contact">TRN: {companyData.vatNumber}</div>
            )}
          </div>

          {/* Right Column - PO Info */}
          <div className="print-po-info">
            <div className="po-info-row">
              <span className="po-label">PO Number</span>
              <span className="po-value">{poData.poNumber}</span>
            </div>
            <div className="po-info-row">
              <span className="po-label">PO Date</span>
              <span className="po-value">{formatDate(poData.orderDate)}</span>
            </div>
            <div className="po-info-row">
              <span className="po-label">Expected Delivery</span>
              <span className="po-value">{formatDate(poData.expectedDelivery)}</span>
            </div>
          </div>
        </div>

        {/* Supplier Section */}
        <div className="print-supplier-section">
          <div className="supplier-title">BRAND</div>
          <div className="supplier-name">{poData.supplierName}</div>
          {poData.supplierAddress && (
            <div className="supplier-address">{poData.supplierAddress}</div>
          )}
          {poData.supplierContactPerson && (
            <div className="supplier-contact">Contact: {poData.supplierContactPerson}</div>
          )}
          {poData.supplierEmail && (
            <div className="supplier-contact">Email: {poData.supplierEmail}</div>
          )}
          {poData.supplierPhone && (
            <div className="supplier-contact">Tel: {poData.supplierPhone}</div>
          )}
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
                <th className="col-price">Unit Price ({currency})</th>
                <th className="col-total">Line Total ({currency})</th>
              </tr>
            </thead>
            <tbody>
              {poData.items?.map((item: any, index: any) => (
                <tr key={index}>
                  <td className="col-code">{item.product_code}</td>
                  <td className="col-description">{item.description}</td>
                  <td className="col-size">{item.size}</td>
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
            <span className="totals-value">{formatAmount(poData.totalAmount, currency)}</span>
          </div>
          <div className="totals-row total-final">
            <span className="totals-label">Total</span>
            <span className="totals-value">{formatAmount(poData.totalAmount, currency)}</span>
          </div>
        </div>

        {/* Payment Confirmation Section */}
        {poData.paymentStatus === 'paid' && (
          <div className="print-remarks-section" style={{marginTop: '16px', padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
              <span style={{fontSize: '11px', fontWeight: '700', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Payment Confirmed</span>
              <span style={{display: 'inline-block', padding: '1px 8px', background: '#16a34a', color: '#fff', borderRadius: '4px', fontSize: '10px', fontWeight: '600'}}>PAID</span>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', color: '#166534'}}>
              {poData.paymentMadeDate && (
                <div>
                  <span style={{fontWeight: '600'}}>Payment Date: </span>
                  <span>{formatDate(poData.paymentMadeDate)}</span>
                </div>
              )}
              {poData.paymentRemarks && (
                <div>
                  <span style={{fontWeight: '600'}}>Remarks: </span>
                  <span>{poData.paymentRemarks}</span>
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
