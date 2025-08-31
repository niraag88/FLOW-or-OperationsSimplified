import React, { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportToCsv } from "../utils/export";

export default function ExportDropdown({ products, activeTab }) {
  const [isExporting, setIsExporting] = useState(false);

  const exportProducts = async () => {
    setIsExporting(true);
    try {
      const headers = [
        'sku', 'name', 'description', 'brand_id', 
        'unit_price', 'cost_price', 'stock_quantity', 
        'min_stock_level', 'max_stock_level', 'created_at'
      ];
      
      const exportData = products.map(product => ({
        sku: product.sku,
        name: product.name,
        description: product.description || '',
        brand_id: product.brandId,
        unit_price: product.unitPrice,
        cost_price: product.costPrice || 0,
        stock_quantity: product.stockQuantity || 0,
        min_stock_level: product.minStockLevel || 0,
        max_stock_level: product.maxStockLevel || null,
        created_at: new Date(product.createdAt).toLocaleDateString()
      }));

      exportToCsv(exportData, `products-${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const dataType = activeTab === 'products' ? 'Products' : activeTab === 'stock' ? 'Stock Counts' : 'PO vs GRN';
  const itemCount = activeTab === 'products' ? products.length : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          <Download className="w-4 h-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
          Export {dataType} {activeTab === 'products' && `(${itemCount} items)`}
        </div>
        
        {activeTab === 'products' && (
          <DropdownMenuItem 
            onClick={exportProducts}
            disabled={itemCount === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Export as CSV
          </DropdownMenuItem>
        )}
        
        {activeTab === 'stock' && (
          <div className="px-3 py-2 text-xs text-gray-500">
            Use individual export buttons on each stock count
          </div>
        )}
        
        {activeTab === 'po-vs-grn' && (
          <div className="px-3 py-2 text-xs text-gray-500">
            Export individual PO tracking data
          </div>
        )}
        
        <DropdownMenuSeparator />
        
        <div className="px-3 py-2 text-xs text-gray-500">
          {activeTab === 'products' ? 'Exports all filtered products' : 'Export options vary by tab'}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}