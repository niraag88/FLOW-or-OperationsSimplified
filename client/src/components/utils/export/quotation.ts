import ExcelJS from 'exceljs';
import { downloadXLSX, fmtShort } from './shared';

export const exportQuotationToXLSX = async (quotation: any) => {
  if (!quotation) {
    console.error("No quotation data to export.");
    return;
  }

  try {
    // Get quotation number with fallback
    const quotationNumber = quotation.quotation_number || quotation.quoteNumber || 'UNKNOWN';
    
    // Fetch complete quotation with line items
    let fullQuotation = quotation;
    try {
      const response = await fetch(`/api/quotations/${quotation.id}`, { credentials: 'include' });
      if (response.ok) {
        fullQuotation = await response.json();
      }
    } catch {
      // fall back to base quotation data
    }
    
    // Get company info — use snapshot captured at creation time; fall back to live settings for older quotations
    let companyInfo = {
      companyName: '',
      address: '',
      phone: '',
      email: '',
      website: '',
      taxNumber: '',
      currency: 'AED'
    };

    const snapshot = fullQuotation.companySnapshot || quotation.companySnapshot;
    if (snapshot) {
      companyInfo = {
        companyName: snapshot.companyName || companyInfo.companyName,
        address: snapshot.address || companyInfo.address,
        phone: snapshot.phone || companyInfo.phone,
        email: snapshot.email || companyInfo.email,
        website: snapshot.website || companyInfo.website,
        taxNumber: snapshot.taxNumber || snapshot.vatNumber || companyInfo.taxNumber,
        currency: 'AED'
      };
    } else {
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
              taxNumber: settings.taxNumber || settings.vatNumber || companyInfo.taxNumber,
              currency: 'AED'
            };
          }
        }
      } catch {
        // fall back to empty company info defaults
      }
    }

    // Use array of arrays approach to avoid column headers (A, B, C, etc.)
    const exportData: any[] = [];
    
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
    
    if (companyInfo.taxNumber) {
      exportData.push([`TRN: ${companyInfo.taxNumber}`, '', '', '', '', '', '']);
    }
    
    exportData.push([]); // Empty row
    
    // Table Headers
    const quoteCurrency = fullQuotation.currency || 'AED';
    exportData.push([
      'Product Code',
      'Brand Name',
      'Description',
      'Size',
      'Quantity',
      `Unit Price (${quoteCurrency})`,
      `Line Total (${quoteCurrency})`
    ]);
    
    // Line Items - check both items and lineItems properties
    const items = fullQuotation.items || fullQuotation.lineItems || [];
    if (items.length > 0) {
      items.forEach((item: any) => {
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
        subtotal = items.reduce((sum: any, item: any) => {
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
    
    // Create workbook and worksheet using array of arrays (no column headers)
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Quotation');
    ws.columns = [
      { width: 15 }, // Product Code
      { width: 20 }, // Brand Name
      { width: 40 }, // Description
      { width: 12 }, // Size
      { width: 10 }, // Quantity
      { width: 18 }, // Unit Price
      { width: 18 }, // Line Total
    ];
    for (const row of exportData) {
      ws.addRow(row);
    }

    // Generate filename with timestamp
    const timestampedFilename = `Quotation_${fullQuotation.quoteNumber || quotationNumber || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;

    await downloadXLSX(wb, timestampedFilename);
    
  } catch (error: any) {
    console.error("Quotation XLSX export error:", error);
    throw error;
  }
};
