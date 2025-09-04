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

export const exportPurchaseOrderToPDF = (purchaseOrder) => {
  try {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(20);
    doc.text('PURCHASE ORDER', 14, 25);
    
    // Add company info
    doc.setFontSize(12);
    doc.text('SUPERNATURE LLC', 150, 25);
    
    // Add PO details
    doc.setFontSize(12);
    doc.text(`PO Number: ${purchaseOrder.poNumber}`, 14, 40);
    
    // Format dates safely
    let orderDateText = 'N/A';
    if (purchaseOrder.orderDate) {
      try {
        const orderDate = new Date(purchaseOrder.orderDate);
        orderDateText = orderDate.toLocaleDateString('en-GB');
      } catch (error) {
        console.warn('Invalid order date:', purchaseOrder.orderDate);
      }
    }
    doc.text(`Order Date: ${orderDateText}`, 14, 50);
    
    if (purchaseOrder.expectedDelivery) {
      try {
        const deliveryDate = new Date(purchaseOrder.expectedDelivery);
        doc.text(`Expected Delivery: ${deliveryDate.toLocaleDateString('en-GB')}`, 14, 60);
      } catch (error) {
        console.warn('Invalid delivery date:', purchaseOrder.expectedDelivery);
      }
    }
    
    doc.text(`Supplier: ${purchaseOrder.supplierName || 'Unknown'}`, 14, 70);
    doc.text(`Status: ${purchaseOrder.status}`, 14, 80);
    
    // Add line items header
    doc.setFontSize(10);
    doc.text('Line Items:', 14, 100);
    
    // Add line items manually (simpler approach without autoTable)
    let yPosition = 110;
    doc.text('Product Code', 14, yPosition);
    doc.text('Description', 60, yPosition);
    doc.text('Qty', 130, yPosition);
    doc.text('Unit Price', 150, yPosition);
    doc.text('Line Total', 180, yPosition);
    
    yPosition += 10;
    
    // Add each item
    (purchaseOrder.items || []).forEach(item => {
      doc.text(item.product_code || '', 14, yPosition);
      doc.text(item.description || '', 60, yPosition);
      doc.text(String(item.quantity || 0), 130, yPosition);
      doc.text(`£${parseFloat(item.unit_price || 0).toFixed(2)}`, 150, yPosition);
      doc.text(`£${parseFloat(item.line_total || 0).toFixed(2)}`, 180, yPosition);
      yPosition += 10;
    });
    
    // Add total
    yPosition += 10;
    doc.setFontSize(12);
    doc.text(`Total: GBP £${parseFloat(purchaseOrder.totalAmount || 0).toFixed(2)}`, 14, yPosition);
    
    // Add notes if any
    if (purchaseOrder.notes) {
      yPosition += 20;
      doc.text(`Notes: ${purchaseOrder.notes}`, 14, yPosition);
    }
    
    // Download the PDF
    doc.save(`purchase-order-${purchaseOrder.poNumber}.pdf`);
    
  } catch (error) {
    console.error("Purchase Order PDF export error:", error);
    throw error;
  }
};