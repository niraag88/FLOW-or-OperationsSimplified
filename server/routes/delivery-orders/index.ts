import type { Express } from "express";
import { registerDeliveryOrderListRoutes } from "./list";
import { registerDeliveryOrderCreateRoutes } from "./create";
import { registerDeliveryOrderUpdateRoutes } from "./update";
import { registerDeliveryOrderCancelRoutes } from "./cancel";
import { registerDeliveryOrderScanKeyRoutes } from "./scan-key";
import { registerDeliveryOrderDeleteRoutes } from "./delete";

export function registerDeliveryOrderRoutes(app: Express) {
  registerDeliveryOrderListRoutes(app);
  registerDeliveryOrderCreateRoutes(app);
  registerDeliveryOrderUpdateRoutes(app);
  registerDeliveryOrderCancelRoutes(app);
  registerDeliveryOrderScanKeyRoutes(app);
  registerDeliveryOrderDeleteRoutes(app);
}
