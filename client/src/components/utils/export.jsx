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
  try {
    // Get company settings dynamically
    let companyInfo = {
      companyName: 'SUPERNATURE LLC',
      address: 'Al Rukhaimi Building, Sheikh Zayed Road, Dubai, U.A.E.',
      phone: '+971 4 4582211',
      email: 'info@supernaturellc.com',
      vatNumber: '100042339000003',
      currency: 'GBP',
      logo: null
    };
    
    try {
      const response = await fetch('/api/company-settings', {
        credentials: 'include'
      });
      if (response.ok) {
        const settings = await response.json();
        if (settings) {
          companyInfo = {
            companyName: settings.companyName || companyInfo.companyName,
            address: settings.address || companyInfo.address,
            phone: settings.phone || companyInfo.phone,
            email: settings.email || companyInfo.email,
            vatNumber: settings.vatNumber || companyInfo.vatNumber,
            currency: 'GBP', // Always use GBP for purchase orders
            logo: settings.logo || null
          };
        }
      }
    } catch (err) {
      console.warn('Could not fetch company settings, using defaults');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 30;
    
    // Header with clean line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(14, 20, pageWidth - 14, 20);
    
    // Title and Logo section
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', 14, currentY);
    
    // Company Logo - load actual logo from settings
    if (companyInfo.logo) {
      try {
        // Create a function to load logo as base64
        const loadLogoAsBase64 = () => {
          return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = this.width;
              canvas.height = this.height;
              ctx.drawImage(this, 0, 0);
              const dataURL = canvas.toDataURL('image/png');
              resolve(dataURL);
            };
            img.onerror = () => reject(new Error('Failed to load logo'));
            const logoUrl = companyInfo.logo.startsWith('http') ? companyInfo.logo : `/api/files/${companyInfo.logo}`;
            img.src = logoUrl;
          });
        };
        
        // Try to load logo synchronously for PDF
        const logoBase64 = await loadLogoAsBase64();
        doc.addImage(logoBase64, 'PNG', pageWidth - 55, currentY - 15, 35, 20);
      } catch (error) {
        console.warn('Could not load logo, using placeholder:', error);
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('[Logo]', pageWidth - 25, currentY - 5);
      }
    }
    
    currentY += 25;
    
    // Two-column layout for PO details and Company info
    // Left column - PO Information
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`PO Number: ${purchaseOrder.poNumber}`, 14, currentY);
    
    const orderDate = purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB') : '';
    if (orderDate) {
      currentY += 8;
      doc.text(`Order Date: ${orderDate}`, 14, currentY);
    }
    
    // Right column - Company Information (properly spaced)
    const rightColX = 120;
    let rightY = currentY - (orderDate ? 8 : 0);
    
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(companyInfo.companyName, rightColX, rightY);
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    rightY += 8;
    
    // Split and display address properly
    const addressLines = companyInfo.address.replace(/,\s*/g, '\n').split('\n');
    addressLines.forEach((line) => {
      if (line.trim()) {
        doc.text(line.trim(), rightColX, rightY);
        rightY += 5;
      }
    });
    
    rightY += 3;
    if (companyInfo.phone) {
      doc.text(`Tel: ${companyInfo.phone}`, rightColX, rightY);
      rightY += 5;
    }
    if (companyInfo.email) {
      doc.text(`Email: ${companyInfo.email}`, rightColX, rightY);
      rightY += 5;
    }
    if (companyInfo.vatNumber) {
      doc.text(`TRN: ${companyInfo.vatNumber}`, rightColX, rightY);
      rightY += 5;
    }
    
    currentY = Math.max(currentY, rightY) + 20;
    
    // Separator line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(14, currentY, pageWidth - 14, currentY);
    currentY += 15;
    
    // Supplier section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('SUPPLIER/BRAND', 14, currentY);
    
    currentY += 12;
    doc.setFont(undefined, 'normal');
    doc.text(purchaseOrder.supplierName || 'Unknown Supplier', 14, currentY);
    
    currentY += 20;
    
    // Use autoTable for proper table formatting
    const tableData = (purchaseOrder.items || []).map(item => [
      item.product_code || '',
      item.description || '',
      item.quantity || 0,
      parseFloat(item.unit_price || 0).toFixed(2),
      parseFloat(item.line_total || 0).toFixed(2)
    ]);
    
    doc.autoTable({
      head: [['Product Code', 'Description', 'Qty', 'Unit Price (GBP)', 'Line Total (GBP)']],
      body: tableData,
      startY: currentY,
      theme: 'grid',
      styles: {
        fontSize: 10,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 30 }, // Product Code
        1: { cellWidth: 70 }, // Description
        2: { cellWidth: 20, halign: 'center' }, // Qty
        3: { cellWidth: 35, halign: 'right' }, // Unit Price
        4: { cellWidth: 35, halign: 'right' }  // Line Total
      }
    });
    
    // Get the final Y position after the table
    currentY = doc.lastAutoTable.finalY + 20;
    
    // Total section (clean and simple)
    const total = parseFloat(purchaseOrder.totalAmount || 0);
    
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Total:', pageWidth - 60, currentY);
    doc.text(`GBP ${total.toFixed(2)}`, pageWidth - 30, currentY);
    
    // Footer
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.text('Page 1/1', pageWidth / 2 - 8, pageHeight - 15);
    
    // Footer line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 25, pageWidth - 14, pageHeight - 25);
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};