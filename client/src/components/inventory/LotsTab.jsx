import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Download, FileText, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StockCount } from "@/api/entities";
import { RecycleBin } from "@/api/entities";
import { User } from "@/api/entities";
import SimpleConfirmDialog from "../common/SimpleConfirmDialog";

export default function LotsTab({ products, loading, canEdit, currentUser, onRefresh }) {
  const navigate = useNavigate();
  const [stockCounts, setStockCounts] = useState([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStockCount, setSelectedStockCount] = useState(null);
  const [loadingStockCounts, setLoadingStockCounts] = useState(true);

  React.useEffect(() => {
    loadStockCounts();
  }, []);

  const loadStockCounts = async () => {
    setLoadingStockCounts(true);
    try {
      const counts = await StockCount.list('-created_date');
      setStockCounts(counts);
    } catch (error) {
      console.error("Error loading stock counts:", error);
      // Mock data for preview
      setStockCounts([
        {
          id: '1',
          count_date: new Date().toISOString(),
          total_products: 15,
          total_quantity: 2450,
          created_by: 'admin@example.com',
          items: [
            { product_id: '1', product_code: 'ABC123', brand_name: 'Brand A', product_name: 'Product 1', size: '500ml', quantity: 100 },
            { product_id: '2', product_code: 'DEF456', brand_name: 'Brand B', product_name: 'Product 2', size: '1kg', quantity: 250 }
          ]
        },
        {
          id: '2',
          count_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          total_products: 12,
          total_quantity: 1800,
          created_by: 'manager@example.com',
          items: []
        }
      ]);
    } finally {
      setLoadingStockCounts(false);
    }
  };


  const handleDeleteStockCount = async () => {
    if (!selectedStockCount) return;

    try {
      // Move to recycle bin
      await RecycleBin.create({
        document_type: 'StockCount',
        document_id: selectedStockCount.id,
        document_number: `Stock Count - ${format(new Date(selectedStockCount.count_date), 'MMM dd, yyyy')}`,
        document_data: selectedStockCount,
        deleted_by: currentUser.email,
        deleted_date: new Date().toISOString(),
        reason: 'Stock count deleted by user',
        original_status: 'completed',
        can_restore: true
      });

      // Delete from stock counts
      await StockCount.delete(selectedStockCount.id);

      setStockCounts(prev => prev.filter(sc => sc.id !== selectedStockCount.id));
      setShowDeleteDialog(false);
      setSelectedStockCount(null);
    } catch (error) {
      console.error("Error deleting stock count:", error);
    }
  };

  const handleExport = (stockCount, format) => {
    if (format === 'pdf') {
      // Generate PDF export
      const printData = {
        type: 'stock-count',
        data: stockCount
      };
      const params = new URLSearchParams({ data: JSON.stringify(printData) });
      window.open(`/print?${params.toString()}`, '_blank');
    } else if (format === 'xlsx') {
      // Generate XLSX export
      exportToExcel(stockCount);
    }
  };

  const exportToExcel = (stockCount) => {
    const data = stockCount.items.map(item => ({
      'Product Code': item.product_code,
      'Brand': item.brand_name,
      'Product Name': item.product_name,
      'Size': item.size || '-',
      'Quantity': item.quantity
    }));

    // Add header row with stock count info
    const headerData = [{
      'Product Code': `Stock Count Date: ${format(new Date(stockCount.count_date), 'MMM dd, yyyy')}`,
      'Brand': `Total Products: ${stockCount.total_products}`,
      'Product Name': `Total Quantity: ${stockCount.total_quantity}`,
      'Size': `Created By: ${stockCount.created_by}`,
      'Quantity': ''
    }, {
      'Product Code': '',
      'Brand': '',
      'Product Name': '',
      'Size': '',
      'Quantity': ''
    }];

    const fullData = [...headerData, ...data];
    
    // Simple CSV export (can be enhanced with actual XLSX library)
    const csv = [
      Object.keys(fullData[0]).join(','),
      ...fullData.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-count-${format(new Date(stockCount.count_date), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading || loadingStockCounts) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Manual Stock Counts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <Skeleton className="h-16 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Manual Stock Counts ({stockCounts.length})
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1">
                Manually record stock quantities for warehouse inventory tracking
              </p>
            </div>
            {canEdit && (
              <Button 
                onClick={() => navigate('/stock-count')}
                className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
                data-testid="button-new-stock-count"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Stock Count
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Products</TableHead>
                  <TableHead>Total Quantity</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockCounts.map((stockCount) => (
                  <TableRow key={stockCount.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      {format(new Date(stockCount.count_date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{stockCount.total_products}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800">
                        {stockCount.total_quantity.toLocaleString()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {stockCount.created_by}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Download className="w-3 h-3 mr-1" />
                              Export
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => handleExport(stockCount, 'pdf')}>
                              <FileText className="w-4 h-4 mr-2" />
                              Export as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleExport(stockCount, 'xlsx')}>
                              <FileText className="w-4 h-4 mr-2" />
                              Export as XLSX
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        {canEdit && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedStockCount(stockCount);
                              setShowDeleteDialog(true);
                            }}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {stockCounts.map((stockCount) => (
              <Card key={stockCount.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {format(new Date(stockCount.count_date), 'MMM dd, yyyy')}
                    </h3>
                    <p className="text-sm text-gray-600">{stockCount.created_by}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="w-3 h-3 mr-1" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport(stockCount, 'pdf')}>
                          <FileText className="w-4 h-4 mr-2" />
                          Export as PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport(stockCount, 'xlsx')}>
                          <FileText className="w-4 h-4 mr-2" />
                          Export as XLSX
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStockCount(stockCount);
                          setShowDeleteDialog(true);
                        }}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Products</p>
                    <Badge variant="outline">{stockCount.total_products}</Badge>
                  </div>
                  <div>
                    <p className="text-gray-500">Total Quantity</p>
                    <Badge className="bg-blue-100 text-blue-800">
                      {stockCount.total_quantity.toLocaleString()}
                    </Badge>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {stockCounts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No stock counts recorded yet</p>
              <p className="text-sm mt-2">Create your first manual stock count to track inventory</p>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Delete Confirmation Dialog */}
      <SimpleConfirmDialog
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setSelectedStockCount(null);
        }}
        onConfirm={handleDeleteStockCount}
        title="Delete Stock Count"
        description={`Are you sure you want to delete the stock count from ${selectedStockCount ? format(new Date(selectedStockCount.count_date), 'MMM dd, yyyy') : ''}? This will move it to the recycle bin.`}
        confirmText="Yes, Delete"
        confirmVariant="destructive"
      />
    </>
  );
}