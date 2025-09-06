import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "lucide-react";
import { exportToCsv, exportToXLSX, exportToPDF } from "../utils/export";
import { format } from 'date-fns';

export default function ExportDropdown({ 
  data = [], 
  type = "Data", 
  filename = "export",
  columns = {},
  isLoading = false
}) {
  const [isExporting, setIsExporting] = useState(false);

  const getExportData = () => {
    if (!data || data.length === 0) return [];
    
    return data.map(item => {
      const exportItem = {};
      Object.keys(columns).forEach(key => {
        const columnConfig = columns[key];
        if (typeof columnConfig === 'string') {
          exportItem[columnConfig] = item[key] || '';
        } else if (typeof columnConfig === 'object') {
          const value = columnConfig.transform ? columnConfig.transform(item[key], item) : item[key];
          exportItem[columnConfig.label] = value || '';
        }
      });
      return exportItem;
    });
  };

  const handleExport = async (format = 'xlsx') => {
    if (!data || data.length === 0) return;
    
    setIsExporting(true);
    try {
      const exportData = getExportData();
      const timestamp = new Date().toISOString().split('T')[0];
      const exportFilename = `${filename}-${timestamp}`;
      
      if (format === 'xlsx') {
        exportToXLSX(exportData, exportFilename, type);
      } else if (format === 'pdf') {
        // Create a simple print view for PDF
        const printWindow = window.open('', '_blank');
        const tableHeaders = Object.values(columns).map(col => 
          typeof col === 'string' ? col : col.label
        );
        
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${type} Report</title>
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
              <h1>${type} Report</h1>
              <h2>Generated on ${format(new Date(), 'dd/MM/yyyy')}</h2>
            </div>
            
            <table class="print-table">
              <thead>
                <tr>
                  ${tableHeaders.map(header => `<th>${header}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${exportData.map(item => `
                  <tr>
                    ${tableHeaders.map(header => `<td>${item[header] || ''}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="print-footer">
              <p>Generated on: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}</p>
              <p>Total Records: ${data.length}</p>
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        exportToCsv(exportData, exportFilename);
      }
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const itemCount = data?.length || 0;
  const disabled = isLoading || isExporting || itemCount === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
          Export {type} ({itemCount} items)
        </div>
        
        <DropdownMenuItem 
          onClick={() => handleExport('pdf')}
          disabled={disabled}
        >
          <Eye className="w-4 h-4 mr-2" />
          View & Print
        </DropdownMenuItem>
        
        <DropdownMenuItem 
          onClick={() => handleExport('xlsx')}
          disabled={disabled}
        >
          <Download className="w-4 h-4 mr-2" />
          Export to XLSX
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <div className="px-3 py-2 text-xs text-gray-500">
          Exports all filtered {type.toLowerCase()}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}