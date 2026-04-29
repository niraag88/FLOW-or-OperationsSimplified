import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  customers, suppliers, products, purchaseOrders, quotations,
  invoices, goodsReceipts, goodsReceiptItems
} from "@shared/schema";
import { getProducts } from "./products";
import { getCustomers } from "./customers";
import { getSuppliers } from "./suppliers";
import { getPurchaseOrders } from "./purchase-orders";
import { getStockCounts } from "./stock-counts";
import { getCompanySettings } from "./company-settings";

// Dashboard statistics
export async function getDashboardStats() {
  const [productCount] = await db.select({ count: products.id }).from(products).where(eq(products.isActive, true));
  const [customerCount] = await db.select({ count: customers.id }).from(customers).where(eq(customers.isActive, true));
  const [supplierCount] = await db.select({ count: suppliers.id }).from(suppliers).where(eq(suppliers.isActive, true));
  const [poCount] = await db.select({ count: purchaseOrders.id }).from(purchaseOrders);
  const [quoteCount] = await db.select({ count: quotations.id }).from(quotations);

  return {
    products: productCount?.count || 0,
    customers: customerCount?.count || 0,
    suppliers: supplierCount?.count || 0,
    purchaseOrders: poCount?.count || 0,
    quotations: quoteCount?.count || 0,
  };
}

// Dashboard aggregation for reports - single API call for all data
export async function getDashboardData() {
  try {
    // Fetch all data in parallel for maximum efficiency
    const [
      productsData,
      lotsData,
      posData,
      grnsData,
      invoicesData,
      customersData,
      suppliersData,
      settingsData,
      invoicePaymentStats,
      poPaymentStats,
      grnQuantities,
    ] = await Promise.all([
      getProducts(),
      getStockCounts(),
      getPurchaseOrders(),
      db.select().from(goodsReceipts).orderBy(desc(goodsReceipts.createdAt)), // Basic GRN data
      // Invoices are fetched directly by the Reports page (/api/invoices) for completeness
      Promise.resolve([]),
      getCustomers(),
      getSuppliers(),
      getCompanySettings(),
      // Invoice payment status counts
      db.select({
        paymentStatus: invoices.paymentStatus,
        count: sql<number>`count(*)::integer`,
      }).from(invoices).groupBy(invoices.paymentStatus),
      // PO payment status counts
      db.select({
        paymentStatus: purchaseOrders.paymentStatus,
        count: sql<number>`count(*)::integer`,
      }).from(purchaseOrders).groupBy(purchaseOrders.paymentStatus),
      // GRN quantity totals per receipt
      db.select({
        receiptId: goodsReceiptItems.receiptId,
        totalOrdered: sql<number>`SUM(${goodsReceiptItems.orderedQuantity})::integer`,
        totalReceived: sql<number>`SUM(${goodsReceiptItems.receivedQuantity})::integer`,
      }).from(goodsReceiptItems).groupBy(goodsReceiptItems.receiptId),
    ]);

    // Build a map of receiptId → { totalOrdered, totalReceived }
    const grnQtyMap = new Map<number, { totalOrdered: number; totalReceived: number }>();
    for (const row of grnQuantities) {
      grnQtyMap.set(row.receiptId, { totalOrdered: row.totalOrdered, totalReceived: row.totalReceived });
    }
    // Enrich GRN records with quantity information
    const enrichedGrns = grnsData.map(grn => ({
      ...grn,
      totalOrdered: grnQtyMap.get(grn.id)?.totalOrdered ?? 0,
      totalReceived: grnQtyMap.get(grn.id)?.totalReceived ?? 0,
    }));

    const invoicePaymentSummary = {
      outstanding: 0,
      paid: 0,
    };
    for (const row of invoicePaymentStats) {
      const ps = row.paymentStatus || 'outstanding';
      invoicePaymentSummary[ps as 'outstanding' | 'paid'] = row.count;
    }

    const poPaymentSummary = {
      outstanding: 0,
      paid: 0,
    };
    for (const row of poPaymentStats) {
      const ps = row.paymentStatus || 'outstanding';
      poPaymentSummary[ps as 'outstanding' | 'paid'] = row.count;
    }

    return {
      products: productsData,
      lots: lotsData,
      purchaseOrders: posData,
      goodsReceipts: enrichedGrns,
      invoices: invoicesData,
      customers: customersData,
      suppliers: suppliersData,
      companySettings: settingsData,
      // Pre-calculated summaries for instant dashboard loading
      summary: {
        totalProducts: productsData.length,
        totalSuppliers: suppliersData.length,
        totalCustomers: customersData.length,
        totalPurchaseOrders: posData.length,
        totalGoodsReceipts: grnsData.length,
        invoicePayment: invoicePaymentSummary,
        poPayment: poPaymentSummary,
        lastUpdated: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    throw error;
  }
}
