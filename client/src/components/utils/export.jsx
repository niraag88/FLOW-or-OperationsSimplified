import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const fmtShort = (dateStr) => {
  if (!dateStr) return '';
  try { return format(new Date(dateStr), 'dd/MM/yy'); } catch { return ''; }
};

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
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yy HH:mm')}`, 14, 30);
    
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

export const exportQuotationToXLSX = async (quotation) => {
  if (!quotation) {
    console.error("No quotation data to export.");
    return;
  }

  console.log('Starting XLSX export for quotation:', quotation);
  
  try {
    // Get quotation number with fallback
    const quotationNumber = quotation.quotation_number || quotation.quoteNumber || 'UNKNOWN';
    
    // Fetch complete quotation with line items
    let fullQuotation = quotation;
    try {
      const response = await fetch(`/api/quotations/${quotation.id}`, { credentials: 'include' });
      if (response.ok) {
        fullQuotation = await response.json();
        console.log('Fetched complete quotation with items:', fullQuotation);
      } else {
        console.warn('Could not fetch complete quotation, using base quotation data');
      }
    } catch (err) {
      console.warn('Error fetching complete quotation:', err);
    }
    
    // Get company settings dynamically
    let companyInfo = {
      companyName: 'SUPERNATURE LLC',
      address: 'Al Rukhaimi Building\nSheikh Zayed Road\nDubai\nU.A.E.',
      phone: '+971 4 4582211',
      email: 'info@supernaturellc.com',
      website: '',
      vatNumber: '100042339000003',
      currency: 'AED'
    };

    try {
      const settingsResponse = await fetch('/api/company-settings', { credentials: 'include' });
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
            currency: 'AED'
          };
        }
      }
    } catch (err) {
      console.warn('Could not fetch company settings, using defaults:', err);
    }

    console.log('Creating XLSX workbook...');
    
    // Use array of arrays approach to avoid column headers (A, B, C, etc.)
    const exportData = [];
    
    // Document Header
    exportData.push(['QUOTATION', '', '', '', '', '']);
    
    exportData.push([]); // Empty row
    
    // Company Information with document details side by side
    exportData.push([companyInfo.companyName, '', '', 'Quotation Number:', quotationNumber, '']);
    
    const addressLines = companyInfo.address.split('\n');
    addressLines.forEach((line, index) => {
      if (line.trim()) {
        const row = [line.trim(), '', ''];
        if (index === 0) {
          row.push('Date:');
          const quotationDate = fmtShort(fullQuotation.quoteDate || fullQuotation.quotation_date);
          row.push(quotationDate);
        } else if (index === 1) {
          row.push('Customer:');
          row.push(fullQuotation.customerName || fullQuotation.customer_name || '');
        } else if (index === 2 && (fullQuotation.reference || fullQuotation.referenceNumber)) {
          row.push('Reference:');
          row.push(fullQuotation.reference || fullQuotation.referenceNumber);
        }
        exportData.push(row);
      }
    });
    
    if (companyInfo.phone) {
      const phoneRow = [`Tel: ${companyInfo.phone}`, '', ''];
      if (fullQuotation.referenceDate || fullQuotation.reference_date) {
        phoneRow.push('Reference Date:');
        const refDate = fmtShort(fullQuotation.referenceDate || fullQuotation.reference_date);
        phoneRow.push(refDate);
      }
      exportData.push(phoneRow);
    }
    
    if (companyInfo.email) {
      exportData.push([`Email: ${companyInfo.email}`, '', '', '', '', '', '']);
    }
    
    if (companyInfo.vatNumber) {
      exportData.push([`TRN: ${companyInfo.vatNumber}`, '', '', '', '', '', '']);
    }
    
    exportData.push([]); // Empty row
    
    // Table Headers
    exportData.push([
      'Product Code',
      'Brand Name',
      'Description',
      'Size',
      'Quantity',
      'Unit Price (AED)',
      'Line Total (AED)'
    ]);
    
    // Line Items - check both items and lineItems properties
    const items = fullQuotation.items || fullQuotation.lineItems || [];
    if (items.length > 0) {
      items.forEach(item => {
        exportData.push([
          item.productSku || item.productCode || item.product_code || '',
          item.brandName || '',  // Use brandName from API response
          item.description || item.productName || item.product_name || '',
          item.size || '',  // Use size from API response
          item.quantity || 0,
          parseFloat(item.unitPrice || item.unit_price || 0).toFixed(2),
          parseFloat(item.lineTotal || item.line_total || (Number(item.quantity || 0) * Number(item.unitPrice || item.unit_price || 0))).toFixed(2)
        ]);
      });
    }
    
    exportData.push([]); // Empty row
    
    // Totals Section - with comprehensive fallbacks
    // Calculate subtotal with proper fallback logic
    let subtotal = 0;
    
    // First try explicit subtotal fields
    if (fullQuotation.subtotal || fullQuotation.subTotal || fullQuotation.totalBeforeTax) {
      subtotal = parseFloat(fullQuotation.subtotal || fullQuotation.subTotal || fullQuotation.totalBeforeTax || 0);
    } else {
      // Compute from line items (most reliable method)
      if (items.length > 0) {
        subtotal = items.reduce((sum, item) => {
          const lineTotal = parseFloat(item.lineTotal || item.line_total || (Number(item.quantity || 0) * Number(item.unitPrice || item.unit_price || 0)));
          return sum + (isFinite(lineTotal) ? lineTotal : 0);
        }, 0);
      }
      // Only use totalAmount if it's clearly before VAT (when VAT exists and totalAmount != grandTotal)
      if (subtotal === 0 && fullQuotation.totalAmount) {
        const vat = parseFloat(fullQuotation.vatAmount || fullQuotation.vat_amount || fullQuotation.taxAmount || fullQuotation.tax_amount || 0);
        const grand = parseFloat(fullQuotation.grandTotal || 0);
        const total = parseFloat(fullQuotation.totalAmount);
        
        // Only use totalAmount as subtotal if it's different from grandTotal (indicating it's before VAT)
        if (vat > 0 && grand > 0 && Math.abs(total - grand) > 0.01) {
          subtotal = total;
        } else if (vat === 0) {
          // No VAT, so totalAmount is likely the subtotal
          subtotal = total;
        }
      }
    }
    
    exportData.push(['', '', '', '', '', 'Subtotal:', `AED ${subtotal.toFixed(2)}`]);
    
    // VAT with comprehensive fallbacks
    const vatAmount = parseFloat(fullQuotation.vatAmount || fullQuotation.vat_amount || fullQuotation.taxAmount || fullQuotation.tax_amount || 0);
    if (vatAmount > 0) {
      exportData.push(['', '', '', '', '', 'VAT:', `AED ${vatAmount.toFixed(2)}`]);
    }
    
    // Total with fallbacks
    const total = parseFloat(fullQuotation.grandTotal || fullQuotation.total || fullQuotation.totalAmount || (subtotal + vatAmount) || 0);
    exportData.push(['', '', '', '', '', 'TOTAL:', `AED ${total.toFixed(2)}`]);
    
    console.log('Export data prepared:', exportData);
    
    // Create workbook and worksheet using array of arrays (no column headers)
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 15 }, // Product Code
      { width: 20 }, // Brand Name
      { width: 40 }, // Description
      { width: 12 }, // Size
      { width: 10 }, // Quantity
      { width: 18 }, // Unit Price
      { width: 18 }  // Line Total
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Quotation');
    
    // Generate filename with timestamp
    const timestampedFilename = `Quotation_${fullQuotation.quoteNumber || quotationNumber || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    console.log('Saving file as:', timestampedFilename);
    
    // Write and download the file
    XLSX.writeFile(workbook, timestampedFilename);
    
    console.log('XLSX export completed successfully');
    
  } catch (error) {
    console.error("Quotation XLSX export error:", error);
    throw error;
  }
};

export const exportInvoiceToXLSX = async (invoice) => {
  if (!invoice) {
    console.error("No invoice data to export.");
    return;
  }

  try {
    // Create export data using array of arrays for proper structure
    const exportData = [];
    
    // Document Header
    exportData.push(['TAX INVOICE', '', '', '', '', '', '']);
    exportData.push([]); // Empty row
    
    // Invoice details
    exportData.push(['Invoice Number:', invoice.invoice_number || '', '', '', '', '', '']);
    exportData.push(['Invoice Date:', fmtShort(invoice.invoice_date), '', '', '', '', '']);
    exportData.push(['Customer:', invoice.customer_name || 'Unknown Customer', '', '', '', '', '']);
    exportData.push(['Reference:', invoice.reference || '', '', '', '', '', '']);
    exportData.push(['Currency:', invoice.currency || 'AED', '', '', '', '', '']);
    exportData.push(['Status:', invoice.status || '', '', '', '', '', '']);
    
    exportData.push([]); // Empty row
    
    // Table Headers - matching critical currency format standard
    exportData.push([
      'Product Code',
      'Brand Name', 
      'Description',
      'Size',
      'Quantity',
      'Unit Price (AED)',
      'Line Total (AED)'
    ]);
    
    // Line Items
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach(item => {
        exportData.push([
          item.product_code || '',
          item.brand_name || '',
          item.description || '',
          item.size || '',
          item.quantity || 0,
          parseFloat(item.unit_price || 0).toFixed(2),
          parseFloat(item.line_total || 0).toFixed(2)
        ]);
      });
    }
    
    exportData.push([]); // Empty row
    
    // Totals Section - using critical currency format: AED first, then value
    exportData.push(['', '', '', '', '', 'Subtotal:', `AED ${parseFloat(invoice.subtotal || 0).toFixed(2)}`]);
    
    if (invoice.tax_amount && invoice.tax_amount > 0) {
      exportData.push(['', '', '', '', '', 'VAT:', `AED ${parseFloat(invoice.tax_amount || 0).toFixed(2)}`]);
    }
    
    exportData.push(['', '', '', '', '', 'TOTAL:', `AED ${parseFloat(invoice.total_amount || 0).toFixed(2)}`]);
    
    // Create workbook and worksheet using array of arrays
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 15 }, // Product Code
      { width: 20 }, // Brand Name  
      { width: 40 }, // Description
      { width: 12 }, // Size
      { width: 10 }, // Quantity
      { width: 18 }, // Unit Price
      { width: 18 }  // Line Total
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoice');
    
    // Generate filename with timestamp
    const timestampedFilename = `Invoice_${invoice.invoice_number || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Write and download the file
    XLSX.writeFile(workbook, timestampedFilename);
    
  } catch (error) {
    console.error("Invoice XLSX export error:", error);
    throw error;
  }
};

export const exportDeliveryOrderToXLSX = async (deliveryOrder) => {
  if (!deliveryOrder) {
    console.error("No delivery order data to export.");
    return;
  }

  try {
    // Create export data using array of arrays for proper structure
    const exportData = [];
    
    // Document Header  
    exportData.push(['DELIVERY ORDER', '', '', '', '', '', '']);
    exportData.push([]); // Empty row
    
    // DO details
    exportData.push(['DO Number:', deliveryOrder.do_number || '', '', '', '', '', '']);
    exportData.push(['Order Date:', fmtShort(deliveryOrder.order_date), '', '', '', '', '']);
    exportData.push(['Customer:', deliveryOrder.customer_name || 'Unknown Customer', '', '', '', '', '']);
    exportData.push(['Reference:', deliveryOrder.reference || '', '', '', '', '', '']);
    exportData.push(['Reference Date:', fmtShort(deliveryOrder.reference_date), '', '', '', '', '']);
    exportData.push(['Currency:', deliveryOrder.currency || 'AED', '', '', '', '', '']);
    exportData.push(['Status:', deliveryOrder.status || '', '', '', '', '', '']);
    
    exportData.push([]); // Empty row
    
    // Table Headers - matching critical currency format standard
    exportData.push([
      'Product Code',
      'Brand Name',
      'Description', 
      'Size',
      'Quantity',
      'Unit Price (AED)',
      'Line Total (AED)'
    ]);
    
    // Line Items
    if (deliveryOrder.items && deliveryOrder.items.length > 0) {
      deliveryOrder.items.forEach(item => {
        exportData.push([
          item.product_code || '',
          item.brand_name || '',
          item.description || '',
          item.size || '',
          item.quantity || 0,
          parseFloat(item.unit_price || 0).toFixed(2),
          parseFloat(item.line_total || 0).toFixed(2)
        ]);
      });
    }
    
    exportData.push([]); // Empty row
    
    // Totals Section - using critical currency format: AED first, then value
    exportData.push(['', '', '', '', '', 'Subtotal:', `AED ${parseFloat(deliveryOrder.subtotal || 0).toFixed(2)}`]);
    
    if (deliveryOrder.tax_amount && deliveryOrder.tax_amount > 0) {
      exportData.push(['', '', '', '', '', 'VAT:', `AED ${parseFloat(deliveryOrder.tax_amount || 0).toFixed(2)}`]);
    }
    
    exportData.push(['', '', '', '', '', 'TOTAL:', `AED ${parseFloat(deliveryOrder.total_amount || 0).toFixed(2)}`]);
    
    // Create workbook and worksheet using array of arrays
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(exportData);
    
    // Set column widths
    worksheet['!cols'] = [
      { width: 15 }, // Product Code
      { width: 20 }, // Brand Name
      { width: 40 }, // Description
      { width: 12 }, // Size
      { width: 10 }, // Quantity
      { width: 18 }, // Unit Price  
      { width: 18 }  // Line Total
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Delivery Order');
    
    // Generate filename with timestamp
    const timestampedFilename = `Delivery_Order_${deliveryOrder.do_number || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Write and download the file
    XLSX.writeFile(workbook, timestampedFilename);
    
  } catch (error) {
    console.error("Delivery Order XLSX export error:", error);
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

// ─── Shared PO GRN Summary utilities ─────────────────────────────────────────
// Used by both GoodsReceiptsTab and POActionsDropdown to avoid duplication.

export const printPOGRNSummary = async (poId) => {
  const res = await fetch(`/api/purchase-orders/${poId}/detail`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to load PO detail');
  const d = await res.json();
  const currency = d.currency || 'GBP';
  const fmt = (n) => `${currency} ${parseFloat(n || 0).toFixed(2)}`;
  const fmtDate = (s) => fmtShort(s) || '—';

  const productCell = (name, size, sku) =>
    `${name || '—'}${size ? `<br/><span class="size-text">${size}</span>` : ''}${sku ? `<br/><span class="sku">${sku}</span>` : ''}`;

  const orderedRows = (d.items || []).map(item => `
    <tr>
      <td>${productCell(item.productName, item.size, item.productSku)}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${fmt(item.unitPrice)}</td>
      <td class="num">${fmt(item.lineTotal)}</td>
    </tr>`).join('');
  const orderedFooter = `<tr class="footer-row"><td colspan="3" class="num-label">Original PO Total</td><td class="num"><strong>${fmt(d.totalAmount)}</strong></td></tr>`;

  const hasGrns = d.grns && d.grns.length > 0 && d.reconciliation?.hasGrns;

  const receivedRows = hasGrns ? (d.items || []).map(item => {
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
  const receivedTotal = hasGrns ? (d.items || []).reduce((s, i) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0) : 0;
  const receivedFooter = `<tr class="footer-row"><td colspan="3" class="num-label">Received Total</td><td class="num"><strong>${fmt(receivedTotal)}</strong></td></tr>`;

  const grnSections = hasGrns ? d.grns.filter(g => g.items && g.items.length > 0).map(grn => {
    const grnShort = grn.items.some(i => (parseInt(i.receivedQuantity) || 0) < (parseInt(i.orderedQuantity) || 0));
    const grnTotal = grn.items.reduce((s, i) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0);
    const itemRows = grn.items.map(item => {
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
      <tr><th>Supplier</th><td>${d.supplierName || '—'}</td></tr>
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
  printWindow.document.write(html);
  printWindow.document.close();
};

export const exportPODetailToXLSX = async (poId, poNumber) => {
  const [res, companyRes] = await Promise.all([
    fetch(`/api/purchase-orders/${poId}/detail`, { credentials: 'include' }),
    fetch('/api/company-settings', { credentials: 'include' }),
  ]);
  if (!res.ok) throw new Error('Failed to load PO detail');
  const d = await res.json();
  const company = companyRes.ok ? await companyRes.json() : null;
  const currency = d.currency || 'GBP';
  const fmtDate = (s) => fmtShort(s);
  const fmtNum = (n) => parseFloat(n || 0).toFixed(2);

  const rows = [];

  rows.push(['PURCHASE ORDER', '', '', '']);
  if (company?.companyName) rows.push([company.companyName, '', '', '']);
  if (company?.vatNumber) rows.push([`TRN: ${company.vatNumber}`, '', '', '']);
  if (company?.address) rows.push([company.address.replace(/\n/g, ', '), '', '', '']);
  if (company?.phone) rows.push([`Tel: ${company.phone}`, '', '', '']);
  if (company?.email) rows.push([`Email: ${company.email}`, '', '', '']);
  rows.push([]);
  rows.push(['PO Number:', d.poNumber || '', '', '']);
  rows.push(['Supplier:', d.supplierName || '', '', '']);
  rows.push(['Currency:', currency, '', '']);
  rows.push(['Order Date:', fmtDate(d.orderDate), '', '']);
  if (d.expectedDelivery) rows.push(['Expected Delivery:', fmtDate(d.expectedDelivery), '', '']);
  rows.push(['Status:', (d.status || '').toUpperCase(), '', '']);
  rows.push(['Payment Status:', (d.paymentStatus || '').toUpperCase(), '', '']);
  if (d.notes) rows.push(['Notes:', d.notes, '', '']);

  rows.push([]);
  rows.push(['ITEMS ORDERED', '', '', '', '', '']);
  rows.push(['Product', 'SKU', 'Qty Ordered', `Unit Price (${currency})`, `Line Total (${currency})`]);
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

    for (const grn of d.grns.filter(g => g.items && g.items.length > 0)) {
      const grnShort = grn.items.some(
        i => (parseInt(i.receivedQuantity) || 0) < (parseInt(i.orderedQuantity) || 0)
      );
      const grnTotal = grn.items.reduce(
        (s, i) => s + (parseFloat(i.receivedQuantity) || 0) * (parseFloat(i.unitPrice) || 0), 0
      );
      rows.push([]);
      rows.push([
        grn.receiptNumber || `GRN-${grn.id}`,
        grn.receivedDate ? fmtDate(grn.receivedDate) : '',
        grnShort ? 'Short delivery' : 'Full delivery',
        '', '',
      ]);
      rows.push(['Product', 'SKU', 'Qty Ordered', 'Qty Received', `Unit Price (${currency})`, `Received Value (${currency})`]);
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

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = [
    { width: 28 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 22 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Order');
  XLSX.writeFile(workbook, `PO_${d.poNumber}_${new Date().toISOString().split('T')[0]}.xlsx`);
};