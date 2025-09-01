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

export default function ExportDropdown({ products, activeTab, stockSubTab, stockMovements, lowStockProducts, outOfStockProducts }) {
  const [isExporting, setIsExporting] = useState(false);

  const exportProducts = async () => {
    setIsExporting(true);
    try {
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

  const exportCurrentStock = async () => {
    setIsExporting(true);
    try {
      const exportData = products.map(product => {
        const stock = product.stockQuantity || 0;
        const status = stock === 0 ? 'Out of Stock' : stock <= (product.minStockLevel || 10) ? 'Low Stock' : 'In Stock';
        
        return {
          sku: product.sku,
          name: product.name,
          current_stock: stock,
          min_stock_level: product.minStockLevel || 10,
          status: status,
          cost_price: product.costPrice || 0,
          stock_value: (stock * (parseFloat(product.costPrice) || 0)).toFixed(2)
        };
      });

      exportToCsv(exportData, `current-stock-${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportStockMovements = async () => {
    setIsExporting(true);
    try {
      const exportData = stockMovements.map(movement => ({
        date: new Date(movement.createdAt).toLocaleDateString(),
        time: new Date(movement.createdAt).toLocaleTimeString(),
        product_sku: movement.productSku,
        product_name: movement.productName,
        movement_type: movement.movementType,
        quantity: movement.quantity,
        previous_stock: movement.previousStock,
        new_stock: movement.newStock,
        unit_cost: movement.unitCost || 0,
        notes: movement.notes || ''
      }));

      exportToCsv(exportData, `stock-movements-${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportLowStock = async () => {
    setIsExporting(true);
    try {
      const exportData = lowStockProducts.map(product => ({
        sku: product.sku,
        name: product.name,
        current_stock: product.stockQuantity || 0,
        min_stock_level: product.minStockLevel || 10,
        reorder_needed: Math.max(0, (product.maxStockLevel || 50) - (product.stockQuantity || 0)),
        cost_price: product.costPrice || 0,
        stock_value: ((product.stockQuantity || 0) * (parseFloat(product.costPrice) || 0)).toFixed(2)
      }));

      exportToCsv(exportData, `low-stock-alerts-${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportOutOfStock = async () => {
    setIsExporting(true);
    try {
      const exportData = outOfStockProducts.map(product => ({
        sku: product.sku,
        name: product.name,
        last_sale_price: product.unitPrice,
        min_stock_level: product.minStockLevel || 10,
        suggested_reorder: product.maxStockLevel || 50,
        cost_price: product.costPrice || 0
      }));

      exportToCsv(exportData, `out-of-stock-${new Date().toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const getDataTypeAndCount = () => {
    if (activeTab === 'products') {
      return { type: 'Products', count: products.length };
    } else if (activeTab === 'stock') {
      switch (stockSubTab) {
        case 'stock-levels':
          return { type: 'Current Stock', count: products.length };
        case 'low-stock':
          return { type: 'Low Stock Alerts', count: lowStockProducts?.length || 0 };
        case 'movements':
          return { type: 'Stock Movements', count: stockMovements?.length || 0 };
        default:
          return { type: 'Stock Data', count: 0 };
      }
    }
    return { type: 'Data', count: 0 };
  };

  const { type: dataType, count: itemCount } = getDataTypeAndCount();

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
          Export {dataType} ({itemCount} items)
        </div>
        
        {activeTab === 'products' && (
          <DropdownMenuItem 
            onClick={exportProducts}
            disabled={itemCount === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Products CSV
          </DropdownMenuItem>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'stock-levels' && (
          <DropdownMenuItem 
            onClick={exportCurrentStock}
            disabled={itemCount === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Current Stock CSV
          </DropdownMenuItem>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'movements' && (
          <DropdownMenuItem 
            onClick={exportStockMovements}
            disabled={itemCount === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Movements CSV
          </DropdownMenuItem>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'low-stock' && (
          <DropdownMenuItem 
            onClick={exportLowStock}
            disabled={itemCount === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Low Stock CSV
          </DropdownMenuItem>
        )}
        
        {activeTab === 'stock' && stockSubTab === 'out-of-stock' && (
          <DropdownMenuItem 
            onClick={exportOutOfStock}
            disabled={itemCount === 0}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export Out of Stock CSV
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <div className="px-3 py-2 text-xs text-gray-500">
          {activeTab === 'products' ? 'Exports all filtered products' : `Exports data from ${dataType.toLowerCase()} view`}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}