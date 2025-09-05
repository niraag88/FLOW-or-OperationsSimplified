import React, { useEffect } from 'react';

export default function ProductsPrintView({ products, onClose }) {
  useEffect(() => {
    // Trigger print dialog when component mounts
    const timer = setTimeout(() => {
      window.print();
    }, 500); // Small delay to ensure content is rendered

    // Clean up timer
    return () => clearTimeout(timer);
  }, []);

  // Handle after print - close the window/tab
  useEffect(() => {
    const handleAfterPrint = () => {
      if (onClose) {
        onClose();
      } else {
        window.close();
      }
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [onClose]);

  return (
    <div className="print-view">
      <div className="print-header">
        <h1>Inventory Management</h1>
        <h2>Products</h2>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Product Code</th>
            <th>Product Name</th>
            <th>Size</th>
            <th>Cost Price</th>
            <th>Unit Price</th>
            <th>Stock Quantity</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products && products.length > 0 ? (
            products.map((product) => (
              <tr key={product.id}>
                <td>{product.brandName || '-'}</td>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>{product.size || '-'}</td>
                <td>GBP {parseFloat(product.costPrice || 0).toFixed(2)}</td>
                <td>GBP {parseFloat(product.unitPrice || 0).toFixed(2)}</td>
                <td>{product.stockQuantity || 0}</td>
                <td>{product.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8" style={{ textAlign: 'center', color: '#666' }}>
                No products found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="print-footer">
        <p>Generated on: {new Date().toLocaleDateString('en-GB')} at {new Date().toLocaleTimeString('en-GB')}</p>
        <p>Total Products: {products?.length || 0}</p>
      </div>
    </div>
  );
}