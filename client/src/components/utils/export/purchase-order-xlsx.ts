import ExcelJS from 'exceljs';
import { downloadXLSX, fmtShort } from './shared';

export const exportPODetailToXLSX = async (poId: any, poNumber: any) => {
  const res = await fetch(`/api/purchase-orders/${poId}/detail`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load PO detail');
  const d = await res.json();
  // Use the snapshot captured at creation time; fall back to live settings for older POs
  let company = d.companySnapshot || null;
  if (!company) {
    const companyRes = await fetch('/api/company-settings', { credentials: 'include' });
    company = companyRes.ok ? await companyRes.json() : null;
  }
  const currency = d.currency || 'AED';
  const fmtDate = (s: any) => fmtShort(s);
  const fmtNum = (n: any) => parseFloat(n || 0).toFixed(2);

  const rows: any[] = [];

  rows.push(['PURCHASE ORDER', '', '', '']);
  if (company?.companyName) rows.push([company.companyName, '', '', '']);
  if (company?.vatNumber) rows.push([`TRN: ${company.vatNumber}`, '', '', '']);
  if (company?.address) rows.push([company.address.replace(/\n/g, ', '), '', '', '']);
  if (company?.phone) rows.push([`Tel: ${company.phone}`, '', '', '']);
  if (company?.email) rows.push([`Email: ${company.email}`, '', '', '']);
  rows.push([]);
  rows.push(['PO Number:', d.poNumber || '', '', '']);
  rows.push(['Brand:', d.supplierName || '', '', '']);
  rows.push(['Currency:', currency, '', '']);
  rows.push(['Order Date:', fmtDate(d.orderDate), '', '']);
  if (d.expectedDelivery) rows.push(['Expected Delivery:', fmtDate(d.expectedDelivery), '', '']);
  rows.push(['Status:', (d.status || '').toUpperCase(), '', '']);
  rows.push(['Payment Status:', (d.paymentStatus || '').toUpperCase(), '', '']);
  if (d.notes) rows.push(['Notes:', d.notes, '', '']);

  rows.push([]);
  rows.push(['ITEMS ORDERED', '', '', '', '', '']);
  rows.push(['Product', 'Product Code', 'Qty Ordered', `Unit Price (${currency})`, `Line Total (${currency})`]);
  for (const item of (d.items || [])) {
    rows.push([
      item.productName || '—',
      item.productSku || '',
      item.quantity || 0,
      fmtNum(item.unitPrice),
      fmtNum(item.lineTotal),
    ]);
  }
  rows.push(['', '', '', 'Original PO Total:', fmtNum(d.totalAmount)]);

  const recon = d.reconciliation;
  const hasGrns = recon?.hasGrns && d.grns && d.grns.length > 0;

  if (hasGrns) {
    rows.push([]);
    rows.push(['GOODS RECEIPTS', '', '', '', '', '']);

    for (const grn of d.grns.filter((g: any) => g.items && g.items.length > 0)) {
      const grnShort = grn.items.some(
        (i: any) => (parseInt(i.receivedQuantity) || 0) < (parseInt(i.orderedQuantity) || 0)
      );
      const grnTotal = grn.items.reduce(
        (s: any, i: any) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0
      );
      rows.push([]);
      rows.push([
        grn.receiptNumber || `GRN-${grn.id}`,
        grn.receivedDate ? fmtDate(grn.receivedDate) : '',
        grnShort ? 'Short delivery' : 'Full delivery',
        '', '',
      ]);
      rows.push(['Product', 'Product Code', 'Qty Ordered', 'Qty Received', `Unit Price (${currency})`, `Received Value (${currency})`]);
      for (const item of grn.items) {
        const recQty = parseInt(item.receivedQuantity) || 0;
        const ordQty = parseInt(item.orderedQuantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        rows.push([
          item.productName || '—',
          item.productSku || '',
          ordQty,
          recQty,
          fmtNum(price),
          fmtNum(recQty * price),
        ]);
      }
      rows.push(['', '', '', '', 'Receipt Total:', fmtNum(grnTotal)]);
    }

    rows.push([]);
    rows.push(['RECONCILIATION', '', '', '']);
    rows.push(['Original PO Value:', fmtNum(recon.originalTotal), '', '']);
    rows.push(['Received Value:', fmtNum(recon.receivedTotal), '', '']);
    if (recon.isShortDelivery) {
      rows.push(['Short by:', fmtNum(recon.difference), '', '']);
    }
    rows.push(['Payable Value:', fmtNum(recon.receivedTotal), '', '']);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Purchase Order');
  ws.columns = [
    { width: 28 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
  ];
  for (const row of rows) {
    ws.addRow(row);
  }
  await downloadXLSX(wb, `PO_${d.poNumber}_${new Date().toISOString().split('T')[0]}.xlsx`);
};
