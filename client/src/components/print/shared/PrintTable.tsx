interface PrintTableHeader {
  label: string;
  align?: string;
}

interface PrintTableItem {
  product_code?: string;
  description?: string;
  size?: string;
  quantity?: number | string;
  unit_price?: number | string;
  line_total?: number | string;
}

interface PrintTableProps {
  headers?: PrintTableHeader[];
  items?: PrintTableItem[];
  currency?: string;
  showSize?: boolean;
  colSpan?: number;
}

export default function PrintTable({ 
  headers = [],
  items = [],
  currency = 'AED',
  showSize = false,
  colSpan = 5
}: PrintTableProps) {
  return (
    <section className="mb-8">
      <table className="w-full border-collapse print-table">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-gray-200">
            {headers.map((header, index) => (
              <th 
                key={index}
                className={`text-left py-3 px-4 font-semibold text-gray-700 ${
                  index < headers.length - 1 ? 'border-r border-gray-200' : ''
                } ${
                  header.align === 'center' ? 'text-center' : 
                  header.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items && items.length > 0 ? (
            items.map((item, index) => (
              <tr key={index} className="border-b border-gray-200">
                <td className="py-3 px-4 border-r border-gray-200 font-medium">
                  {item.product_code || '-'}
                </td>
                <td className="py-3 px-4 border-r border-gray-200">
                  {item.description}
                </td>
                {showSize && (
                  <td className="text-center py-3 px-4 border-r border-gray-200">
                    {item.size || '-'}
                  </td>
                )}
                <td className="text-center py-3 px-4 border-r border-gray-200">
                  {item.quantity}
                </td>
                <td className="text-right py-3 px-4 border-r border-gray-200">
                  {(parseFloat(String(item.unit_price)) || 0).toFixed(2)}
                </td>
                <td className="text-right py-3 px-4 font-medium">
                  {(parseFloat(String(item.line_total)) || 0).toFixed(2)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={colSpan} className="py-8 text-center text-gray-500">
                No items
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
