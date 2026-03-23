import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../styles/print.css";

export default function POPrintView() {
  const navigate = useNavigate();
  const [poData, setPOData] = useState(null);
  const [companyData, setCompanyData] = useState(null);
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

  const loadPrintData = async (poId) => {
    try {
      const [poResponse, companyResponse] = await Promise.all([
        fetch(`/api/export/po?poId=${poId}`),
        fetch('/api/company-settings')
      ]);

      const poResult = await poResponse.json();
      const companyResult = await companyResponse.json();

      if (poResult.success) {
        setPOData(poResult.data);
        setCompanyData(companyResult);
      } else {
        console.error('Error loading PO data:', poResult.error);
        navigate('/PurchaseOrders');
      }
    } catch (error) {
      console.error('Error loading print data:', error);
      navigate('/PurchaseOrders');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const formatAmount = (amount, currency) => {
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
  const fxRate = parseFloat(poData.fxRateToAed) || 4.85;
  const totalAmount = parseFloat(poData.totalAmount) || 0;
  const aedTotal = currency === 'AED' ? totalAmount : totalAmount * fxRate;

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
            <div className="po-info-row">
              <span className="po-label">Currency</span>
              <span className="po-value">{currency}</span>
            </div>
            {currency !== 'AED' && (
              <div className="po-info-row">
                <span className="po-label">FX Rate (to AED)</span>
                <span className="po-value">{fxRate.toFixed(4)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Supplier Section */}
        <div className="print-supplier-section">
          <div className="supplier-title">SUPPLIER/BRAND</div>
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
              {poData.items?.map((item, index) => (
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
          {currency !== 'AED' && (
            <div className="totals-row">
              <span className="totals-label">Total (AED equivalent)</span>
              <span className="totals-value">{formatAmount(aedTotal, 'AED')}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="print-footer">
          <div className="page-number">Page 1/1</div>
        </div>
      </div>
    </div>
  );
}
