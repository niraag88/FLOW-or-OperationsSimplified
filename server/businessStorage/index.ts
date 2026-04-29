// Public storage façade. Composed from per-domain modules under
// `./businessStorage/*` to keep each slice well below the 500-line cap
// while preserving the exact same `businessStorage.<method>(...)` import
// surface used by every route module.
import * as brandOps from "./brands";
import * as supplierOps from "./suppliers";
import * as customerOps from "./customers";
import * as productOps from "./products";
import * as purchaseOrderOps from "./purchase-orders";
import * as quotationOps from "./quotations";
import * as companySettingsOps from "./company-settings";
import * as dashboardOps from "./dashboard";
import * as numberingOps from "./numbering";
import * as stockCountOps from "./stock-counts";
import * as invoiceOps from "./invoices";
import * as deliveryOrderOps from "./delivery-orders";

export const businessStorage = {
  ...brandOps,
  ...supplierOps,
  ...customerOps,
  ...productOps,
  ...purchaseOrderOps,
  ...quotationOps,
  ...companySettingsOps,
  ...dashboardOps,
  ...numberingOps,
  ...stockCountOps,
  ...invoiceOps,
  ...deliveryOrderOps,
};

export type BusinessStorage = typeof businessStorage;
