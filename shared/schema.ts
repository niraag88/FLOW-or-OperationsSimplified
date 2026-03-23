import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, serial, decimal, integer, bigint, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").$type<"Admin" | "Manager" | "Staff">().notNull().default("Staff"),
  firstName: text("first_name"),
  lastName: text("last_name"), 
  email: text("email"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLogin: timestamp("last_login"),
  createdBy: varchar("created_by"), // Admin who created this user
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  firstName: true,
  lastName: true,
  email: true,
  active: true,
}).extend({
  role: z.enum(["Admin", "Manager", "Staff"]).default("Staff"),
  active: z.boolean().default(true)
});

export const updateUserSchema = createInsertSchema(users).pick({
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  active: true,
}).extend({
  role: z.enum(["Admin", "Manager", "Staff"]),
  active: z.boolean()
}).partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

// Invoices table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerId: integer("customer_id"),
  amount: text("amount").notNull(),
  status: text("status").notNull().default("draft"),
  invoiceDate: date("invoice_date"),
  reference: text("reference"),
  referenceDate: date("reference_date"),
  vatAmount: text("vat_amount"),
  notes: text("notes"),
  currency: text("currency").default("AED"),
  taxTreatment: text("tax_treatment").default("standard"),
  objectKey: text("object_key"),
  scanKey: text("scan_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  legalHold: boolean("legal_hold").default(false).notNull(),
}, (table) => ({
  invoicesStatusCustomerIdx: index("invoices_status_customer_idx").on(table.status, table.customerId),
}));

// Delivery Orders table  
export const deliveryOrders = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerId: integer("customer_id"),
  deliveryAddress: text("delivery_address").notNull().default(""),
  status: text("status").notNull().default("draft"),
  orderDate: date("order_date"),
  reference: text("reference"),
  referenceDate: date("reference_date"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  currency: text("currency").default("AED"),
  notes: text("notes"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }),
  taxTreatment: text("tax_treatment").default("standard"),
  objectKey: text("object_key"),
  scanKey: text("scan_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  legalHold: boolean("legal_hold").default(false).notNull(),
}, (table) => ({
  doStatusCustomerIdx: index("delivery_orders_status_customer_idx").on(table.status, table.customerId),
}));

// Audit Log table
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(), // User ID who performed the action
  actorName: text("actor_name"), // Display name of the user (stored at write time)
  targetId: text("target_id").notNull(), // ID of the record affected
  targetType: text("target_type").notNull(), // e.g. "invoice", "product", "user"
  objectKey: text("object_key"), // Storage key that was affected
  action: text("action").notNull(), // "CREATE", "UPDATE", "DELETE", "UPLOAD", "REMOVE_FILE"
  details: text("details"), // Human-readable description of the change
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => ({
  auditLogEntityIdx: index("audit_log_entity_idx").on(table.targetType, table.targetId),
}));

// Schema exports for invoices
export const insertInvoiceSchema = createInsertSchema(invoices).pick({
  invoiceNumber: true,
  customerName: true,
  amount: true,
  status: true,
  objectKey: true,
  scanKey: true,
}).extend({
  customerId: z.number().optional(),
  invoiceDate: z.string().optional(),
  reference: z.string().optional(),
  referenceDate: z.string().optional(),
  vatAmount: z.string().optional(),
  notes: z.string().optional(),
  currency: z.string().optional(),
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;


// Schema exports for delivery orders
export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders).pick({
  orderNumber: true,
  customerName: true,
  deliveryAddress: true,
  status: true,
  objectKey: true,
  scanKey: true,
}).extend({
  customerId: z.number().optional(),
  orderDate: z.string().optional(),
  reference: z.string().optional(),
  referenceDate: z.string().optional(),
  subtotal: z.string().optional(),
  taxAmount: z.string().optional(),
  totalAmount: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  taxRate: z.string().optional(),
});

export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;
export type DeliveryOrder = typeof deliveryOrders.$inferSelect;


// Schema exports for audit log
export const insertAuditLogSchema = createInsertSchema(auditLog).pick({
  actor: true,
  actorName: true,
  targetId: true,
  targetType: true,
  objectKey: true,
  action: true,
  details: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

// Brands table
export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  logo: text("logo"), // Object storage key for brand logo
  website: text("website"),
  contactPerson: text("contact_person"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Suppliers table
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  vatNumber: text("vat_number"),
  paymentTerms: text("payment_terms").default("30"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Customers table
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  email: text("email"),
  phone: text("phone"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  vatNumber: text("vat_number"),
  vatTreatment: text("vat_treatment").default("standard"), // standard, exempt, reverse_charge
  paymentTerms: text("payment_terms").default("30"),
  creditLimit: decimal("credit_limit", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  customersNameIdx: index("customers_name_idx").on(table.name),
}));

// Products table
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  brandId: integer("brand_id").references(() => brands.id),
  category: text("category"),
  size: text("size"), // Product size (e.g., 100ml, 5L, 1kg, 250g)
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("0.00"),
  unit: text("unit").default("pcs"), // pcs, kg, liters, etc.
  stockQuantity: integer("stock_quantity").default(0),
  minStockLevel: integer("min_stock_level").default(10),
  maxStockLevel: integer("max_stock_level"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  productsSkuIdx: index("products_sku_idx").on(table.sku),
}));

// Invoice Line Items table
export const invoiceLineItems = pgTable("invoice_line_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  brandId: integer("brand_id"),
  productCode: text("product_code"),
  description: text("description").notNull().default(""),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertInvoiceLineItemSchema = createInsertSchema(invoiceLineItems).omit({ id: true, createdAt: true });
export type InsertInvoiceLineItem = z.infer<typeof insertInvoiceLineItemSchema>;

// Delivery Order Items table
export const deliveryOrderItems = pgTable("delivery_order_items", {
  id: serial("id").primaryKey(),
  doId: integer("do_id").references(() => deliveryOrders.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  brandId: integer("brand_id"),
  productCode: text("product_code"),
  description: text("description").notNull().default(""),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDeliveryOrderItemSchema = createInsertSchema(deliveryOrderItems).omit({ id: true, createdAt: true });
export type InsertDeliveryOrderItem = z.infer<typeof insertDeliveryOrderItemSchema>;

// Purchase Orders table
export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  poNumber: text("po_number").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, confirmed, received, cancelled
  orderDate: timestamp("order_date").defaultNow().notNull(),
  expectedDelivery: timestamp("expected_delivery"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0.00"),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).default("0.00"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).default("0.00"),
  notes: text("notes"),
  objectKey: text("object_key"), // Storage key for uploaded PDF
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  poStatusIdx: index("purchase_orders_status_idx").on(table.status),
}));

// Purchase Order Items table
export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => purchaseOrders.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("0.00"),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  receivedQuantity: integer("received_quantity").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Quotations table
export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id).notNull(),
  status: text("status").notNull().default("draft"), // draft, sent, accepted, rejected, expired
  quoteDate: timestamp("quote_date").defaultNow().notNull(),
  validUntil: timestamp("valid_until").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0.00"),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).default("0.00"),
  grandTotal: decimal("grand_total", { precision: 10, scale: 2 }).default("0.00"),
  notes: text("notes"),
  showRemarks: boolean("show_remarks").default(false), // Toggle for showing remarks in output
  terms: text("terms"),
  reference: text("reference"),
  referenceDate: timestamp("reference_date"),
  objectKey: text("object_key"), // Storage key for generated PDF
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  quotationsStatusCustomerIdx: index("quotations_status_customer_idx").on(table.status, table.customerId),
}));

// Quotation Items table
export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").references(() => quotations.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0.00"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("0.00"),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// VAT Returns table
export const vatReturns = pgTable("vat_returns", {
  id: serial("id").primaryKey(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: text("status").notNull().default("draft"), // draft, submitted, approved
  totalSales: decimal("total_sales", { precision: 10, scale: 2 }).default("0.00"),
  totalPurchases: decimal("total_purchases", { precision: 10, scale: 2 }).default("0.00"),
  vatCollected: decimal("vat_collected", { precision: 10, scale: 2 }).default("0.00"),
  vatPaid: decimal("vat_paid", { precision: 10, scale: 2 }).default("0.00"),
  netVat: decimal("net_vat", { precision: 10, scale: 2 }).default("0.00"),
  submittedDate: timestamp("submitted_date"),
  objectKey: text("object_key"), // Storage key for generated report
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Company Settings table
export const companySettings = pgTable("company_settings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  vatNumber: text("vat_number"),
  taxNumber: text("tax_number"),
  logo: text("logo"), // Object storage key for company logo
  currency: text("currency").default("USD"),
  vatEnabled: boolean("vat_enabled").default(true),
  defaultVatRate: decimal("default_vat_rate", { precision: 5, scale: 2 }).default("0.00"),
  lowStockThreshold: integer("low_stock_threshold").default(6),
  fxGbpToAed: decimal("fx_gbp_to_aed", { precision: 8, scale: 4 }).default("4.8500"),
  // Document numbering fields
  poNumberPrefix: text("po_number_prefix").default("PO"),
  doNumberPrefix: text("do_number_prefix").default("DO"), 
  invoiceNumberPrefix: text("invoice_number_prefix").default("INV"),
  grnNumberPrefix: text("grn_number_prefix").default("GRN"),
  quotationNumberPrefix: text("quotation_number_prefix").default("QUO"),
  nextPoNumber: integer("next_po_number").default(1),
  nextDoNumber: integer("next_do_number").default(1),
  nextInvoiceNumber: integer("next_invoice_number").default(1),
  nextGrnNumber: integer("next_grn_number").default(1),
  nextQuotationNumber: integer("next_quotation_number").default(1),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Storage monitoring table
export const storageMonitoring = pgTable("storage_monitoring", {
  id: serial("id").primaryKey(),
  databaseSize: bigint("database_size", { mode: "number" }).notNull(),
  objectStorageSize: bigint("object_storage_size", { mode: "number" }).default(0),
  totalDocuments: integer("total_documents").default(0),
  backupStatus: text("backup_status").default("pending"), // pending, running, completed, failed
  lastBackup: timestamp("last_backup"),
  retentionDays: integer("retention_days").default(2555), // 7 years
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stock Counts table
export const stockCounts = pgTable("stock_counts", {
  id: serial("id").primaryKey(),
  countDate: timestamp("count_date").defaultNow().notNull(),
  totalProducts: integer("total_products").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Stock Count Items table (keeping for legacy support)
export const stockCountItems = pgTable("stock_count_items", {
  id: serial("id").primaryKey(),
  stockCountId: integer("stock_count_id").references(() => stockCounts.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productCode: text("product_code").notNull(),
  brandName: text("brand_name"),
  productName: text("product_name").notNull(),
  size: text("size"),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Goods Receipts table for PO → Stock workflow
export const goodsReceipts = pgTable("goods_receipts", {
  id: serial("id").primaryKey(),
  receiptNumber: text("receipt_number").notNull().unique(),
  poId: integer("po_id").references(() => purchaseOrders.id).notNull(),
  supplierId: integer("supplier_id").references(() => suppliers.id).notNull(),
  receivedDate: timestamp("received_date").defaultNow().notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, cancelled
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Goods Receipt Items table
export const goodsReceiptItems = pgTable("goods_receipt_items", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").references(() => goodsReceipts.id).notNull(),
  poItemId: integer("po_item_id").references(() => purchaseOrderItems.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  orderedQuantity: integer("ordered_quantity").notNull(),
  receivedQuantity: integer("received_quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Stock Movements table for tracking all stock changes
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  movementType: text("movement_type").notNull(), // "goods_receipt", "sale", "adjustment", "initial"
  referenceId: integer("reference_id"), // ID of the source record (goods receipt, invoice, etc.)
  referenceType: text("reference_type"), // "goods_receipt", "invoice", "stock_count", "manual"
  quantity: integer("quantity").notNull(), // Positive for additions, negative for deductions
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Recycle Bin table for soft deletes
export const recycleBin = pgTable("recycle_bin", {
  id: serial("id").primaryKey(),
  documentType: text("document_type").notNull(), // "PurchaseOrder", "Invoice", "Quotation", etc.
  documentId: text("document_id").notNull(), // ID of the deleted document
  documentNumber: text("document_number").notNull(), // Human-readable number (PO-001, etc.)
  documentData: text("document_data").notNull(), // JSON string of the original document
  deletedBy: text("deleted_by").notNull(), // Email of user who deleted it
  deletedDate: timestamp("deleted_date").defaultNow().notNull(),
  reason: text("reason"), // Optional deletion reason
  originalStatus: text("original_status"), // Status before deletion
  canRestore: boolean("can_restore").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Create all the insert schemas for new tables
export const insertBrandSchema = createInsertSchema(brands).pick({
  name: true,
  description: true,
  logo: true,
  website: true,
  contactPerson: true,
  contactEmail: true,
  contactPhone: true,
  sortOrder: true,
  isActive: true,
});

export const insertSupplierSchema = createInsertSchema(suppliers).pick({
  name: true,
  contactPerson: true,
  email: true,
  phone: true,
  address: true,
  vatNumber: true,
  paymentTerms: true,
  isActive: true,
});

export const insertCustomerSchema = createInsertSchema(customers).pick({
  name: true,
  contactPerson: true,
  email: true,
  phone: true,
  billingAddress: true,
  shippingAddress: true,
  vatNumber: true,
  vatTreatment: true,
  paymentTerms: true,
  creditLimit: true,
  isActive: true,
});

export const insertProductSchema = createInsertSchema(products).pick({
  sku: true,
  name: true,
  description: true,
  brandId: true,
  category: true,
  unitPrice: true,
  costPrice: true,
  vatRate: true,
  unit: true,
  stockQuantity: true,
  minStockLevel: true,
  maxStockLevel: true,
  isActive: true,
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).pick({
  poNumber: true,
  supplierId: true,
  status: true,
  orderDate: true,
  expectedDelivery: true,
  totalAmount: true,
  vatAmount: true,
  grandTotal: true,
  notes: true,
  objectKey: true,
  createdBy: true,
});

export const insertQuotationSchema = createInsertSchema(quotations).pick({
  quoteNumber: true,
  customerId: true,
  status: true,
  quoteDate: true,
  validUntil: true,
  totalAmount: true,
  vatAmount: true,
  grandTotal: true,
  notes: true,
  showRemarks: true,
  terms: true,
  reference: true,
  referenceDate: true,
  objectKey: true,
  createdBy: true,
});

export const insertStockCountSchema = createInsertSchema(stockCounts).pick({
  countDate: true,
  totalProducts: true,
  totalQuantity: true,
  createdBy: true,
});

export const insertStockCountItemSchema = createInsertSchema(stockCountItems).pick({
  stockCountId: true,
  productId: true,
  productCode: true,
  brandName: true,
  productName: true,
  size: true,
  quantity: true,
});

export const insertGoodsReceiptSchema = createInsertSchema(goodsReceipts).pick({
  receiptNumber: true,
  poId: true,
  supplierId: true,
  receivedDate: true,
  status: true,
  notes: true,
  createdBy: true,
});

export const insertGoodsReceiptItemSchema = createInsertSchema(goodsReceiptItems).pick({
  receiptId: true,
  poItemId: true,
  productId: true,
  orderedQuantity: true,
  receivedQuantity: true,
  unitPrice: true,
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).pick({
  productId: true,
  movementType: true,
  referenceId: true,
  referenceType: true,
  quantity: true,
  previousStock: true,
  newStock: true,
  unitCost: true,
  notes: true,
  createdBy: true,
});

export const insertRecycleBinSchema = createInsertSchema(recycleBin).pick({
  documentType: true,
  documentId: true,
  documentNumber: true,
  documentData: true,
  deletedBy: true,
  reason: true,
  originalStatus: true,
  canRestore: true,
});

// Type exports
export type Brand = typeof brands.$inferSelect;
export type InsertBrand = z.infer<typeof insertBrandSchema>;

export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type PurchaseOrder = typeof purchaseOrders.$inferSelect;
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;

export type Quotation = typeof quotations.$inferSelect;
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;

export type StockCount = typeof stockCounts.$inferSelect;
export type InsertStockCount = z.infer<typeof insertStockCountSchema>;

export type StockCountItem = typeof stockCountItems.$inferSelect;
export type InsertStockCountItem = z.infer<typeof insertStockCountItemSchema>;

export type GoodsReceipt = typeof goodsReceipts.$inferSelect;
export type InsertGoodsReceipt = z.infer<typeof insertGoodsReceiptSchema>;

export type GoodsReceiptItem = typeof goodsReceiptItems.$inferSelect;
export type InsertGoodsReceiptItem = z.infer<typeof insertGoodsReceiptItemSchema>;

export type StockMovement = typeof stockMovements.$inferSelect;
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;

export type RecycleBin = typeof recycleBin.$inferSelect;
export type InsertRecycleBin = z.infer<typeof insertRecycleBinSchema>;

export type VatReturn = typeof vatReturns.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type StorageMonitoring = typeof storageMonitoring.$inferSelect;

// Financial Years (Books) table
export const financialYears = pgTable("financial_years", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status").notNull().default("Open"),
});

export const insertFinancialYearSchema = createInsertSchema(financialYears).omit({ id: true });
export type InsertFinancialYear = z.infer<typeof insertFinancialYearSchema>;
export type FinancialYear = typeof financialYears.$inferSelect;
