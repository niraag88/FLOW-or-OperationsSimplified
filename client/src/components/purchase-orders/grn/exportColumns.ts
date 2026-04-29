import { format } from "date-fns";
import { formatCurrency } from "@/utils/currency";
import type { POStats, PORow } from "./types";

export const dateTransform = (date: unknown) =>
  date && !isNaN(new Date(String(date)).getTime()) ? format(new Date(String(date)), 'dd/MM/yy') : '';

export const totalTransform = (amount: unknown, row: Record<string, unknown>) =>
  formatCurrency(Number(amount || 0), String(row?.currency || 'GBP'));

export const getAedEquivalent = (po: POStats) => {
  const amount = parseFloat(String(po.totalAmount || 0)) || 0;
  const currency = String(po.currency || 'GBP');
  if (currency === 'AED') return amount;
  const rate = parseFloat(String(po.fxRateToAed || 0)) || 4.85;
  return amount * rate;
};

export const aedTransform = (_: unknown, row: Record<string, unknown>) =>
  `AED ${getAedEquivalent(row as POStats).toFixed(2)}`;

export const getLineItemsCount = (po: POStats): number => Number(po.lineItems) || 0;
export const getTotalOrderedQuantity = (po: POStats): number => Number(po.orderedQty) || 0;
export const getTotalReceivedQuantity = (po: POStats): number => Number(po.receivedQty) || 0;

export const deliveryTransform = (_: unknown, row: Record<string, unknown>) => {
  const ordQty = getTotalOrderedQuantity(row as POStats);
  const recQty = getTotalReceivedQuantity(row as POStats);
  return ordQty > 0 && recQty < ordQty ? 'Short Delivery' : 'Complete';
};

// Open section export columns (matches on-screen columns)
export const openExportColumns = {
  poNumber: "PO Number",
  supplierName: { label: "Brand", transform: (v: unknown, row: Record<string, unknown>) => String(v || row?.brandName || '') },
  orderDate: { label: "Order Date", transform: dateTransform },
  totalAmount: { label: "Total", transform: totalTransform },
  grandTotal: { label: "Total (AED)", transform: aedTransform },
  lineItems: { label: "Line Items", transform: (_: unknown, row: Record<string, unknown>) => getLineItemsCount(row as POStats) },
  orderedQty: { label: "Ordered", transform: (_: unknown, row: Record<string, unknown>) => getTotalOrderedQuantity(row as POStats) },
  receivedQty: { label: "Received", transform: (_: unknown, row: Record<string, unknown>) => getTotalReceivedQuantity(row as POStats) },
  status: { label: "Status", transform: (s: unknown) => typeof s === 'string' ? s.toUpperCase() : '' },
};

// Closed section export columns (matches on-screen columns)
export const closedExportColumns = {
  poNumber: "PO Number",
  supplierName: { label: "Brand", transform: (v: unknown, row: Record<string, unknown>) => String(v || row?.brandName || '') },
  orderDate: { label: "Order Date", transform: dateTransform },
  totalAmount: { label: "Total", transform: totalTransform },
  grandTotal: { label: "Total (AED)", transform: aedTransform },
  lineItems: { label: "Lines", transform: (_: unknown, row: Record<string, unknown>) => getLineItemsCount(row as POStats) },
  orderedQty: { label: "Ordered", transform: (_: unknown, row: Record<string, unknown>) => getTotalOrderedQuantity(row as POStats) },
  receivedQty: { label: "Received", transform: (_: unknown, row: Record<string, unknown>) => getTotalReceivedQuantity(row as POStats) },
  delivery: { label: "Delivery", transform: deliveryTransform },
  status: { label: "Status", transform: (s: unknown) => typeof s === 'string' ? s.toUpperCase() : '' },
};

// Combined column set for when both sections are visible: superset of open + closed columns
export const combinedExportColumns = {
  poNumber: "PO Number",
  supplierName: { label: "Brand", transform: (v: unknown, row: Record<string, unknown>) => String(v || row?.brandName || '') },
  orderDate: { label: "Order Date", transform: dateTransform },
  totalAmount: { label: "Total", transform: totalTransform },
  grandTotal: { label: "Total (AED)", transform: aedTransform },
  lineItems: { label: "Lines", transform: (_: unknown, row: Record<string, unknown>) => getLineItemsCount(row as POStats) },
  orderedQty: { label: "Ordered", transform: (_: unknown, row: Record<string, unknown>) => getTotalOrderedQuantity(row as POStats) },
  receivedQty: { label: "Received", transform: (_: unknown, row: Record<string, unknown>) => getTotalReceivedQuantity(row as POStats) },
  status: { label: "Status", transform: (s: unknown) => typeof s === 'string' ? s.toUpperCase() : '' },
  delivery: { label: "Delivery", transform: (_: unknown, row: Record<string, unknown>) => row.status === 'closed' ? deliveryTransform(null, row) : '' },
};

interface BuildContextAwareExportArgs {
  showOpenReceipts: boolean;
  showClosedReceipts: boolean;
  filteredOpenPOs: PORow[];
  filteredClosedPOs: PORow[];
  openPOs: PORow[];
  closedPOs: PORow[];
  openFiltersActive: boolean;
  closedFiltersActive: boolean;
  closedDelivery: string;
}

export function buildContextAwareExport({
  showOpenReceipts,
  showClosedReceipts,
  filteredOpenPOs,
  filteredClosedPOs,
  openPOs,
  closedPOs,
  openFiltersActive,
  closedFiltersActive,
  closedDelivery,
}: BuildContextAwareExportArgs) {
  const deliveryLabel = closedDelivery !== 'all'
    ? (closedDelivery === 'short' ? ' — Short Delivery' : ' — Complete')
    : '';

  if (showOpenReceipts && !showClosedReceipts) {
    return {
      exportData: filteredOpenPOs,
      exportType: `Open Goods Receipts (${filteredOpenPOs.length} items${openFiltersActive ? ` of ${openPOs.length}` : ''})`,
      itemCount: filteredOpenPOs.length,
      columns: openExportColumns,
    };
  } else if (!showOpenReceipts && showClosedReceipts) {
    return {
      exportData: filteredClosedPOs,
      exportType: `Closed Goods Receipts (${filteredClosedPOs.length} items${closedFiltersActive ? ` of ${closedPOs.length}${deliveryLabel}` : ''})`,
      itemCount: filteredClosedPOs.length,
      columns: closedExportColumns,
    };
  } else {
    const combined = [...filteredOpenPOs, ...filteredClosedPOs];
    return {
      exportData: combined,
      exportType: `All Goods Receipts (${combined.length} items)`,
      itemCount: combined.length,
      columns: combinedExportColumns,
    };
  }
}
