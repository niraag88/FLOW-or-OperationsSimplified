import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Invoices table
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  amount: text("amount").notNull(),
  status: text("status").notNull().default("pending"),
  objectKey: text("object_key"), // Storage key for uploaded PDF
  createdAt: timestamp("created_at").defaultNow().notNull(),
  legalHold: boolean("legal_hold").default(false).notNull(),
});

// Delivery Orders table  
export const deliveryOrders = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  status: text("status").notNull().default("pending"),
  objectKey: text("object_key"), // Storage key for uploaded PDF
  createdAt: timestamp("created_at").defaultNow().notNull(),
  legalHold: boolean("legal_hold").default(false).notNull(),
});

// Audit Log table
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actor: text("actor").notNull(), // User ID who performed the action
  targetId: text("target_id").notNull(), // ID of the record affected
  targetType: text("target_type").notNull(), // "invoice" or "delivery_order"
  objectKey: text("object_key"), // Storage key that was affected
  action: text("action").notNull(), // "DELETE", "CREATE", "UPDATE"
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Schema exports for invoices
export const insertInvoiceSchema = createInsertSchema(invoices).pick({
  invoiceNumber: true,
  customerName: true,
  amount: true,
  status: true,
  objectKey: true,
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
});

export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;
export type DeliveryOrder = typeof deliveryOrders.$inferSelect;

// Schema exports for audit log
export const insertAuditLogSchema = createInsertSchema(auditLog).pick({
  actor: true,
  targetId: true,
  targetType: true,
  objectKey: true,
  action: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
