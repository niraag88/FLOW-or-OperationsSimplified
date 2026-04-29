import ExcelJS from 'exceljs';
import { downloadXLSX, fmtShort } from './shared';

export const exportInvoiceToXLSX = async (invoice: any) => {
  if (!invoice) {
    console.error("No invoice data to export.");
    return;
  }

  try {
    // Create export data using array of arrays for proper structure
    const exportData: any[] = [];
    
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
      invoice.items.forEach((item: any) => {
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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Invoice');
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
    const timestampedFilename = `Invoice_${invoice.invoice_number || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;

    await downloadXLSX(wb, timestampedFilename);
    
  } catch (error: any) {
    console.error("Invoice XLSX export error:", error);
    throw error;
  }
};
