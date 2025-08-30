
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Edit2, Copy, Download, Eye, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brand } from "@/api/entities"; // Changed from Supplier to Brand
import ReceiveGoodsDialog from "./ReceiveGoodsDialog";
import POActionsDropdown from "./POActionsDropdown";

export default function POList({ purchaseOrders, loading, canEdit, currentUser, onEdit, onRefresh }) {
  const [brands, setBrands] = useState([]); // Changed from suppliers to brands
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [selectedPO, setSelectedPO] = useState(null);

  React.useEffect(() => {
    loadBrands(); // Changed from loadSuppliers
  }, []);

  const loadBrands = async () => { // Changed from loadSuppliers
    try {
      const brandsData = await Brand.list(); // Changed to Brand.list()
      setBrands(brandsData); // Changed from setSuppliers to setBrands
    } catch (error) {
      console.error("Error loading brands:", error); // Changed error message
    }
  };

  const getBrandName = (brandId) => { // Changed function name and parameter name for clarity
    const brand = brands.find(b => b.id === brandId); // Changed from suppliers.find to brands.find
    return brand?.name || 'Unknown Brand'; // Changed default text
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'closed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount, currency) => {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `${formatter.format(amount)} ${currency}`;
  };

  const handleReceiveGoods = (po) => {
    setSelectedPO(po);
    setShowReceiveDialog(true);
  };

  const canReceiveGoods = (po) => {
    return canEdit && (po.status === 'issued' || po.status === 'received');
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Purchase Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
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
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Purchase Orders ({purchaseOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Brand</TableHead> {/* Changed from Supplier to Brand */}
                  <TableHead>Order Date</TableHead>
                  <TableHead>Expected Delivery</TableHead>
                  <TableHead>Total (Original)</TableHead> {/* Moved to new position */}
                  <TableHead>Total (AED)</TableHead> {/* Moved to new position */}
                  <TableHead>Status</TableHead> {/* Moved to new position */}
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseOrders.map((po) => (
                  <TableRow key={po.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{po.po_number}</TableCell>
                    <TableCell>{getBrandName(po.supplier_id)}</TableCell> {/* Uses getBrandName */}
                    <TableCell>
                      {format(new Date(po.order_date), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>
                      {po.expected_delivery_date ? 
                        format(new Date(po.expected_delivery_date), 'MMM dd, yyyy') 
                        : '-'
                      }
                    </TableCell>
                    <TableCell> {/* Total (Original) */}
                      {formatCurrency(po.total_amount || 0, po.currency)}
                    </TableCell>
                    <TableCell> {/* Total (AED) */}
                      {formatCurrency(po.po_total_aed || 0, 'AED')}
                    </TableCell>
                    <TableCell> {/* Status */}
                      <Badge className={`${getStatusColor(po.status)} border`}>
                        {po.status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {canReceiveGoods(po) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReceiveGoods(po)}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            <Truck className="w-3 h-3 mr-1" />
                            Receive
                          </Button>
                        )}
                        
                        <POActionsDropdown 
                          po={po}
                          canEdit={canEdit}
                          onEdit={onEdit}
                          onRefresh={onRefresh}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-4">
            {purchaseOrders.map((po) => (
              <Card key={po.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{po.po_number}</h3>
                    <p className="text-sm text-gray-600">{getBrandName(po.supplier_id)}</p> {/* Uses getBrandName */}
                    {/* Removed Product Code */}
                  </div>
                  <Badge className={`${getStatusColor(po.status)} border`}>
                    {po.status?.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-gray-500">Order Date</p>
                    <p className="font-medium">{format(new Date(po.order_date), 'MMM dd, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Expected Delivery</p>
                    <p className="font-medium">
                      {po.expected_delivery_date ? 
                        format(new Date(po.expected_delivery_date), 'MMM dd, yyyy') 
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total ({po.currency})</p>
                    <p className="font-medium">{formatCurrency(po.total_amount || 0, po.currency)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total (AED)</p>
                    <p className="font-medium">{formatCurrency(po.po_total_aed || 0, 'AED')}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                  {canReceiveGoods(po) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReceiveGoods(po)}
                      className="text-emerald-600 hover:text-emerald-700"
                    >
                      <Truck className="w-3 h-3 mr-1" />
                      Receive Goods
                    </Button>
                  )}
                  
                  <POActionsDropdown 
                    po={po}
                    canEdit={canEdit}
                    onEdit={onEdit}
                    onRefresh={onRefresh}
                  />
                </div>
              </Card>
            ))}
          </div>

          {purchaseOrders.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No purchase orders found</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive Goods Dialog */}
      <ReceiveGoodsDialog
        open={showReceiveDialog}
        onClose={() => {
          setShowReceiveDialog(false);
          setSelectedPO(null);
        }}
        purchaseOrder={selectedPO}
        currentUser={currentUser}
        onSuccess={() => {
          setShowReceiveDialog(false);
          setSelectedPO(null);
          onRefresh();
        }}
      />
    </>
  );
}
