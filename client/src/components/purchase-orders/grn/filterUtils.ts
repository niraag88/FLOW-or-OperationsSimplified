import type { PORow } from "./types";
import { getTotalOrderedQuantity, getTotalReceivedQuantity } from "./exportColumns";

export function uniqueSupplierOptions(pos: PORow[]): string[] {
  return Array.from(new Set(
    pos.map(po => po.supplierName || po.brandName).filter(Boolean)
  )).sort() as string[];
}

interface OpenFilters {
  openSupplier: string;
  openDateFrom: string;
  openDateTo: string;
}

export function filterOpenPOs(openPOs: PORow[], filters: OpenFilters): PORow[] {
  const { openSupplier, openDateFrom, openDateTo } = filters;
  return openPOs.filter((po: PORow) => {
    if (openSupplier !== 'all') {
      const name = po.supplierName || po.brandName;
      if (name !== openSupplier) return false;
    }
    if (openDateFrom) {
      if (!po.orderDate || new Date(po.orderDate) < new Date(openDateFrom)) return false;
    }
    if (openDateTo) {
      if (!po.orderDate || new Date(po.orderDate) > new Date(openDateTo)) return false;
    }
    return true;
  });
}

interface ClosedFilters {
  closedSupplier: string;
  closedDateFrom: string;
  closedDateTo: string;
  closedDelivery: string;
}

export function filterClosedPOs(closedPOs: PORow[], filters: ClosedFilters): PORow[] {
  const { closedSupplier, closedDateFrom, closedDateTo, closedDelivery } = filters;
  return closedPOs.filter((po: PORow) => {
    if (closedSupplier !== 'all') {
      const name = po.supplierName || po.brandName;
      if (name !== closedSupplier) return false;
    }
    if (closedDateFrom) {
      if (!po.orderDate || new Date(po.orderDate) < new Date(closedDateFrom)) return false;
    }
    if (closedDateTo) {
      if (!po.orderDate || new Date(po.orderDate) > new Date(closedDateTo)) return false;
    }
    if (closedDelivery !== 'all') {
      const ordQty = getTotalOrderedQuantity(po);
      const recQty = getTotalReceivedQuantity(po);
      const isPartial = ordQty > 0 && recQty < ordQty;
      if (closedDelivery === 'short' && !isPartial) return false;
      if (closedDelivery === 'complete' && isPartial) return false;
    }
    return true;
  });
}

export function isOpenFiltersActive(filters: OpenFilters): boolean {
  return filters.openSupplier !== 'all' || !!filters.openDateFrom || !!filters.openDateTo;
}

export function isClosedFiltersActive(filters: ClosedFilters): boolean {
  return filters.closedSupplier !== 'all' || !!filters.closedDateFrom || !!filters.closedDateTo || filters.closedDelivery !== 'all';
}
