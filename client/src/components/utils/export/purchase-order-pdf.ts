import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtShort } from './shared';

export const exportPurchaseOrderToPDF = async (purchaseOrder: any) => {
  try {
    // Get company settings dynamically
    let companyInfo = {
      companyName: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      vatNumber: '',
      currency: 'AED',
      logo: null
    };
    
    // Fetch supplier/brand information 
    let supplierInfo = {
      name: purchaseOrder.supplierName || 'Unknown Brand',
      address: '',
      phone: '',
      email: '',
      contactPerson: ''
    };

    try {
      const [settingsResponse, supplierResponse] = await Promise.all([
        fetch('/api/company-settings', { credentials: 'include' }),
        fetch('/api/suppliers', { credentials: 'include' })
      ]);
      
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json();
        if (settings) {
          companyInfo = {
            companyName: settings.companyName || companyInfo.companyName,
            address: settings.address || companyInfo.address,
            phone: settings.phone || companyInfo.phone,
            email: settings.email || companyInfo.email,
            website: settings.website || companyInfo.website,
            vatNumber: settings.vatNumber || companyInfo.vatNumber,
            currency: purchaseOrder.currency || 'AED',
            logo: settings.logo || null
          };
        }
      }

      if (supplierResponse.ok) {
        const suppliers = await supplierResponse.json();
        const supplier = suppliers.find((s: any) => s.id === purchaseOrder.supplierId);
        if (supplier) {
          supplierInfo = {
            name: supplier.name || supplierInfo.name,
            address: supplier.address || '',
            phone: supplier.phone || '',
            email: supplier.email || '',
            contactPerson: supplier.contactPerson || ''
          };
        }
      }
      
    } catch {
      // fall back to empty company/supplier settings defaults
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 30;
    
    // Title centered at top - exactly like the reference format
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE ORDER', pageWidth / 2, currentY, { align: 'center' });
    
    currentY += 20;
    
    // Two column layout: Company info left, PO details right
    // Left column - Company information
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo.companyName, 14, currentY);
    
    let leftY = currentY + 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Company address (multi-line)
    const addressLines = companyInfo.address.split('\n');
    addressLines.forEach((line: any) => {
      if (line.trim()) {
        doc.text(line.trim(), 14, leftY);
        leftY += 5;
      }
    });
    
    leftY += 2; // Extra space before phone
    if (companyInfo.phone) {
      doc.text(`Tel: ${companyInfo.phone}`, 14, leftY);
      leftY += 5;
    }
    if (companyInfo.email) {
      doc.text(`Email: ${companyInfo.email}`, 14, leftY);
      leftY += 5;
    }
    if (companyInfo.vatNumber) {
      doc.text(`TRN: ${companyInfo.vatNumber}`, 14, leftY);
      leftY += 5;
    }

    // Right column - PO details with proper alignment
    let rightY = currentY;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // PO Number with spacing like the reference
    doc.text('PO Number', 130, rightY);
    doc.text(purchaseOrder.poNumber, 175, rightY);
    
    rightY += 10;
    doc.text('PO Date', 130, rightY);
    const orderDate = fmtShort(purchaseOrder.orderDate);
    if (orderDate) {
      doc.text(orderDate, 175, rightY);
    }

    rightY += 10;
    doc.text('Expected Delivery', 130, rightY);
    const expectedDelivery = fmtShort(purchaseOrder.expectedDelivery);
    if (expectedDelivery) {
      doc.text(expectedDelivery, 175, rightY);
    }

    // Set currentY to give proper spacing after both columns
    currentY = Math.max(leftY, rightY) + 25;
    
    // Table exactly matching the reference format
    const tableData = (purchaseOrder.items || []).map((item: any) => [
      item.product_code || '',
      item.description || '',
      item.size || '',
      String(item.quantity || 0),
      parseFloat(item.unit_price || 0).toFixed(2),
      parseFloat(item.line_total || 0).toFixed(2)
    ]);

    const poCurrency = purchaseOrder.currency || 'AED';
    autoTable(doc, ({
      head: [['Product\nCode', 'Description', 'Size', 'Qty', `Unit Price\n(${poCurrency})`, `Line Total\n(${poCurrency})`]],
      body: tableData,
      startY: currentY,
      theme: 'plain',
      styles: {
        fontSize: 10,
        cellPadding: 4,
        lineWidth: 0.5,
        lineColor: [0, 0, 0],
        textColor: [0, 0, 0]
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
        fontStyle: 'normal',
        fontSize: 10,
        lineWidth: 0.5,
        lineColor: [0, 0, 0]
      },
      columnStyles: {
        0: { cellWidth: 22, halign: 'left' }, // Product Code
        1: { cellWidth: 55, halign: 'left' }, // Description
        2: { cellWidth: 20, halign: 'left' }, // Size
        3: { cellWidth: 12, halign: 'center' }, // Qty
        4: { cellWidth: 22, halign: 'right' }, // Unit Price
        5: { cellWidth: 22, halign: 'right' }  // Line Total
      },
      drawHorizontalLine: (lineIndex: any, startX: any, endX: any, startY: any, endY: any, doc: any) => {
        // Draw top border, header separator, and bottom border only
        return lineIndex === 0 || lineIndex === 1 || lineIndex === tableData.length + 1;
      },
      drawVerticalLine: () => false, // No vertical lines like in the reference
      margin: { left: 14, right: 14 }
    } as any));
    
    // Calculate the end position manually
    const rowHeight = 15;
    const headerHeight = 15;
    const tableRows = (purchaseOrder.items || []).length;
    currentY = currentY + headerHeight + (tableRows * rowHeight) + 25;
    
    // Totals section - exactly matching the reference format
    const total = parseFloat(purchaseOrder.totalAmount || 0);
    
    // Right-align totals with proper spacing
    const rightMargin = pageWidth - 14;
    
    currentY += 10;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Subtotal`, rightMargin - 50, currentY);
    doc.text(`${poCurrency} ${total.toFixed(2)}`, rightMargin, currentY, { align: 'right' });
    
    currentY += 10;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total`, rightMargin - 50, currentY);
    doc.text(`${poCurrency} ${total.toFixed(2)}`, rightMargin, currentY, { align: 'right' });
    
    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Page 1/1`, pageWidth / 2 - 10, pageHeight - 15);
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error: any) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};
