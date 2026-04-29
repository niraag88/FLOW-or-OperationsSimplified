import type { PurchaseOrder, GoodsReceipt } from "@shared/schema";

export interface POItem {
  id: number;
  productId?: number;
  quantity?: number;
  receivedQuantity?: number;
  unitPrice?: string | number | null;
  productName?: string;
  productSku?: string;
  brandName?: string;
  size?: string | null;
}

export interface PORow extends PurchaseOrder {
  brandName?: string | null;
  supplierName?: string | null;
  items?: POItem[];
  orderedQty?: number | null;
  receivedQty?: number | null;
  lineItems?: number | null;
}

export interface POStats {
  orderedQty?: number | null | unknown;
  receivedQty?: number | null | unknown;
  lineItems?: number | null | unknown;
  totalAmount?: unknown;
  currency?: string | null;
  fxRateToAed?: unknown;
}

export interface GoodsReceiptsTabProps {
  purchaseOrders: PORow[];
  goodsReceipts: GoodsReceipt[];
  loading: boolean;
  canEdit: boolean;
  currentUser?: { email?: string; role?: string } | null;
  onRefresh: () => void;
  showOpenReceipts: boolean;
  setShowOpenReceipts: React.Dispatch<React.SetStateAction<boolean>>;
  showClosedReceipts: boolean;
  setShowClosedReceipts: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface AttachGrnState {
  grnId: number;
  slot: number;
  receiptNumber: string;
  receivedDate?: string;
}
