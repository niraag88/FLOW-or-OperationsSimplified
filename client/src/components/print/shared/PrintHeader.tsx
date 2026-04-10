interface PrintHeaderProps {
  documentTitle: string;
  documentNumber?: string;
  documentDate?: string;
  logoUrl?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTrn?: string;
}
export default function PrintHeader({
  documentTitle,
  documentNumber,
  documentDate,
  logoUrl,
  companyName,
  companyAddress,
  companyPhone,
  companyEmail,
  companyTrn
}: PrintHeaderProps) {
  return (
    <header className="flex justify-between items-start mb-10 border-b-2 border-gray-300 pb-6">
      <div>
        {logoUrl && (
          <img 
            src={logoUrl} 
            alt="Company Logo" 
            className="h-16 w-auto mb-4"
          />
        )}
        {companyName && (
          <div>
            <h2 className="text-xl font-bold text-gray-800">{companyName}</h2>
            {companyAddress && (
              <p className="text-gray-600 mt-1">{companyAddress}</p>
            )}
            <div className="mt-2 text-sm text-gray-600">
              {companyPhone && <p>Tel: {companyPhone}</p>}
              {companyEmail && <p>Email: {companyEmail}</p>}
              {companyTrn && <p>TRN: {companyTrn}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="text-right">
        <h1 className="text-4xl font-bold text-gray-800">{documentTitle}</h1>
        <div className="mt-2 text-gray-600">
          <p>{documentTitle.includes('PURCHASE') ? 'PO Number' : 'Quote Number'}: <span className="font-semibold">{documentNumber}</span></p>
          <p>{documentTitle.includes('PURCHASE') ? 'Order Date' : 'Quote Date'}: <span className="font-semibold">{documentDate}</span></p>
        </div>
      </div>
    </header>
  );
}
