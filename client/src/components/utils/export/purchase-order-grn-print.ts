import { format } from 'date-fns';
import { fmtShort } from './shared';

// ─── Shared PO GRN Summary utilities ─────────────────────────────────────────
// Used by both GoodsReceiptsTab and POActionsDropdown to avoid duplication.

export const printPOGRNSummary = async (poId: any) => {
  const res = await fetch(`/api/purchase-orders/${poId}/detail`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load PO detail');
  const d = await res.json();
  const currency = d.currency || 'AED';
  const fmt = (n: any) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const fmtDate = (s: any) => fmtShort(s) || '—';

  const productCell = (name: any, size: any, sku: any) =>
    `${name || '—'}${size ? `<br/><span class="size-text">${size}</span>` : ''}${sku ? `<br/><span class="sku">${sku}</span>` : ''}`;

  const orderedRows = (d.items || []).map((item: any) => `
    <tr>
      <td>${productCell(item.productName, item.size, item.productSku)}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${fmt(item.unitPrice)}</td>
      <td class="num">${fmt(item.lineTotal)}</td>
    </tr>`).join('');
  const orderedFooter = `<tr class="footer-row"><td colspan="3" class="num-label">Original PO Total</td><td class="num"><strong>${fmt(d.totalAmount)}</strong></td></tr>`;

  const hasGrns = d.grns && d.grns.length > 0 && d.reconciliation?.hasGrns;

  const receivedRows = hasGrns ? (d.items || []).map((item: any) => {
    const recQty = parseFloat(item.receivedQuantity) || 0;
    const ordQty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const short = recQty < ordQty;
    return `<tr${short ? ' class="short-row"' : ''}>
      <td>${productCell(item.productName, item.size, item.productSku)}</td>
      <td class="num">${recQty}${short ? ' ⚠' : ''}</td>
      <td class="num">${fmt(unitPrice)}</td>
      <td class="num">${fmt(recQty * unitPrice)}</td>
    </tr>`;
  }).join('') : '';
  const receivedTotal = hasGrns ? (d.items || []).reduce((s: any, i: any) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0) : 0;
  const receivedFooter = `<tr class="footer-row"><td colspan="3" class="num-label">Received Total</td><td class="num"><strong>${fmt(receivedTotal)}</strong></td></tr>`;

  const grnSections = hasGrns ? d.grns.filter((g: any) => g.items && g.items.length > 0).map((grn: any) => {
    const grnShort = grn.items.some((i: any) => (parseInt(i.receivedQuantity) || 0) < (parseInt(i.orderedQuantity) || 0));
    const grnTotal = grn.items.reduce((s: any, i: any) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0);
    const itemRows = grn.items.map((item: any) => {
      const recQty = parseInt(item.receivedQuantity) || 0;
      const ordQty = parseInt(item.orderedQuantity) || 0;
      const short = recQty < ordQty;
      return `<tr${short ? ' class="short-row"' : ''}>
        <td>${productCell(item.productName, item.productSize, item.productSku)}</td>
        <td class="num">${ordQty}</td>
        <td class="num">${recQty}${short ? ' ⚠' : ''}</td>
        <td class="num">${fmt(item.unitPrice)}</td>
        <td class="num">${fmt(recQty * parseFloat(item.unitPrice || 0))}</td>
      </tr>`;
    }).join('');
    return `
      <div class="section">
        <h3 class="grn-header ${grnShort ? 'grn-short' : 'grn-full'}">
          ${grn.receiptNumber || `GRN-${grn.id}`}
          <span class="grn-date">&nbsp;—&nbsp;${fmtDate(grn.receivedDate)}</span>
          <span class="grn-badge ${grnShort ? 'badge-short' : 'badge-full'}">${grnShort ? '⚠ Short delivery' : '✓ Full delivery'}</span>
        </h3>
        <table class="data-table">
          <thead><tr><th>Product</th><th class="num">Qty Ordered</th><th class="num">Qty Received</th><th class="num">Unit Price</th><th class="num">Received Value</th></tr></thead>
          <tbody>${itemRows}<tr class="footer-row"><td colspan="4" class="num-label">Receipt Total</td><td class="num"><strong>${fmt(grnTotal)}</strong></td></tr></tbody>
        </table>
      </div>`;
  }).join('') : '';

  const recon = d.reconciliation;
  const reconSection = hasGrns ? `
    <div class="section section-compact recon-box ${recon.isShortDelivery ? 'recon-short' : 'recon-full'}">
      <h3>${recon.isShortDelivery ? '⚠ Short Delivery' : '✓ Fully Delivered'}</h3>
      <table class="recon-table">
        <tr><td>Original PO Value</td><td class="num">${fmt(recon.originalTotal)}</td></tr>
        <tr><td>Received Value</td><td class="num">${fmt(recon.receivedTotal)}</td></tr>
        ${recon.isShortDelivery ? `<tr class="short-row"><td>Short by</td><td class="num">${fmt(recon.difference)}</td></tr>` : ''}
        <tr class="payable-row"><td><strong>Payable Value</strong></td><td class="num"><strong>${fmt(recon.receivedTotal)}</strong></td></tr>
      </table>
      <p class="recon-note">The original PO value is preserved as issued. Reconciliation shows what was actually received.</p>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>GRN Summary - ${d.poNumber}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 15mm 22mm 15mm; @bottom-center { content: "Page " counter(page); font-size: 8pt; color: #888; } }
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 24px 40px; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print { body { margin: 0; } }
    .doc-header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 12px; }
    .doc-header h1 { font-size: 20pt; margin: 0 0 4px; }
    .doc-header h2 { font-size: 14pt; margin: 0 0 2px; color: #333; }
    .doc-header h3 { font-size: 11pt; margin: 0; color: #666; font-weight: normal; }
    .section { margin-bottom: 20px; }
    .section-compact { page-break-inside: avoid; }
    h2.section-title { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.05em; color: #555; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    .info-table th { text-align: left; color: #666; font-weight: normal; width: 160px; padding: 3px 0; }
    .info-table td { padding: 3px 0; font-weight: 600; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .data-table th { background: #f5f5f5; border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 9pt; }
    .data-table td { border: 1px solid #ccc; padding: 5px 8px; }
    .data-table tr { page-break-inside: avoid; break-inside: avoid; }
    .data-table .num { text-align: right; }
    .data-table .num-label { text-align: right; font-style: italic; color: #555; }
    .footer-row td { background: #f9f9f9; font-weight: 600; }
    .short-row td { background: #fffbeb; }
    .size-text { font-size: 8pt; color: #666; }
    .sku { font-size: 8pt; color: #888; }
    .grn-header { font-size: 10pt; margin: 0 0 6px; display: flex; align-items: center; gap: 6px; }
    .grn-date { color: #555; font-weight: normal; }
    .grn-badge { font-size: 8pt; padding: 2px 6px; border-radius: 3px; margin-left: auto; }
    .badge-short { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
    .badge-full { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
    .recon-box { border: 1px solid; border-radius: 4px; padding: 12px; }
    .recon-short { border-color: #fcd34d; background: #fffbeb; }
    .recon-full { border-color: #6ee7b7; background: #f0fdf4; }
    .recon-box h3 { margin: 0 0 8px; font-size: 11pt; }
    .recon-table { width: 100%; border-collapse: collapse; }
    .recon-table td { padding: 4px 0; }
    .recon-table .num { text-align: right; }
    .payable-row td { border-top: 1px solid #ccc; padding-top: 6px; font-size: 12pt; }
    .recon-note { font-size: 8pt; color: #666; margin: 8px 0 0; }
    .doc-footer { margin-top: 30px; font-size: 8pt; color: #888; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="doc-header">
    <h1>Purchase Order</h1>
    <h2>${d.poNumber}</h2>
    <h3>Goods Receipt Summary</h3>
  </div>

  <div class="section section-compact">
    <h2 class="section-title">Purchase Order Details</h2>
    <table class="info-table">
      <tr><th>Brand</th><td>${d.supplierName || '—'}</td></tr>
      <tr><th>Currency</th><td>${currency}</td></tr>
      <tr><th>Order Date</th><td>${fmtDate(d.orderDate)}</td></tr>
      ${d.expectedDelivery ? `<tr><th>Expected Delivery</th><td>${fmtDate(d.expectedDelivery)}</td></tr>` : ''}
      <tr><th>Status</th><td>${(d.status || '').toUpperCase()}</td></tr>
      <tr><th>Payment Status</th><td>${(d.paymentStatus || '—').toUpperCase()}</td></tr>
      ${d.notes ? `<tr><th>Notes</th><td>${d.notes}</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <h2 class="section-title">Items Ordered</h2>
    <table class="data-table">
      <thead><tr><th>Product</th><th class="num">Qty Ordered</th><th class="num">Unit Price</th><th class="num">Line Total</th></tr></thead>
      <tbody>${orderedRows}${orderedFooter}</tbody>
    </table>
  </div>

  ${hasGrns ? `<div class="section">
    <h2 class="section-title">Items Received</h2>
    <table class="data-table">
      <thead><tr><th>Product</th><th class="num">Qty Received</th><th class="num">Unit Price</th><th class="num">Received Value</th></tr></thead>
      <tbody>${receivedRows}${receivedFooter}</tbody>
    </table>
  </div>` : ''}

  ${hasGrns ? `<div class="section"><h2 class="section-title">Goods Receipts</h2>${grnSections}</div>` : ''}

  ${reconSection}

  <div class="doc-footer">
    <p>Generated on: ${format(new Date(), 'dd/MM/yy HH:mm')}</p>
  </div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  printWindow?.document.write(html);
  printWindow?.document.close();
};
