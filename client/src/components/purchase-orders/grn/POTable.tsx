import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, CheckCircle2, FileText, FileSpreadsheet, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/utils/currency";
import type { PORow, POStats } from "./types";

interface POTableProps {
  pos: PORow[];
  isClosedSection?: boolean;
  canEdit: boolean;
  processingPOId: number | null;
  onReceive: (po: PORow) => void;
  onViewAndPrint: (po: PORow) => void;
  onExportToXLSX: (po: PORow) => void;
  onDeletePO: (po: PORow) => void;
  getLineItemsCount: (po: POStats) => number;
  getTotalOrderedQuantity: (po: POStats) => number;
  getTotalReceivedQuantity: (po: POStats) => number;
  getAedEquivalent: (po: POStats) => number;
}

export default function POTable({
  pos,
  isClosedSection = false,
  canEdit,
  processingPOId,
  onReceive,
  onViewAndPrint,
  onExportToXLSX,
  onDeletePO,
  getLineItemsCount,
  getTotalOrderedQuantity,
  getTotalReceivedQuantity,
  getAedEquivalent,
}: POTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">PO Number</TableHead>
          <TableHead className="w-[130px]">Brand</TableHead>
          <TableHead className="hidden sm:table-cell w-[100px]">Order Date</TableHead>
          <TableHead className="hidden md:table-cell w-[110px] text-right">Total</TableHead>
          <TableHead className="hidden sm:table-cell w-[110px] text-right">Total (AED)</TableHead>
          <TableHead className="hidden lg:table-cell w-[80px]">Lines</TableHead>
          <TableHead className="hidden md:table-cell w-[70px]">Ordered</TableHead>
          <TableHead className="hidden md:table-cell w-[70px]">Received</TableHead>
          {isClosedSection && <TableHead className="hidden sm:table-cell w-[90px]">Delivery</TableHead>}
          <TableHead className="w-[90px]">Status</TableHead>
          <TableHead className="w-[90px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pos.map((po: PORow) => {
          const ordQty = getTotalOrderedQuantity(po);
          const recQty = getTotalReceivedQuantity(po);
          const isPartial = ordQty > 0 && recQty < ordQty;
          return (
          <TableRow key={po.id}>
            <TableCell className="font-medium w-[120px]">{po.poNumber}</TableCell>
            <TableCell className="w-[130px]">{po.brandName || 'Unknown Brand'}</TableCell>
            <TableCell className="hidden sm:table-cell w-[100px]">
              {po.orderDate && !isNaN(new Date(String(po.orderDate)).getTime()) ? format(new Date(String(po.orderDate)), 'dd/MM/yy') : '-'}
            </TableCell>
            <TableCell className="hidden md:table-cell w-[110px] text-right">{formatCurrency(parseFloat(String(po.totalAmount || 0)) || 0, String(po.currency || 'GBP'))}</TableCell>
            <TableCell className="hidden sm:table-cell w-[110px] text-right">{formatCurrency(getAedEquivalent(po), 'AED')}</TableCell>
            <TableCell className="hidden lg:table-cell w-[80px]">{getLineItemsCount(po)}</TableCell>
            <TableCell className="hidden md:table-cell w-[70px]">{ordQty}</TableCell>
            <TableCell className="hidden md:table-cell w-[70px]">{recQty}</TableCell>
            {isClosedSection && (
              <TableCell className="hidden sm:table-cell w-[90px]">
                {ordQty > 0 && (isPartial ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 cursor-default">
                        <AlertTriangle className="w-3 h-3" />Partial
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">{recQty} of {ordQty} units received</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-800 bg-green-100 border border-green-300 rounded px-1.5 py-0.5">
                    <CheckCircle2 className="w-3 h-3" />Complete
                  </span>
                ))}
              </TableCell>
            )}
            <TableCell className="w-[90px]">
              <Badge
                variant="outline"
                className={po.status === 'closed'
                  ? "border-green-300 text-green-800 bg-green-50"
                  : "border-blue-300 text-blue-800 bg-blue-50"
                }
              >
                {po.status?.toUpperCase()}
              </Badge>
            </TableCell>
            <TableCell className="w-[90px]">
              {isClosedSection ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewAndPrint(po)}>
                      <FileText className="w-4 h-4 mr-2" />
                      View & Print
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onExportToXLSX(po)}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Export to XLSX
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeletePO(po)}
                      className="text-red-600"
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onReceive(po)}
                  disabled={!canEdit || processingPOId === po.id}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {processingPOId === po.id ? "Processing..." : "Receive"}
                </Button>
              )}
            </TableCell>
          </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
