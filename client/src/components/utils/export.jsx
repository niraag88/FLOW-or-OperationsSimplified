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
    // Get company settings first
    let companyInfo = {
      companyName: 'SUPERNATURE LLC',
      address: 'Dubai, UAE',
      phone: '+971 4 4582211',
      email: 'info@supernaturellc.com',
      vatNumber: '100042339000003',
      currency: 'GBP'
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
            currency: settings.currency || companyInfo.currency
          };
        }
      }
    } catch (err) {
      console.warn('Could not fetch company settings, using defaults');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 20;
    
    // Header Section
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', 14, currentY);
    
    // Company Logo (right side) - for now use placeholder, logo support can be enhanced later
    doc.setFontSize(10);
    if (companyInfo.logo) {
      doc.text('[Company Logo]', pageWidth - 45, currentY);
    } else {
      doc.text('Company Logo', pageWidth - 40, currentY);
    }
    
    currentY += 20;
    
    // PO Number and Order Date (left side)
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`PO Number: ${purchaseOrder.poNumber}`, 14, currentY);
    
    const orderDate = purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB') : 'N/A';
    currentY += 6;
    doc.text(`Order Date: ${orderDate}`, 14, currentY);
    
    // Company Information (right side) - fix overlap with proper spacing
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    const companyStartY = currentY - 6;
    doc.text(companyInfo.companyName, pageWidth - 80, companyStartY);
    
    doc.setFont(undefined, 'normal');
    // Split address properly if it's long
    const addressLines = companyInfo.address.split(',').map(line => line.trim());
    addressLines.forEach((line, index) => {
      doc.text(line, pageWidth - 80, companyStartY + 8 + (index * 6));
    });
    
    const addressHeight = addressLines.length * 6;
    doc.text(`Tel: ${companyInfo.phone}`, pageWidth - 80, companyStartY + 8 + addressHeight + 6);
    doc.text(`Email: ${companyInfo.email}`, pageWidth - 80, companyStartY + 8 + addressHeight + 12);
    if (companyInfo.vatNumber) {
      doc.text(`TRN: ${companyInfo.vatNumber}`, pageWidth - 80, companyStartY + 8 + addressHeight + 18);
    }
    
    currentY += 50;
    
    // Horizontal line separator
    doc.setDrawColor(0, 0, 0);
    doc.line(14, currentY, pageWidth - 14, currentY);
    currentY += 15;
    
    // Supplier/Brand Section and Currency/Status
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('SUPPLIER/BRAND', 14, currentY);
    doc.text(`Currency: ${companyInfo.currency}`, pageWidth - 60, currentY);
    
    currentY += 8;
    doc.setFont(undefined, 'normal');
    doc.text(purchaseOrder.supplierName || 'Unknown Supplier', 14, currentY);
    doc.text(`Status: ${purchaseOrder.status}`, pageWidth - 60, currentY);
    
    // Add supplier contact info if available
    currentY += 10;
    doc.text('Contact: [Contact Name]', 14, currentY);
    currentY += 6;
    doc.text('Email: [Contact Email]', 14, currentY);
    
    currentY += 15;
    
    // Items Table Header
    const tableStartY = currentY;
    const colWidths = [35, 70, 20, 35, 35];
    const colPositions = [14, 49, 119, 139, 174];
    
    // Table header background (light gray)
    doc.setFillColor(240, 240, 240);
    doc.rect(14, currentY - 2, pageWidth - 28, 10, 'F');
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Product Code', colPositions[0], currentY + 6);
    doc.text('Description', colPositions[1], currentY + 6);
    doc.text('Qty', colPositions[2], currentY + 6);
    doc.text(`Unit Price (${companyInfo.currency})`, colPositions[3], currentY + 6);
    doc.text(`Line Total (${companyInfo.currency})`, colPositions[4], currentY + 6);
    
    currentY += 12;
    
    // Table borders
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    
    // Vertical lines
    colPositions.forEach(pos => {
      doc.line(pos - 2, tableStartY - 2, pos - 2, currentY + (purchaseOrder.items?.length || 0) * 8 + 2);
    });
    doc.line(pageWidth - 14, tableStartY - 2, pageWidth - 14, currentY + (purchaseOrder.items?.length || 0) * 8 + 2);
    
    // Items
    doc.setFont(undefined, 'normal');
    (purchaseOrder.items || []).forEach((item, index) => {
      // Horizontal line
      if (index > 0) {
        doc.line(14, currentY - 2, pageWidth - 14, currentY - 2);
      }
      
      doc.text(item.product_code || '', colPositions[0], currentY + 6);
      doc.text(item.description || '', colPositions[1], currentY + 6);
      doc.text(String(item.quantity || 0), colPositions[2] + 10, currentY + 6);
      doc.text(parseFloat(item.unit_price || 0).toFixed(2), colPositions[3] + 15, currentY + 6);
      doc.text(parseFloat(item.line_total || 0).toFixed(2), colPositions[4] + 15, currentY + 6);
      
      currentY += 8;
    });
    
    // Bottom table border
    doc.line(14, currentY + 2, pageWidth - 14, currentY + 2);
    
    currentY += 15;
    
    // Subtotal and Total
    const subtotal = parseFloat(purchaseOrder.totalAmount || 0);
    doc.setFont(undefined, 'normal');
    doc.text('Subtotal:', pageWidth - 80, currentY);
    doc.text(`${subtotal.toFixed(2)} ${companyInfo.currency}`, pageWidth - 40, currentY);
    
    currentY += 8;
    doc.text('0', pageWidth - 40, currentY); // VAT or other charges line
    
    currentY += 10;
    doc.setFont(undefined, 'bold');
    doc.text('Total:', pageWidth - 80, currentY);
    doc.text(`${subtotal.toFixed(2)} ${companyInfo.currency}`, pageWidth - 40, currentY);
    
    // No signature section needed for purchase orders
    
    // Calculate total pages needed based on content
    const itemsPerPage = Math.floor((pageHeight - 200) / 8); // Approximate items per page
    const totalPages = Math.max(1, Math.ceil((purchaseOrder.items?.length || 1) / itemsPerPage));
    
    // Footer with page numbers
    const addFooter = (currentPage = 1) => {
      doc.setFontSize(8);
      doc.text(`Page ${currentPage}/${totalPages}`, pageWidth / 2 - 10, pageHeight - 10);
    };
    
    addFooter();
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};