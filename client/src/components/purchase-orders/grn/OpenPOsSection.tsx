import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Package, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/utils/currency";
import type { PORow, POStats } from "./types";

interface OpenPOsSectionProps {
  showOpenReceipts: boolean;
  setShowOpenReceipts: React.Dispatch<React.SetStateAction<boolean>>;
  openPOs: PORow[];
  filteredOpenPOs: PORow[];
  openSupplier: string;
  setOpenSupplier: React.Dispatch<React.SetStateAction<string>>;
  openSupplierOptions: string[];
  openDateFrom: string;
  setOpenDateFrom: React.Dispatch<React.SetStateAction<string>>;
  openDateTo: string;
  setOpenDateTo: React.Dispatch<React.SetStateAction<string>>;
  openFiltersActive: boolean;
  canEdit: boolean;
  processingPOId: number | null;
  onReceive: (po: PORow) => void;
  getLineItemsCount: (po: POStats) => number;
  getTotalOrderedQuantity: (po: POStats) => number;
  getTotalReceivedQuantity: (po: POStats) => number;
  getAedEquivalent: (po: POStats) => number;
}

export default function OpenPOsSection({
  showOpenReceipts,
  setShowOpenReceipts,
  openPOs,
  filteredOpenPOs,
  openSupplier,
  setOpenSupplier,
  openSupplierOptions,
  openDateFrom,
  setOpenDateFrom,
  openDateTo,
  setOpenDateTo,
  openFiltersActive,
  canEdit,
  processingPOId,
  onReceive,
  getLineItemsCount,
  getTotalOrderedQuantity,
  getTotalReceivedQuantity,
  getAedEquivalent,
}: OpenPOsSectionProps) {
  return (
    <div className="mb-6">
      <Collapsible open={showOpenReceipts} onOpenChange={setShowOpenReceipts}>
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left h-auto p-4 border-gray-300 mb-3"
          >
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              <span className="font-semibold">Open ({openPOs.length})</span>
            </div>
            {showOpenReceipts ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {/* Open section filters */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Select value={openSupplier} onValueChange={setOpenSupplier}>
              <SelectTrigger className="h-8 w-44 text-sm">
                <SelectValue placeholder="All Brands" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Brands</SelectItem>
                {openSupplierOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={openDateFrom}
              onChange={e => setOpenDateFrom(e.target.value)}
              className="h-8 w-36 text-sm"
              title="Order date from"
            />
            <span className="text-xs text-gray-400">to</span>
            <Input
              type="date"
              value={openDateTo}
              onChange={e => setOpenDateTo(e.target.value)}
              className="h-8 w-36 text-sm"
              title="Order date to"
            />
            {openFiltersActive && (
              <>
                <span className="text-xs text-gray-500">{filteredOpenPOs.length} of {openPOs.length}</span>
                <button
                  onClick={() => { setOpenSupplier('all'); setOpenDateFrom(''); setOpenDateTo(''); }}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Clear
                </button>
              </>
            )}
          </div>
          {openPOs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No Submitted Purchase Orders</p>
              <p>There are no purchase orders awaiting goods receipt.</p>
            </div>
          ) : filteredOpenPOs.length === 0 ? (
            <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
              <p className="font-semibold">No results</p>
              <p className="text-sm">No open POs match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm" style={{tableLayout: 'fixed'}}>
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '120px'}}>PO Number</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '140px'}}>Brand</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '100px'}}>Order Date</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (AED)</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Line Items</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Ordered</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Received</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Status</th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOpenPOs.map((po: PORow) => (
                    <tr key={po.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-2 align-middle font-medium" style={{width: '120px'}}>{po.poNumber}</td>
                      <td className="p-2 align-middle" style={{width: '140px'}}>{po.brandName || 'Unknown Brand'}</td>
                      <td className="p-2 align-middle" style={{width: '100px'}}>
                        {po.orderDate && !isNaN(new Date(po.orderDate).getTime()) ?
                          format(new Date(po.orderDate), 'dd/MM/yy') :
                          '-'
                        }
                      </td>
                      <td className="p-2 align-middle" style={{width: '110px'}}>{formatCurrency(parseFloat(String(po.totalAmount || 0)) || 0, String(po.currency || 'GBP'))}</td>
                      <td className="p-2 align-middle" style={{width: '110px'}}>{formatCurrency(getAedEquivalent(po), 'AED')}</td>
                      <td className="p-2 align-middle" style={{width: '90px'}}>{getLineItemsCount(po)}</td>
                      <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalOrderedQuantity(po)}</td>
                      <td className="p-2 align-middle" style={{width: '80px'}}>{getTotalReceivedQuantity(po)}</td>
                      <td className="p-2 align-middle" style={{width: '90px'}}>
                        <Badge
                          variant="outline"
                          className="border-blue-300 text-blue-800 bg-blue-50"
                        >
                          {po.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle" style={{width: '90px'}}>
                        <Button
                          size="sm"
                          onClick={() => onReceive(po)}
                          disabled={!canEdit || processingPOId === po.id}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {processingPOId === po.id ? "Processing..." : "Receive"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
