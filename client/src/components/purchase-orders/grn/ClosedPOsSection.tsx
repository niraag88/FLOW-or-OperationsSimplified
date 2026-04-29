import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  MoreHorizontal,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/utils/currency";
import type { PORow, POStats } from "./types";

interface ClosedPOsSectionProps {
  showClosedReceipts: boolean;
  setShowClosedReceipts: React.Dispatch<React.SetStateAction<boolean>>;
  closedPOs: PORow[];
  filteredClosedPOs: PORow[];
  closedSupplier: string;
  setClosedSupplier: React.Dispatch<React.SetStateAction<string>>;
  closedSupplierOptions: string[];
  closedDateFrom: string;
  setClosedDateFrom: React.Dispatch<React.SetStateAction<string>>;
  closedDateTo: string;
  setClosedDateTo: React.Dispatch<React.SetStateAction<string>>;
  closedDelivery: string;
  setClosedDelivery: React.Dispatch<React.SetStateAction<string>>;
  closedFiltersActive: boolean;
  setQuickViewPoId: (id: number | null) => void;
  onViewAndPrint: (po: PORow) => void;
  onExportToXLSX: (po: PORow) => void;
  onReopenPO: (po: PORow) => void;
  onDeletePO: (po: PORow) => void;
  getLineItemsCount: (po: POStats) => number;
  getTotalOrderedQuantity: (po: POStats) => number;
  getTotalReceivedQuantity: (po: POStats) => number;
  getAedEquivalent: (po: POStats) => number;
}

export default function ClosedPOsSection({
  showClosedReceipts,
  setShowClosedReceipts,
  closedPOs,
  filteredClosedPOs,
  closedSupplier,
  setClosedSupplier,
  closedSupplierOptions,
  closedDateFrom,
  setClosedDateFrom,
  closedDateTo,
  setClosedDateTo,
  closedDelivery,
  setClosedDelivery,
  closedFiltersActive,
  setQuickViewPoId,
  onViewAndPrint,
  onExportToXLSX,
  onReopenPO,
  onDeletePO,
  getLineItemsCount,
  getTotalOrderedQuantity,
  getTotalReceivedQuantity,
  getAedEquivalent,
}: ClosedPOsSectionProps) {
  if (closedPOs.length === 0) return null;

  return (
    <Collapsible open={showClosedReceipts} onOpenChange={setShowClosedReceipts}>
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left h-auto p-4 border-gray-300"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <span className="font-semibold">Closed ({closedPOs.length})</span>
          </div>
          {showClosedReceipts ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        {/* Closed section filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Select value={closedSupplier} onValueChange={setClosedSupplier}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="All Brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {closedSupplierOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={closedDateFrom}
            onChange={e => setClosedDateFrom(e.target.value)}
            className="h-8 w-36 text-sm"
            title="Order date from"
          />
          <span className="text-xs text-gray-400">to</span>
          <Input
            type="date"
            value={closedDateTo}
            onChange={e => setClosedDateTo(e.target.value)}
            className="h-8 w-36 text-sm"
            title="Order date to"
          />
          <Select value={closedDelivery} onValueChange={setClosedDelivery}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deliveries</SelectItem>
              <SelectItem value="short">Short Delivery</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
            </SelectContent>
          </Select>
          {closedFiltersActive && (
            <>
              <span className="text-xs text-gray-500">{filteredClosedPOs.length} of {closedPOs.length}</span>
              <button
                onClick={() => { setClosedSupplier('all'); setClosedDateFrom(''); setClosedDateTo(''); setClosedDelivery('all'); }}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Clear
              </button>
            </>
          )}
        </div>
        {filteredClosedPOs.length === 0 ? (
          <div className="text-center py-6 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
            <p className="font-semibold">No results</p>
            <p className="text-sm">No closed POs match your filters.</p>
          </div>
        ) : null}
        <div className={filteredClosedPOs.length === 0 ? 'hidden' : 'overflow-x-auto border rounded-lg'}>
          <table className="w-full text-sm" style={{tableLayout: 'fixed'}}>
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '130px'}}>PO Number</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '130px'}}>Brand</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Order Date</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '110px'}}>Total (AED)</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '70px'}}>Lines</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '70px'}}>Ordered</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '70px'}}>Received</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '90px'}}>Delivery</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Status</th>
                <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground" style={{width: '80px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosedPOs.map((po: PORow) => {
                const ordQty = getTotalOrderedQuantity(po);
                const recQty = getTotalReceivedQuantity(po);
                const isPartial = ordQty > 0 && recQty < ordQty;
                return (
                  <React.Fragment key={po.id}>
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-2 align-middle font-medium" style={{width: '130px'}}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setQuickViewPoId(Number(po.id))}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-left"
                          >
                            {po.poNumber}
                          </button>
                          {isPartial && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex cursor-default">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">Short delivery</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </td>
                      <td className="p-2 align-middle" style={{width: '130px'}}>{po.brandName || 'Unknown Brand'}</td>
                      <td className="p-2 align-middle" style={{width: '90px'}}>
                        {po.orderDate && !isNaN(new Date(po.orderDate).getTime()) ?
                          format(new Date(po.orderDate), 'dd/MM/yy') :
                          '-'
                        }
                      </td>
                      <td className="p-2 align-middle" style={{width: '110px'}}>{formatCurrency(po.totalAmount || 0, po.currency || 'GBP')}</td>
                      <td className="p-2 align-middle" style={{width: '110px'}}>{formatCurrency(getAedEquivalent(po), 'AED')}</td>
                      <td className="p-2 align-middle" style={{width: '70px'}}>{getLineItemsCount(po)}</td>
                      <td className="p-2 align-middle" style={{width: '70px'}}>{ordQty}</td>
                      <td className="p-2 align-middle" style={{width: '70px'}}>{recQty}</td>
                      <td className="p-2 align-middle" style={{width: '90px'}}>
                        {ordQty > 0 && (
                          isPartial ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 cursor-default">
                                  <AlertTriangle className="w-3 h-3" />
                                  Partial
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="text-xs">{recQty} of {ordQty} units received</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-800 bg-green-100 border border-green-300 rounded px-1.5 py-0.5">
                              <CheckCircle2 className="w-3 h-3" />
                              Complete
                            </span>
                          )
                        )}
                      </td>
                      <td className="p-2 align-middle" style={{width: '80px'}}>
                        <Badge
                          variant="outline"
                          className="border-green-300 text-green-800 bg-green-50"
                        >
                          {po.status?.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-2 align-middle" style={{width: '80px'}}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setQuickViewPoId(Number(po.id))}>
                              <Eye className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onViewAndPrint(po)}>
                              <FileText className="w-4 h-4 mr-2" />
                              View & Print
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onExportToXLSX(po)}>
                              <Download className="w-4 h-4 mr-2" />
                              Export to XLSX
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onReopenPO(po)}>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Re-open PO
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDeletePO(po)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
