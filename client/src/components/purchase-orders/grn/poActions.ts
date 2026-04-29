import { printPOGRNSummary, exportPODetailToXLSX } from "../../utils/export";
import type { PORow } from "./types";

interface ToastFn {
  (args: { title: string; description?: string; variant?: "default" | "destructive" }): void;
}

export function makeViewAndPrint(toast: ToastFn) {
  return async (po: PORow) => {
    try {
      await printPOGRNSummary(po.id);
    } catch {
      toast({ title: 'Error', description: 'Could not load purchase order details for printing.', variant: 'destructive' });
    }
  };
}

export function makeExportToXLSX(toast: ToastFn) {
  return async (po: PORow) => {
    try {
      await exportPODetailToXLSX(po.id, po.poNumber);
      toast({ title: "Export successful", description: `${po.poNumber} exported to Excel.` });
    } catch (error: unknown) {
      console.error('XLSX export error:', error);
      toast({ title: "Export failed", description: "Could not export to Excel. Please try again.", variant: "destructive" });
    }
  };
}

export function makeReopenPO(toast: ToastFn, onRefresh: () => void) {
  return async (po: PORow) => {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'submitted' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to re-open purchase order');
      }
      toast({ title: 'PO Re-opened', description: `${po.poNumber} has been moved back to Open.` });
      onRefresh();
    } catch (error: unknown) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Could not re-open the purchase order.', variant: 'destructive' });
    }
  };
}

export async function deletePORequest(po: PORow): Promise<void> {
  const response = await fetch(`/api/purchase-orders/${po.id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete the purchase order.');
  }
}

export async function forceClosePORequest(po: PORow): Promise<void> {
  const response = await fetch(`/api/purchase-orders/${po.id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ status: 'closed' }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to close purchase order');
  }
}
