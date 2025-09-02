import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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