import type { Express } from "express";
import { registerPurchaseOrderListRoutes } from "./list";
import { registerPurchaseOrderCreateUpdateRoutes } from "./create-update";
import { registerPurchaseOrderDeleteRoutes } from "./delete";
import { registerPurchaseOrderDetailRoutes } from "./detail";
import { registerPurchaseOrderScanKeyRoutes } from "./scan-key";
import { registerPurchaseOrderStatusRoutes } from "./status";

export function registerPurchaseOrderRoutes(app: Express) {
  registerPurchaseOrderListRoutes(app);
  registerPurchaseOrderCreateUpdateRoutes(app);
  registerPurchaseOrderDeleteRoutes(app);
  registerPurchaseOrderDetailRoutes(app);
  registerPurchaseOrderScanKeyRoutes(app);
  registerPurchaseOrderStatusRoutes(app);
}
