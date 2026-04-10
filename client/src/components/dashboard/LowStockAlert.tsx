import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { isLowStock } from '@/utils/stockUtils';

export default function LowStockAlert({ products, lowStockThreshold = 6 }) {
  const threshold = parseInt(String(lowStockThreshold)) || 6;
  const allLowStock = (products || []).filter((p: any) => isLowStock(p.stockQuantity, threshold));

  return (
    <Card className="border-0 shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Low Stock Alerts
          {allLowStock.length > 0 && (
            <span className="ml-auto text-xs font-normal text-gray-500">{allLowStock.length} item{allLowStock.length !== 1 ? 's' : ''}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {allLowStock.length > 0 ? (
          <div className="overflow-y-auto h-full max-h-64 space-y-2 pr-1">
            {allLowStock.map((product: any) => (
              <Link
                to={createPageUrl('Inventory')}
                key={product.id}
                className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {[product.sku, product.brandName, product.size].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-red-600">{product.stockQuantity || 0}</p>
                    <p className="text-xs text-gray-500">threshold: {threshold}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            <PackageCheck className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            <p className="font-medium">All products are well-stocked</p>
            <p className="text-sm">No items are at or below the reorder level ({threshold} units).</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
