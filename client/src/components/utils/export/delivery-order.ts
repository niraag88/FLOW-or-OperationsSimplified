import ExcelJS from 'exceljs';
import { downloadXLSX, fmtShort } from './shared';

export const exportDeliveryOrderToXLSX = async (deliveryOrder: any) => {
  if (!deliveryOrder) {
    console.error("No delivery order data to export.");
    return;
  }

  try {
    // Create export data using array of arrays for proper structure
    const exportData: any[] = [];
    
    // Document Header  
    exportData.push(['DELIVERY ORDER', '', '', '', '', '', '']);
    exportData.push([]); // Empty row
    
    // DO details
    exportData.push(['DO Number:', deliveryOrder.do_number || '', '', '', '', '', '']);
    exportData.push(['Order Date:', fmtShort(deliveryOrder.order_date), '', '', '', '', '']);
    exportData.push(['Customer:', deliveryOrder.customer_name || 'Unknown Customer', '', '', '', '', '']);
    exportData.push(['Reference:', deliveryOrder.reference || '', '', '', '', '', '']);
    exportData.push(['Reference Date:', fmtShort(deliveryOrder.reference_date), '', '', '', '', '']);
    const doCurrency = deliveryOrder.currency || 'AED';
    exportData.push(['Currency:', doCurrency, '', '', '', '', '']);
    const doStatusLabel = deliveryOrder.status?.toLowerCase() === 'submitted' ? 'Confirmed' : deliveryOrder.status ? deliveryOrder.status.charAt(0).toUpperCase() + deliveryOrder.status.slice(1) : '';
    exportData.push(['Status:', doStatusLabel, '', '', '', '', '']);
    
    exportData.push([]); // Empty row
    
    // Table Headers - matching critical currency format standard
    exportData.push([
      'Product Code',
      'Brand Name',
      'Description', 
      'Size',
      'Quantity',
      `Unit Price (${doCurrency})`,
      `Line Total (${doCurrency})`
    ]);
    
    // Line Items
    if (deliveryOrder.items && deliveryOrder.items.length > 0) {
      deliveryOrder.items.forEach((item: any) => {
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
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Delivery Order');
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
    const timestampedFilename = `Delivery_Order_${deliveryOrder.do_number || 'Unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;

    await downloadXLSX(wb, timestampedFilename);
    
  } catch (error: any) {
    console.error("Delivery Order XLSX export error:", error);
    throw error;
  }
};
