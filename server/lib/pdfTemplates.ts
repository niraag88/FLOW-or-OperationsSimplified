/**
 * Side-effect-free server-side PDF template helpers.
 *
 * This module is intentionally pure: no DB clients, no schedulers, no
 * top-level intervals. Importing it must not register any timer or
 * I/O handle, so unit tests can import generateDOPDF / escapeHtml
 * directly without keeping the Node event loop alive.
 *
 * (Task #373 originally placed escapeHtml inside server/middleware.ts,
 * which has a 5-minute setInterval at module top — that prevented
 * `node --test` from exiting cleanly. Extracting the PDF helpers here
 * removes that contamination.)
 */

/**
 * HTML-escape a value for safe interpolation into a server-rendered HTML
 * template (e.g. the PDF generators below). Maps the five HTML
 * metacharacters (& < > " ') to their entity equivalents and treats
 * null/undefined as ''.
 *
 * Returns '' (not '-') for nullish input so existing
 * `${escapeHtml(x) || '-'}` patterns at the callsite still work.
 *
 * Reusable for any future server-rendered PDF (Invoice/PO/Quotation).
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generateDOPDF(
  deliveryOrder: any,
  items: Array<{ productCode: string | null; description: string | null; quantity: number; unitPrice: string; lineTotal: string }>,
  company: { name?: string; address?: string; phone?: string; email?: string } | null
): Promise<string> {
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  const fmt = (n: string | number | null | undefined) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currency = escapeHtml(deliveryOrder.currency || 'AED');

  const itemRows = items.map((item, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td>${escapeHtml(item.productCode) || '-'}</td>
      <td>${escapeHtml(item.description) || '-'}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${fmt(item.unitPrice)}</td>
      <td class="text-right">${fmt(item.lineTotal)}</td>
    </tr>
  `).join('');

  const subtotal = parseFloat(deliveryOrder.subtotal || '0');
  const taxAmount = parseFloat(deliveryOrder.taxAmount || '0');
  const totalAmount = parseFloat(deliveryOrder.totalAmount || '0');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Delivery Order ${escapeHtml(deliveryOrder.orderNumber)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 13px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
        .do-title { font-size: 28px; font-weight: bold; color: #333; }
        .do-details { margin-top: 8px; }
        .do-details p { margin: 2px 0; }
        .company-info { text-align: right; }
        .company-info h2 { margin: 0 0 4px 0; font-size: 16px; }
        .company-info p { margin: 2px 0; }
        .section { margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-table { width: 300px; margin-left: auto; margin-top: 16px; }
        .totals-table td { border: none; padding: 4px 8px; }
        .totals-table .total-row { font-weight: bold; border-top: 2px solid #333; }
        .signature-section { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
        .signature-box { text-align: center; border-top: 1px solid #333; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="do-title">DELIVERY ORDER</h1>
          <div class="do-details">
            <p>DO Number: <strong>${escapeHtml(deliveryOrder.orderNumber)}</strong></p>
            <p>Order Date: <strong>${escapeHtml(formatDate(deliveryOrder.orderDate))}</strong></p>
            ${deliveryOrder.reference ? `<p>Reference: <strong>${escapeHtml(deliveryOrder.reference)}</strong></p>` : ''}
          </div>
        </div>
        <div class="company-info">
          <h2>${escapeHtml(company?.name) || ''}</h2>
          ${company?.address ? `<p>${escapeHtml(company.address)}</p>` : ''}
          ${company?.phone ? `<p>Tel: ${escapeHtml(company.phone)}</p>` : ''}
          ${company?.email ? `<p>Email: ${escapeHtml(company.email)}</p>` : ''}
        </div>
      </div>

      <div class="section grid">
        <div>
          <strong>Deliver To:</strong><br/>
          ${escapeHtml(deliveryOrder.customerName)}<br/>
          ${escapeHtml(deliveryOrder.deliveryAddress) || ''}
        </div>
        <div>
          <strong>Status:</strong> ${escapeHtml(deliveryOrder.status)}<br/>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center" style="width:40px">No.</th>
            <th style="width:120px">Product Code</th>
            <th>Description</th>
            <th class="text-right" style="width:70px">Qty</th>
            <th class="text-right" style="width:110px">Unit Price (${currency})</th>
            <th class="text-right" style="width:110px">Total (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="6" style="text-align:center;color:#999">No items</td></tr>`}
        </tbody>
      </table>

      <table class="totals-table">
        <tbody>
          <tr>
            <td>Subtotal:</td>
            <td class="text-right">${currency} ${fmt(subtotal)}</td>
          </tr>
          ${taxAmount > 0 ? `<tr><td>VAT:</td><td class="text-right">${currency} ${fmt(taxAmount)}</td></tr>` : ''}
          <tr class="total-row">
            <td>Total:</td>
            <td class="text-right">${currency} ${fmt(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      ${deliveryOrder.notes ? `<div class="section" style="margin-top:20px"><strong>Remarks:</strong><br/>${escapeHtml(deliveryOrder.notes)}</div>` : ''}

      <div class="signature-section">
        <div class="signature-box"><p>Delivered By</p></div>
        <div class="signature-box"><p>Received By</p></div>
      </div>
    </body>
    </html>
  `;
}
