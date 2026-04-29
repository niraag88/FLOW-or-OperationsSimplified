import type { Express } from "express";
import { registerStockCountRoutes } from "./stock-counts";
import { registerGoodsReceiptListRoutes } from "./list";
import { registerGoodsReceiptScanKeyRoutes } from "./scan-key";
import { registerGoodsReceiptCancelRoutes } from "./cancel";
import { registerGoodsReceiptDeleteRoutes } from "./delete";
import { registerGoodsReceiptMutationRoutes } from "./mutations";

export function registerGoodsReceiptRoutes(app: Express) {
  registerStockCountRoutes(app);
  registerGoodsReceiptListRoutes(app);
  registerGoodsReceiptScanKeyRoutes(app);
  registerGoodsReceiptCancelRoutes(app);
  registerGoodsReceiptDeleteRoutes(app);
  registerGoodsReceiptMutationRoutes(app);
}
