export const printStyles = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 1.2cm;
    }
    body, html {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      font-size: 10pt;
    }
    .print-container {
      width: 100%;
      margin: 0;
      padding: 32px !important;
      box-shadow: none;
      border: none;
      min-height: calc(297mm - 2.4cm) !important;
    }
  }
`;

export default function PrintStyles() {
  return (
    <style jsx global>
      {printStyles}
    </style>
  );
}