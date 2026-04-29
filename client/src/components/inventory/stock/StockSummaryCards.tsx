import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Package, TrendingUp, AlertTriangle } from "lucide-react";
import type { CompanySettings } from "./types";

interface StockSummary {
  totalProducts: number;
  totalQuantity: number;
  totalValue: number;
  lowStock: number;
  outOfStock: number;
}

interface StockSummaryCardsProps {
  stockSummary: StockSummary;
  companySettings: CompanySettings | null;
}

export function StockSummaryCards({ stockSummary, companySettings }: StockSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Total Products</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{stockSummary.totalProducts}</p>
            </div>
            <Package className="h-6 w-6 text-blue-500 flex-shrink-0 ml-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Total Units</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{stockSummary.totalQuantity.toLocaleString()}</p>
            </div>
            <TrendingUp className="h-6 w-6 text-green-500 flex-shrink-0 ml-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Stock Value (at cost)</p>
              <p className="text-lg font-bold text-gray-900 mt-1 truncate">
                AED {stockSummary.totalValue.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-6 w-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
              <span className="text-green-600 text-xs font-bold">AED</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Low Stock</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{stockSummary.lowStock}</p>
              <p className="text-xs text-gray-400 truncate">≤{companySettings?.lowStockThreshold || 6} units</p>
            </div>
            <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 ml-2" />
          </div>
        </CardContent>
      </Card>

      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">Out of Stock</p>
              <p className="text-xl font-bold text-red-600 mt-1">{stockSummary.outOfStock}</p>
            </div>
            <div className="h-6 w-6 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 ml-2">
              <span className="text-red-600 font-bold text-xs">!</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
