import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import "../../styles/print.css";

export default function InvoicesListPrintView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();

    ['search', 'status', 'customerId', 'paymentStatus', 'dateFrom', 'dateTo', 'excludeYears'].forEach(key => {
      const val = urlParams.get(key);
      if (val) params.set(key, val);
    });

    fetch(`/api/export/invoices-list?${params}`, { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        setData(json);
        setLoading(false);
        setTimeout(() => window.print(), 500);
      })
      .catch(err => {
        console.error('Error loading invoices list:', err);
        setError('Failed to load invoices.');
        setLoading(false);
      });
  }, []);

  const fmtDate = (d) => {
    if (!d) return '';
    try { return format(new Date(d), 'dd/MM/yy'); } catch { return ''; }
  };

  const fmtNum = (v) => (parseFloat(v) || 0).toFixed(2);

  const statusLabel = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  if (loading) {
    return (
      <div className="print-container">
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px' }}>
          Loading invoices…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="print-container">
        <div style={{ padding: '40px', textAlign: 'center', fontSize: '14px', color: '#c00' }}>
          {error || 'No data available.'}
        </div>
      </div>
    );
  }

  const { invoices = [], company = {} } = data;

  const totSubtotal = invoices.reduce((s, inv) => s + (parseFloat(inv.subtotal) || 0), 0);
  const totVat      = invoices.reduce((s, inv) => s + (parseFloat(inv.vatAmount) || 0), 0);
  const totGrand    = invoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0);

  const urlParams = new URLSearchParams(window.location.search);
  const filterParts = [];
  if (urlParams.get('search'))        filterParts.push(`Search: "${urlParams.get('search')}"`);
  if (urlParams.get('status'))        filterParts.push(`Status: ${urlParams.get('status').split(',').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')}`);
  if (urlParams.get('paymentStatus')) filterParts.push(`Payment: ${urlParams.get('paymentStatus').charAt(0).toUpperCase() + urlParams.get('paymentStatus').slice(1)}`);
  if (urlParams.get('dateFrom'))      filterParts.push(`From: ${urlParams.get('dateFrom')}`);
  if (urlParams.get('dateTo'))        filterParts.push(`To: ${urlParams.get('dateTo')}`);
  const filterSummary = filterParts.join('  |  ');

  return (
    <div className="print-container">
      <div className="print-page">

        <div className="print-header">
          <div className="header-content">
            <div>
              <div className="company-name" style={{ fontSize: '16px', fontWeight: 700 }}>
                {company.companyName || 'FLOW'}
              </div>
              {company.address && (
                <div className="company-address" style={{ marginTop: '2px' }}>{company.address}</div>
              )}
              {company.phone && (
                <div className="company-contact">Tel: {company.phone}</div>
              )}
              {company.vatNumber && (
                <div className="company-contact">TRN: {company.vatNumber}</div>
              )}
            </div>
            <h1 className="print-title" style={{ fontSize: '22px', marginBottom: 0 }}>
              INVOICES REPORT
            </h1>
          </div>
          <div style={{ marginTop: '6px', fontSize: '10px', color: '#555' }}>
            {filterSummary || 'All invoices'} &nbsp;|&nbsp; Generated: {format(new Date(), 'dd/MM/yy HH:mm')}
          </div>
        </div>

        <div className="print-table-section">
          <table className="print-table" style={{ fontSize: '10px' }}>
            <thead>
              <tr>
                <th style={{ width: '28px', textAlign: 'center' }}>#</th>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th style={{ width: '60px' }}>Date</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Subtotal (AED)</th>
                <th style={{ textAlign: 'right' }}>VAT (AED)</th>
                <th style={{ textAlign: 'right' }}>Total (AED)</th>
                <th style={{ width: '60px' }}>Status</th>
                <th style={{ width: '70px' }}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((inv, i) => (
                  <tr key={inv.id}>
                    <td style={{ textAlign: 'center' }}>{i + 1}</td>
                    <td>{inv.invoiceNumber}</td>
                    <td>{inv.customerName || '—'}</td>
                    <td>{fmtDate(inv.invoiceDate)}</td>
                    <td>{inv.reference || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(inv.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(inv.vatAmount)}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(inv.amount)}</td>
                    <td>{statusLabel(inv.status)}</td>
                    <td>{statusLabel(inv.paymentStatus) || 'Outstanding'}</td>
                  </tr>
                ))
              )}
            </tbody>
            {invoices.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #333' }}>
                  <td colSpan={5} style={{ textAlign: 'right', paddingRight: '8px' }}>
                    Total ({invoices.length} invoice{invoices.length !== 1 ? 's' : ''})
                  </td>
                  <td style={{ textAlign: 'right' }}>AED {totSubtotal.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>AED {totVat.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>AED {totGrand.toFixed(2)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="print-footer" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666' }}>
            <span>Generated on: {format(new Date(), 'dd/MM/yy HH:mm')}</span>
            <span>Total: {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

      </div>

      <div className="no-print" style={{ textAlign: 'center', marginTop: '20px' }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '8px 20px',
            fontSize: '13px',
            background: '#1a472a',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Print
        </button>
      </div>
    </div>
  );
}
