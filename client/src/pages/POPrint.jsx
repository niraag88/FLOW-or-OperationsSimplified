import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import './POPrint.css';

export default function POPrint() {
  const { id } = useParams();
  const [poData, setPOData] = useState(null);
  const [companySettings, setCompanySettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch PO data
        const poResponse = await fetch(`/api/export/po?poId=${id}`);
        const poResult = await poResponse.json();
        
        // Fetch company settings
        const companyResponse = await fetch('/api/company-settings');
        const companyResult = await companyResponse.json();
        
        if (poResult.success) {
          setPOData(poResult.data);
          setCompanySettings(companyResult);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Remove auto-print for now to allow preview
  // useEffect(() => {
  //   // Auto-trigger print dialog after data loads
  //   if (poData && companySettings) {
  //     setTimeout(() => {
  //       window.print();
  //     }, 500);
  //   }
  // }, [poData, companySettings]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Preparing document for printing...</p>
      </div>
    );
  }

  if (!poData) {
    return (
      <div className="error-screen">
        <h2>Purchase Order Not Found</h2>
        <p>The requested purchase order could not be loaded.</p>
      </div>
    );
  }

  const formatCurrency = (amount) => {
    const numAmount = parseFloat(amount);
    return `GBP ${numAmount.toFixed(2)}`;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="print-document">
      {/* Print Button for manual control */}
      <div className="print-controls" style={{textAlign: 'center', marginBottom: '20px', pageBreakInside: 'avoid'}}>
        <button 
          onClick={handlePrint}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Print PDF
        </button>
      </div>
      
      {/* Header Section */}
      <div className="document-header">
        <div className="company-info">
          <h1 className="company-name">{companySettings?.companyName || 'SUPERNATURE LLC'}</h1>
          <div className="company-details">
            <p>{companySettings?.address || '123 Business Street'}</p>
            <p>{companySettings?.city || 'London'}, {companySettings?.postcode || 'SW1A 1AA'}</p>
            <p>Tel: {companySettings?.phone || '+44 20 7123 4567'}</p>
            <p>Email: {companySettings?.email || 'info@supernature.com'}</p>
          </div>
        </div>
        <div className="logo-section">
          {companySettings?.logoUrl && (
            <img 
              src={companySettings.logoUrl} 
              alt="Company Logo" 
              className="company-logo"
            />
          )}
        </div>
      </div>

      {/* Document Title */}
      <div className="document-title">
        <h2>PURCHASE ORDER</h2>
      </div>

      {/* Document Info Grid */}
      <div className="document-info">
        <div className="info-left">
          <div className="info-group">
            <label>Purchase Order Number:</label>
            <span className="po-number">{poData.poNumber}</span>
          </div>
          <div className="info-group">
            <label>Order Date:</label>
            <span>{format(new Date(poData.orderDate), 'dd/MM/yyyy')}</span>
          </div>
          <div className="info-group">
            <label>Expected Delivery:</label>
            <span>{format(new Date(poData.expectedDelivery), 'dd/MM/yyyy')}</span>
          </div>
        </div>
        <div className="info-right">
          <div className="supplier-section">
            <h3>Supplier</h3>
            <div className="supplier-details">
              <strong>{poData.supplierName}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="items-section">
        <table className="items-table">
          <thead>
            <tr>
              <th className="col-code">Product Code</th>
              <th className="col-description">Description</th>
              <th className="col-size">Size</th>
              <th className="col-qty">Qty</th>
              <th className="col-price">Unit Price</th>
              <th className="col-total">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {poData.items.map((item, index) => (
              <tr key={index}>
                <td className="col-code">{item.product_code}</td>
                <td className="col-description">{item.description}</td>
                <td className="col-size">{item.size}</td>
                <td className="col-qty">{item.quantity}</td>
                <td className="col-price">{formatCurrency(item.unit_price)}</td>
                <td className="col-total">{formatCurrency(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="totals-section">
        <div className="totals-table">
          <div className="total-row grand-total">
            <span className="total-label">TOTAL:</span>
            <span className="total-amount">{formatCurrency(poData.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      {poData.notes && (
        <div className="notes-section">
          <h4>Notes:</h4>
          <p>{poData.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="document-footer">
        <p>Please confirm receipt of this purchase order and provide delivery confirmation.</p>
        <p>Payment terms: 30 days net from invoice date.</p>
      </div>
    </div>
  );
}