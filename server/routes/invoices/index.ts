import type { Express } from "express";
import { registerInvoiceListRoutes } from "./list";
import { registerInvoiceCreateRoutes } from "./create";
import { registerInvoiceUpdateRoutes } from "./update";
import { registerInvoiceScanKeyRoutes } from "./scan-key";
import { registerInvoicePaymentRoutes } from "./payment";
import { registerInvoiceCancelDeleteRoutes } from "./cancel-delete";

export function registerInvoiceRoutes(app: Express) {
  registerInvoiceListRoutes(app);
  registerInvoiceCreateRoutes(app);
  registerInvoiceUpdateRoutes(app);
  registerInvoiceScanKeyRoutes(app);
  registerInvoicePaymentRoutes(app);
  registerInvoiceCancelDeleteRoutes(app);
}
