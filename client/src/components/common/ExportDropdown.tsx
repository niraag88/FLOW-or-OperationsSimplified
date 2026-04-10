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
import { exportToXLSX } from "../utils/export";
import { format } from 'date-fns';

export default function ExportDropdown({ 
  data = [] as any[], 
  type = "Data", 
  filename = "export",
  columns = {} as any,
  isLoading = false,
  onExternalDocumentClick = null as any,
  fetchAllData = null as any,
  totalCount = null as any,
  onViewAndPrint = null as any,
}: {
  data?: any[];
  type?: string;
  filename?: string;
  columns?: any;
  isLoading?: boolean;
  onExternalDocumentClick?: any;
  fetchAllData?: any;
  totalCount?: any;
  onViewAndPrint?: any;
}) {
  const [isExporting, setIsExporting] = useState(false);

  const getExportData = (sourceData: any) => {
    const src = sourceData || data;
    if (!src || src.length === 0) return [];
    return src.map((item: any) => {
      const exportItem: Record<string, any> = {};
      Object.keys(columns).forEach((key: any) => {
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

  const openPrintWindow = () => {
    const pw = window.open('', '_blank');
    if (!pw) {
      alert('Please allow popups in your browser to use View & Print.');
      return null;
    }
    pw.document.write('<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;margin:20px;font-size:12px;color:#333;}</style></head><body><p style="color:#888">Loading&hellip;</p></body></html>');
    pw.document.close();
    return pw;
  };

  const writePrintContent = (pw: any, subtitle: any, headers: any, rows: any, total: any) => {
    const now = format(new Date(), 'dd/MM/yy HH:mm');
    const headerCells = headers.map((h: any) => `<th>${h}</th>`).join('');
    const bodyRows = rows
      .map((row: any) => `<tr>${headers.map((h: any) => `<td>${String(row[h] ?? '')}</td>`).join('')}</tr>`)
      .join('');

    pw.document.open();
    pw.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${subtitle}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .print-header { text-align: center; margin-bottom: 30px; }
    .print-header h1 { font-size: 24px; margin-bottom: 5px; }
    .print-header h2 { font-size: 18px; color: #666; margin-top: 0; font-weight: normal; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: bold; }
    td { font-size: 12px; }
    .print-footer { margin-top: 30px; font-size: 10px; color: #666; text-align: center; }
    @media print { body { margin: 0; } table { font-size: 10px; } }
  </style>
</head>
<body>
  <div class="print-header">
    <h1>Business Operations</h1>
    <h2>${subtitle}</h2>
  </div>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="print-footer">
    <p>Generated: ${now} &nbsp;|&nbsp; Total records: ${total}</p>
  </div>
</body>
</html>`);
    pw.document.close();
  };

  const handleExport = async (exportFormat = 'xlsx') => {
    if (exportFormat === 'pdf' && onViewAndPrint) {
      onViewAndPrint();
      return;
    }

    const pw = exportFormat === 'pdf' ? openPrintWindow() : null;
    if (exportFormat === 'pdf' && !pw) return;

    setIsExporting(true);
    try {
      let exportSource = data;
      if (fetchAllData) {
        exportSource = await fetchAllData();
      }

      if (!exportSource || exportSource.length === 0) {
        alert('No data available to export');
        if (pw) pw.close();
        return;
      }

      const exportData = getExportData(exportSource);
      const exportFilename = `${filename}-${format(new Date(), 'dd-MM-yy')}`;

      if (exportFormat === 'xlsx') {
        exportToXLSX(exportData, exportFilename, type);
      } else {
        const headers = Object.values(columns).map((col: any) =>
          typeof col === 'string' ? col : col.label
        );
        writePrintContent(pw, type, headers, exportData, exportData.length);
      }
    } catch (error: any) {
      console.error('Export error:', error);
      if (pw) pw.close();
    } finally {
      setIsExporting(false);
    }
  };

  const exportCount = totalCount !== null ? totalCount : (data?.length || 0);
  const disabled = isLoading || isExporting;

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
          Export {type} ({exportCount} records)
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
          {fetchAllData ? `All ${exportCount} filtered records across all pages` : `${exportCount} records currently shown`}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
