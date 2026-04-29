import ExcelJS from 'exceljs';
import { format } from 'date-fns';

export const downloadXLSX = async (wb: ExcelJS.Workbook, filename: string) => {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const fmtShort = (dateStr: any) => {
  if (!dateStr) return '';
  try { return format(new Date(dateStr), 'dd/MM/yy'); } catch { return ''; }
};
