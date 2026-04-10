import React from 'react';
import { format } from 'date-fns';

export default function StockCountTemplate({ data, settings }) {
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return format(new Date(dateString), 'dd/MM/yy');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto bg-white print:p-4">
      {/* Header */}
      <div className="mb-8 border-b-2 border-gray-800 pb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Stock Count Report</h1>
            <div className="text-lg text-gray-600">
              Date: {formatDate(data.count_date)}
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold text-gray-800">
              {settings?.companyName || 'Company Name'}
            </h2>
            {settings?.address && (
              <div className="text-sm text-gray-600 mt-1">
                {settings.address}
              </div>
            )}
            {settings?.phone && (
              <div className="text-sm text-gray-600">
                Phone: {settings.phone}
              </div>
            )}
            {settings?.email && (
              <div className="text-sm text-gray-600">
                Email: {settings.email}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary Information */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Total Products:</span>
            <span>{data.total_products}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Total Quantity:</span>
            <span>{data.total_quantity?.toLocaleString()}</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="font-medium">Created By:</span>
            <span>{data.created_by}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Last Modified:</span>
            <span>{formatDate(data.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      {data.items && data.items.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-800">Stock Count Items</h3>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
                  Product Code
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
                  Brand
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
                  Product Name
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left font-semibold">
                  Size
                </th>
                <th className="border border-gray-300 px-4 py-2 text-right font-semibold">
                  Quantity
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-2">
                    {item.product_code || item.productCode}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {item.brand_name || item.brandName}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {item.product_name || item.productName}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {item.size || '-'}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right">
                    {item.quantity?.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No items message */}
      {(!data.items || data.items.length === 0) && (
        <div className="text-center py-8 text-gray-500">
          No items found in this stock count.
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-300">
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 mt-16">
              <span className="text-sm text-gray-600">Counted By</span>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2 mt-16">
              <span className="text-sm text-gray-600">Verified By</span>
            </div>
          </div>
        </div>
        
        <div className="text-center mt-8 text-xs text-gray-500">
          Generated on {format(new Date(), 'dd/MM/yy HH:mm')}
        </div>
      </div>
    </div>
  );
}