import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const exportToCsv = (data, filename) => {
  if (!data || data.length === 0) {
    console.error("No data to export.");
    return;
  }

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        let value = row[header];
        if (value === null || value === undefined) {
          value = '';
        } else if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const exportToXLSX = (data, filename, sheetName = 'Sheet1') => {
  if (!data || data.length === 0) {
    console.error("No data to export.");
    return;
  }

  // Create workbook and worksheet
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Generate filename with timestamp
  const timestampedFilename = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  
  // Write and download the file
  XLSX.writeFile(workbook, timestampedFilename);
};

export const exportToPDF = (data, filename, title = 'Export', columns = null) => {
  if (!data || data.length === 0) {
    console.error("No data to export.");
    return;
  }

  try {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    
    // Add timestamp
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
    
    // Prepare table data
    const headers = columns || Object.keys(data[0]);
    const tableData = data.map(row => 
      headers.map(header => {
        const value = row[header];
        return value !== null && value !== undefined ? String(value) : '';
      })
    );
    
    // Add table
    doc.autoTable({
      head: [headers],
      body: tableData,
      startY: 40,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [51, 51, 51],
        textColor: 255,
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { top: 40 }
    });
    
    // Generate filename with timestamp
    const timestampedFilename = `${filename}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    // Save the PDF
    doc.save(timestampedFilename);
    
  } catch (error) {
    console.error("PDF export error:", error);
    throw error;
  }
};

export const exportPurchaseOrderToPDF = async (purchaseOrder) => {
  console.log('Purchase Order data:', purchaseOrder);
  
  try {
    // Get company settings dynamically
    let companyInfo = {
      companyName: 'SUPERNATURE LLC',
      address: 'Al Rukhaimi Building\nSheikh Zayed Road\nDubai\nU.A.E.',
      phone: '+971 4 4582211',
      email: 'info@supernaturellc.com',
      website: '',
      vatNumber: '100042339000003',
      currency: 'GBP',
      logo: null
    };
    
    // Fetch supplier/brand information 
    let supplierInfo = {
      name: purchaseOrder.supplierName || 'Unknown Supplier',
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
            currency: 'GBP',
            logo: settings.logo || null
          };
        }
      }

      if (supplierResponse.ok) {
        const suppliers = await supplierResponse.json();
        const supplier = suppliers.find(s => s.id === purchaseOrder.supplierId);
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
      
    } catch (err) {
      console.warn('Could not fetch company/supplier settings, using defaults');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 30;
    
    // Title centered at top - exactly like the reference format
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', pageWidth / 2, currentY, { align: 'center' });
    
    currentY += 20;
    
    // Two column layout: Company info left, PO details right
    // Left column - Company information
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(companyInfo.companyName, 14, currentY);
    
    let leftY = currentY + 6;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    // Company address (multi-line)
    const addressLines = companyInfo.address.split('\n');
    addressLines.forEach(line => {
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
    doc.setFont(undefined, 'normal');
    
    // PO Number with spacing like the reference
    doc.text('PO Number', 130, rightY);
    doc.text(purchaseOrder.poNumber, 175, rightY);
    
    rightY += 10;
    doc.text('PO Date', 130, rightY);
    const orderDate = purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB') : '';
    if (orderDate) {
      doc.text(orderDate, 175, rightY);
    }

    rightY += 10;
    doc.text('Expected Delivery', 130, rightY);
    const expectedDelivery = purchaseOrder.expectedDelivery ? new Date(purchaseOrder.expectedDelivery).toLocaleDateString('en-GB') : '';
    if (expectedDelivery) {
      doc.text(expectedDelivery, 175, rightY);
    }

    // Set currentY to give proper spacing after both columns
    currentY = Math.max(leftY, rightY) + 25;
    
    // Table exactly matching the reference format
    const tableData = (purchaseOrder.items || []).map(item => [
      item.product_code || '',
      item.description || '',
      item.size || '',
      String(item.quantity || 0),
      parseFloat(item.unit_price || 0).toFixed(2),
      parseFloat(item.line_total || 0).toFixed(2)
    ]);

    autoTable(doc, {
      head: [['Product\nCode', 'Description', 'Size', 'Qty', 'Unit Price\n(GBP)', 'Line Total\n(GBP)']],
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
      drawHorizontalLine: (lineIndex, startX, endX, startY, endY, doc) => {
        // Draw top border, header separator, and bottom border only
        return lineIndex === 0 || lineIndex === 1 || lineIndex === tableData.length + 1;
      },
      drawVerticalLine: () => false, // No vertical lines like in the reference
      margin: { left: 14, right: 14 }
    });
    
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
    doc.setFont(undefined, 'normal');
    doc.text(`Subtotal`, rightMargin - 50, currentY);
    doc.text(`GBP ${total.toFixed(2)}`, rightMargin, currentY, { align: 'right' });
    
    currentY += 10;
    
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Total`, rightMargin - 50, currentY);
    doc.text(`GBP ${total.toFixed(2)}`, rightMargin, currentY, { align: 'right' });
    
    // Footer
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text(`Page 1/1`, pageWidth / 2 - 10, pageHeight - 15);
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};