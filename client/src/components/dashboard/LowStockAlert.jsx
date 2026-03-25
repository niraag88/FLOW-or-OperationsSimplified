import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function LowStockAlert({ products, lowStockThreshold = 6 }) {
  const threshold = parseInt(lowStockThreshold) || 6;
  const allLowStock = (products || []).filter(p => {
    const qty = p.stockQuantity || 0;
    return qty > 0 && qty <= threshold;
  });
  const lowStockProducts = allLowStock.slice(0, 5);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Low Stock Alerts
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lowStockProducts.length > 0 ? (
          <div className="space-y-3">
            {lowStockProducts.map(product => (
              <Link to={createPageUrl('Inventory')} key={product.id} className="block p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      {[product.sku, product.brandName, product.size].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">{product.stockQuantity || 0}</p>
                    <p className="text-xs text-gray-500">threshold: {threshold}</p>
                  </div>
                </div>
              </Link>
            ))}
            {allLowStock.length > 5 && (
              <Link to={createPageUrl('Reports')} className="text-sm text-blue-600 hover:underline text-center block pt-2">
                View all {allLowStock.length} low stock items...
              </Link>
            )}
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
