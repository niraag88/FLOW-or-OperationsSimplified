import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToCsv, exportToXLSX, exportToPDF } from "../utils/export";

export default function ExportDropdown({ products, activeTab, stockSubTab, stockMovements, lowStockProducts, outOfStockProducts }) {
  const [isExporting, setIsExporting] = useState(false);

  // Helper function to prepare product export data
  const getProductExportData = () => {
    return products.map(product => ({
      SKU: product.sku,
      'Product Name': product.name,
      Description: product.description || '',
      'Brand ID': product.brandId,
      'Unit Price': product.unitPrice,
      'Cost Price': product.costPrice || 0,
      'Stock Quantity': product.stockQuantity || 0,
      'Min Stock Level': product.minStockLevel || 0,
      'Max Stock Level': product.maxStockLevel || null,
      'Created Date': new Date(product.createdAt).toLocaleDateString()
    }));
  };

  const exportProducts = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const exportData = getProductExportData();
      const filename = `products-${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, filename, 'Products');
      } else if (format === 'pdf') {
        // Open print view in new tab for PDF printing
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Product Inventory Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .print-header { text-align: center; margin-bottom: 30px; }
              .print-header h1 { font-size: 24px; margin-bottom: 5px; }
              .print-header h2 { font-size: 18px; color: #666; margin-top: 0; }
              .print-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              .print-table th, .print-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              .print-table th { background-color: #f5f5f5; font-weight: bold; }
              .print-table td { font-size: 12px; }
              .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
              @media print {
                body { margin: 0; }
                .print-table { font-size: 10px; }
              }
            </style>
          </head>
          <body>
            <div class="print-header">
              <h1>Inventory Management</h1>
              <h2>Products</h2>
            </div>
            
            <table class="print-table">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Product Code</th>
                  <th>Product Name</th>
                  <th>Size</th>
                  <th>Cost Price</th>
                  <th>Sale Price</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${products.map(product => `
                  <tr>
                    <td>${product.brandName || '-'}</td>
                    <td>${product.sku || '-'}</td>
                    <td>${product.name || '-'}</td>
                    <td>${product.size || '-'}</td>
                    <td>£${parseFloat(product.costPrice || 0).toFixed(2)}</td>
                    <td>AED ${product.unitPrice}</td>
                    <td>${product.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="print-footer">
              <p>Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
              <p>Total Products: ${products.length}</p>
            </div>
            
          </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        exportToCsv(exportData, filename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to prepare current stock export data
  const getCurrentStockExportData = () => {
    return products.map(product => {
      const stock = product.stockQuantity || 0;
      const status = stock === 0 ? 'Out of Stock' : stock <= (product.minStockLevel || 10) ? 'Low Stock' : 'In Stock';
      
      return {
        SKU: product.sku,
        'Product Name': product.name,
        'Current Stock': stock,
        'Min Stock Level': product.minStockLevel || 10,
        Status: status,
        'Cost Price': product.costPrice || 0,
        'Stock Value': (stock * (parseFloat(product.costPrice) || 0)).toFixed(2)
      };
    });
  };

  const exportCurrentStock = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const exportData = getCurrentStockExportData();
      const filename = `current-stock-${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, filename, 'Current Stock');
      } else if (format === 'pdf') {
        exportToPDF(exportData, filename, 'Current Stock Report');
      } else {
        exportToCsv(exportData, filename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to prepare stock movements export data
  const getStockMovementsExportData = () => {
    return stockMovements.map(movement => ({
      Date: new Date(movement.createdAt).toLocaleDateString(),
      Time: new Date(movement.createdAt).toLocaleTimeString(),
      'Product SKU': movement.productSku,
      'Product Name': movement.productName,
      'Movement Type': movement.movementType,
      Quantity: movement.quantity,
      'Previous Stock': movement.previousStock,
      'New Stock': movement.newStock,
      'Unit Cost': movement.unitCost || 0,
      Notes: movement.notes || ''
    }));
  };

  const exportStockMovements = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const exportData = getStockMovementsExportData();
      const filename = `stock-movements-${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, filename, 'Stock Movements');
      } else if (format === 'pdf') {
        exportToPDF(exportData, filename, 'Stock Movements Report');
      } else {
        exportToCsv(exportData, filename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to prepare low stock export data
  const getLowStockExportData = () => {
    return lowStockProducts.map(product => ({
      SKU: product.sku,
      'Product Name': product.name,
      'Current Stock': product.stockQuantity || 0,
      'Min Stock Level': product.minStockLevel || 10,
      'Reorder Needed': Math.max(0, (product.maxStockLevel || 50) - (product.stockQuantity || 0)),
      'Cost Price': product.costPrice || 0,
      'Stock Value': ((product.stockQuantity || 0) * (parseFloat(product.costPrice) || 0)).toFixed(2)
    }));
  };

  const exportLowStock = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const exportData = getLowStockExportData();
      const filename = `low-stock-alerts-${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, filename, 'Low Stock Alerts');
      } else if (format === 'pdf') {
        exportToPDF(exportData, filename, 'Low Stock Alerts Report');
      } else {
        exportToCsv(exportData, filename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Helper function to prepare out of stock export data
  const getOutOfStockExportData = () => {
    return outOfStockProducts.map(product => ({
      SKU: product.sku,
      'Product Name': product.name,
      Brand: product.brandName || '',
      Size: product.description || '',
      'Current Stock': 0,
      Status: 'Out of Stock'
    }));
  };

  const exportOutOfStock = async (format = 'csv') => {
    setIsExporting(true);
    try {
      const exportData = getOutOfStockExportData();
      const filename = `out-of-stock-${new Date().toISOString().split('T')[0]}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, filename, 'Out of Stock');
      } else if (format === 'pdf') {
        exportToPDF(exportData, filename, 'Out of Stock Report');
      } else {
        exportToCsv(exportData, filename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const getDataTypeAndCount = () => {
    if (activeTab === 'products') {
      return { type: 'Products', count: products.length };
    } else if (activeTab === 'stock') {
      switch (stockSubTab) {
        case 'stock-levels':
          return { type: 'Current Stock', count: products.length };
        case 'low-stock':
          return { type: 'Low Stock Alerts', count: lowStockProducts?.length || 0 };
        case 'movements':
          return { type: 'Stock Movements', count: stockMovements?.length || 0 };
        default:
          return { type: 'Stock Data', count: 0 };
      }
    }
    return { type: 'Data', count: 0 };
  };

  const { type: dataType, count: itemCount } = getDataTypeAndCount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
          Export {dataType} ({itemCount} items)
        </div>
        
        {activeTab === 'products' && (
          <>
            <DropdownMenuItem 
              onClick={() => exportProducts('pdf')}
              disabled={itemCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              View & Print
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportProducts('xlsx')}
              disabled={itemCount === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
          </>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'stock-levels' && (
          <>
            <DropdownMenuItem 
              onClick={() => exportCurrentStock('xlsx')}
              disabled={itemCount === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportCurrentStock('pdf')}
              disabled={itemCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              Export to PDF
            </DropdownMenuItem>
          </>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'movements' && (
          <>
            <DropdownMenuItem 
              onClick={() => exportStockMovements('xlsx')}
              disabled={itemCount === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportStockMovements('pdf')}
              disabled={itemCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              Export to PDF
            </DropdownMenuItem>
          </>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'low-stock' && (
          <>
            <DropdownMenuItem 
              onClick={() => exportLowStock('xlsx')}
              disabled={itemCount === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportLowStock('pdf')}
              disabled={itemCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              Export to PDF
            </DropdownMenuItem>
          </>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'out-of-stock' && (
          <>
            <DropdownMenuItem 
              onClick={() => exportOutOfStock('xlsx')}
              disabled={itemCount === 0}
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export to XLSX
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => exportOutOfStock('pdf')}
              disabled={itemCount === 0}
            >
              <FileText className="w-4 h-4 mr-2" />
              Export to PDF
            </DropdownMenuItem>
          </>
        )}
        
        <DropdownMenuSeparator />
        
        <div className="px-3 py-2 text-xs text-gray-500">
          {activeTab === 'products' ? 'Exports all filtered products' : `Exports data from ${dataType.toLowerCase()} view`}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}