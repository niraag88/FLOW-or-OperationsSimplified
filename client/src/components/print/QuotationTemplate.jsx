import React from 'react';
import { format, isValid, parseISO } from 'date-fns';

export default function QuotationTemplate({ data, customer, settings }) {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
      return isValid(date) ? format(date, 'dd/MM/yyyy') : '';
    } catch (error) {
      return '';
    }
  };

  return (
    <div style={{ 
      maxWidth: '210mm', 
      margin: '0 auto', 
      padding: '20mm', 
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.4',
      color: '#333'
    }}>
      
      {/* Header Section - Logo LEFT, Title RIGHT */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        marginBottom: '20px' 
      }}>
        {/* Logo on LEFT */}
        <div>
          {settings?.logo && (
            <img 
              src={settings.logo} 
              alt="Company Logo" 
              style={{ height: '60px', width: 'auto' }}
            />
          )}
        </div>
        
        {/* Document Title on RIGHT */}
        <div>
          <h1 style={{ 
            fontSize: '28px', 
            fontWeight: 'bold', 
            margin: '0',
            textAlign: 'right',
            color: '#333'
          }}>
            QUOTATION
          </h1>
        </div>
      </div>

      {/* Horizontal Divider */}
      <div style={{ 
        borderBottom: '2px solid #333', 
        marginBottom: '20px' 
      }}></div>

      {/* Company Details and Document Info */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '40px',
        marginBottom: '30px' 
      }}>
        {/* Company Details - LEFT */}
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '5px' }}>
            {settings?.companyName || 'SUPERNATURE LLC'}
          </div>
          <div style={{ fontSize: '11px', lineHeight: '1.3' }}>
            {settings?.address && <div>{settings.address}</div>}
            {settings?.phone && <div>Tel: {settings.phone}</div>}
            {settings?.email && <div>Email: {settings.email}</div>}
          </div>
        </div>

        {/* Document Details - RIGHT */}
        <div style={{ textAlign: 'right' }}>
          <table style={{ marginLeft: 'auto', borderSpacing: '0', fontSize: '11px' }}>
            <tbody>
              <tr>
                <td style={{ padding: '2px 10px 2px 0', fontWeight: 'bold' }}>Quotation Number</td>
                <td style={{ padding: '2px 0' }}>{data.quoteNumber}</td>
              </tr>
              <tr>
                <td style={{ padding: '2px 10px 2px 0', fontWeight: 'bold' }}>Quotation Date</td>
                <td style={{ padding: '2px 0' }}>{formatDate(data.quoteDate)}</td>
              </tr>
              {data.reference && (
                <tr>
                  <td style={{ padding: '2px 10px 2px 0', fontWeight: 'bold' }}>Reference</td>
                  <td style={{ padding: '2px 0' }}>{data.reference}</td>
                </tr>
              )}
              {data.referenceDate && (
                <tr>
                  <td style={{ padding: '2px 10px 2px 0', fontWeight: 'bold' }}>Reference Date</td>
                  <td style={{ padding: '2px 0' }}>{formatDate(data.referenceDate)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill To Section */}
      <div style={{ 
        marginBottom: '20px',
        border: '1px solid #ddd',
        padding: '10px'
      }}>
        <div style={{ 
          fontWeight: 'bold', 
          fontSize: '11px', 
          textTransform: 'uppercase',
          marginBottom: '5px',
          color: '#666'
        }}>
          Bill To
        </div>
        <div style={{ fontSize: '12px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
            {data.customerName || 'Unknown Customer'}
          </div>
          {data.customerContactPerson && (
            <div>Contact: {data.customerContactPerson}</div>
          )}
          {data.customerEmail && (
            <div>Email: {data.customerEmail}</div>
          )}
          {data.customerPhone && (
            <div>Tel: {data.customerPhone}</div>
          )}
          {data.customerBillingAddress && (
            <div>{data.customerBillingAddress}</div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        marginBottom: '20px',
        fontSize: '10px'
      }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'left',
              fontWeight: 'bold'
            }}>
              Product Code
            </th>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'left',
              fontWeight: 'bold'
            }}>
              Description
            </th>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              Size
            </th>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              Qty
            </th>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'right',
              fontWeight: 'bold'
            }}>
              Unit Price (AED)
            </th>
            <th style={{ 
              border: '1px solid #ddd', 
              padding: '8px', 
              textAlign: 'right',
              fontWeight: 'bold'
            }}>
              Line Total (AED)
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items && data.items.length > 0 ? (
            data.items.map((item, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>
                  {item.product_code || '-'}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'left' }}>
                  {item.description}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>
                  {item.size || '-'}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'center' }}>
                  {item.quantity}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>
                  {parseFloat(item.unit_price || 0).toFixed(2)}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '6px', textAlign: 'right' }}>
                  {parseFloat(item.line_total || 0).toFixed(2)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" style={{ 
                border: '1px solid #ddd', 
                padding: '20px', 
                textAlign: 'center',
                color: '#666'
              }}>
                No items
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals Section */}
      <div style={{ textAlign: 'right', marginBottom: '30px' }}>
        <table style={{ 
          marginLeft: 'auto', 
          borderSpacing: '0',
          fontSize: '11px',
          minWidth: '200px'
        }}>
          <tbody>
            <tr>
              <td style={{ 
                padding: '4px 15px 4px 0', 
                fontWeight: 'bold',
                borderBottom: '1px solid #eee'
              }}>
                Subtotal
              </td>
              <td style={{ 
                padding: '4px 0', 
                textAlign: 'right',
                borderBottom: '1px solid #eee'
              }}>
                AED {parseFloat(data.totalAmount || 0).toFixed(2)}
              </td>
            </tr>
            {data.vatAmount && parseFloat(data.vatAmount) > 0 && (
              <tr>
                <td style={{ 
                  padding: '4px 15px 4px 0', 
                  fontWeight: 'bold',
                  borderBottom: '1px solid #eee'
                }}>
                  VAT
                </td>
                <td style={{ 
                  padding: '4px 0', 
                  textAlign: 'right',
                  borderBottom: '1px solid #eee'
                }}>
                  AED {parseFloat(data.vatAmount || 0).toFixed(2)}
                </td>
              </tr>
            )}
            <tr>
              <td style={{ 
                padding: '8px 15px 4px 0', 
                fontWeight: 'bold',
                fontSize: '12px',
                borderTop: '2px solid #333'
              }}>
                Total
              </td>
              <td style={{ 
                padding: '8px 0 4px 0', 
                textAlign: 'right',
                fontWeight: 'bold',
                fontSize: '12px',
                borderTop: '2px solid #333'
              }}>
                AED {parseFloat(data.grandTotal || 0).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signature Section */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '60px',
        marginTop: '40px',
        borderTop: '1px solid #ddd',
        paddingTop: '20px'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            borderBottom: '1px solid #999', 
            height: '40px',
            marginBottom: '8px'
          }}></div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            For {settings?.companyName || 'Supernature'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            borderBottom: '1px solid #999', 
            height: '40px',
            marginBottom: '8px'
          }}></div>
          <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
            For Customer
          </div>
        </div>
      </div>
    </div>
  );
}