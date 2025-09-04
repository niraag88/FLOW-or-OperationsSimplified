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
      address: 'Al Rukhaimi Building, Sheikh Zayed Road, Dubai, U.A.E.',
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
            currency: 'GBP' // Always use GBP for purchase orders
          };
        }
      }
    } catch (err) {
      console.warn('Could not fetch company settings, using defaults');
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    let currentY = 25;
    
    // Professional Header
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(14, currentY - 5, pageWidth - 14, currentY - 5);
    
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('PURCHASE ORDER', 14, currentY);
    
    // Logo placeholder (right aligned)
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text('Company Logo', pageWidth - 35, currentY);
    
    currentY += 20;
    
    // Document details and company info in two columns
    // Left column - PO details
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`PO Number: ${purchaseOrder.poNumber}`, 14, currentY);
    
    const orderDate = purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB') : 'N/A';
    currentY += 8;
    doc.text(`Order Date: ${orderDate}`, 14, currentY);
    
    // Right column - Company info
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    const companyX = pageWidth - 90;
    doc.text(companyInfo.companyName, companyX, currentY - 8);
    
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    // Format address properly on separate lines
    const addressParts = companyInfo.address.split(',').map(part => part.trim());
    let addressY = currentY;
    addressParts.forEach((part, index) => {
      doc.text(part, companyX, addressY + (index * 5));
    });
    
    const addressHeight = addressParts.length * 5;
    doc.text(`Tel: ${companyInfo.phone}`, companyX, addressY + addressHeight + 5);
    doc.text(`Email: ${companyInfo.email}`, companyX, addressY + addressHeight + 10);
    if (companyInfo.vatNumber) {
      doc.text(`TRN: ${companyInfo.vatNumber}`, companyX, addressY + addressHeight + 15);
    }
    
    currentY += 40;
    
    // Separator line
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(14, currentY, pageWidth - 14, currentY);
    currentY += 15;
    
    // Supplier section (clean, professional)
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('SUPPLIER/BRAND', 14, currentY);
    
    currentY += 10;
    doc.setFont(undefined, 'normal');
    doc.text(purchaseOrder.supplierName || 'Unknown Supplier', 14, currentY);
    
    // Only add supplier contact info if it exists (remove placeholders)
    currentY += 15;
    
    // Professional items table
    const tableY = currentY;
    
    // Table header with better styling
    doc.setFillColor(245, 245, 245);
    doc.rect(14, currentY, pageWidth - 28, 12, 'F');
    
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(14, currentY, pageWidth - 28, 12);
    
    // Column positions for better alignment
    const cols = {
      code: 16,
      description: 55,
      qty: 135,
      unitPrice: 155,
      total: 180
    };
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text('Product Code', cols.code, currentY + 8);
    doc.text('Description', cols.description, currentY + 8);
    doc.text('Qty', cols.qty, currentY + 8);
    doc.text(`Unit Price (GBP)`, cols.unitPrice, currentY + 8);
    doc.text(`Line Total (GBP)`, cols.total, currentY + 8);
    
    currentY += 12;
    
    // Items
    doc.setFont(undefined, 'normal');
    (purchaseOrder.items || []).forEach((item, index) => {
      // Alternate row colors for better readability
      if (index % 2 === 1) {
        doc.setFillColor(250, 250, 250);
        doc.rect(14, currentY, pageWidth - 28, 10, 'F');
      }
      
      // Table borders
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.rect(14, currentY, pageWidth - 28, 10);
      
      doc.text(item.product_code || '', cols.code, currentY + 7);
      doc.text(item.description || '', cols.description, currentY + 7);
      doc.text(String(item.quantity || 0), cols.qty + 5, currentY + 7);
      doc.text(parseFloat(item.unit_price || 0).toFixed(2), cols.unitPrice + 10, currentY + 7);
      doc.text(parseFloat(item.line_total || 0).toFixed(2), cols.total + 10, currentY + 7);
      
      currentY += 10;
    });
    
    currentY += 15;
    
    // Professional totals section (right aligned)
    const total = parseFloat(purchaseOrder.totalAmount || 0);
    
    // Use proper currency format: GBP 634.00
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Total:', pageWidth - 70, currentY);
    doc.text(`GBP ${total.toFixed(2)}`, pageWidth - 40, currentY);
    
    // Footer with page numbers
    const addFooter = () => {
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Page 1/1`, pageWidth / 2 - 10, pageHeight - 15);
      
      // Professional footer line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 25, pageWidth - 14, pageHeight - 25);
    };
    
    addFooter();
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};