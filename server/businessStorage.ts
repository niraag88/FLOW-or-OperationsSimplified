import { db } from "./db";
import { eq, desc, like, and, or, gte, lte, sql, inArray } from "drizzle-orm";
import {
  brands, suppliers, customers, products, purchaseOrders, quotations,
  vatReturns, companySettings, purchaseOrderItems, quotationItems,
  stockCounts, stockCountItems, users, goodsReceipts, goodsReceiptItems,
  invoices, invoiceLineItems, deliveryOrders,
  type Brand, type Supplier, type Customer, type Product, 
  type PurchaseOrder, type Quotation, type VatReturn, type CompanySettings,
  type StockCount, type StockCountItem, type Invoice, type DeliveryOrder,
  type InsertBrand, type InsertSupplier, type InsertCustomer, 
  type InsertProduct, type InsertPurchaseOrder, type InsertQuotation,
  type InsertStockCount, type InsertStockCountItem, type InsertInvoice, type InsertDeliveryOrder
} from "@shared/schema";

export class BusinessStorage {
  // Brand operations
  async getBrands() {
    return await db.select().from(brands).where(eq(brands.isActive, true)).orderBy(desc(brands.createdAt));
  }

  async getBrandById(id: number) {
    const [brand] = await db.select().from(brands).where(eq(brands.id, id));
    return brand;
  }

  async createBrand(data: InsertBrand) {
    const [brand] = await db.insert(brands).values(data).returning();
    return brand;
  }

  async updateBrand(id: number, data: Partial<InsertBrand>) {
    const [brand] = await db.update(brands).set({
      ...data,
      updatedAt: new Date()
    }).where(eq(brands.id, id)).returning();
    return brand;
  }

  async deleteBrand(id: number) {
    const [deletedBrand] = await db.delete(brands).where(eq(brands.id, id)).returning();
    return deletedBrand;
  }

  // Supplier operations
  async getSuppliers() {
    return await db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(desc(suppliers.createdAt));
  }

  async getSupplierById(id: number) {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
    return supplier;
  }

  async createSupplier(data: InsertSupplier) {
    const [supplier] = await db.insert(suppliers).values(data).returning();
    return supplier;
  }

  async updateSupplier(id: number, data: Partial<InsertSupplier>) {
    const [supplier] = await db.update(suppliers).set({
      ...data,
      updatedAt: new Date()
    }).where(eq(suppliers.id, id)).returning();
    return supplier;
  }

  async deleteSupplier(id: number) {
    const [deletedSupplier] = await db.delete(suppliers).where(eq(suppliers.id, id)).returning();
    return deletedSupplier;
  }

  // Customer operations
  async getCustomers() {
    return await db.select().from(customers).where(eq(customers.isActive, true)).orderBy(desc(customers.createdAt));
  }

  async getCustomerById(id: number) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async createCustomer(data: InsertCustomer) {
    const [customer] = await db.insert(customers).values(data).returning();
    return customer;
  }

  async updateCustomer(id: number, data: Partial<InsertCustomer>) {
    const [customer] = await db.update(customers).set({
      ...data,
      updatedAt: new Date()
    }).where(eq(customers.id, id)).returning();
    return customer;
  }

  // Product operations
  async getProductFilterOptions(): Promise<{ brands: string[]; sizes: string[] }> {
    const [brandRows, sizeRows] = await Promise.all([
      db.selectDistinct({ name: brands.name })
        .from(products)
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(eq(products.isActive, true))
        .orderBy(brands.name),
      db.selectDistinct({ description: products.description })
        .from(products)
        .where(and(eq(products.isActive, true), sql`${products.description} IS NOT NULL`))
        .orderBy(products.description),
    ]);
    return {
      brands: brandRows.map(r => r.name).filter(Boolean) as string[],
      sizes: sizeRows.map(r => r.description).filter(Boolean) as string[],
    };
  }

  async getProducts(params?: { page?: number; pageSize?: number; search?: string; category?: string; brandNames?: string[]; sizes?: string[] }): Promise<any> {
    const { page, pageSize, search, category, brandNames, sizes } = params || {};

    const conditions: any[] = [eq(products.isActive, true)];
    if (search) {
      conditions.push(sql`(${products.sku} ILIKE ${`%${search}%`} OR ${products.name} ILIKE ${`%${search}%`} OR coalesce(${products.description}, '') ILIKE ${`%${search}%`})`);
    }
    if (category) {
      conditions.push(eq(products.category, category));
    }
    if (brandNames && brandNames.length > 0) {
      conditions.push(inArray(brands.name, brandNames));
    }
    if (sizes && sizes.length > 0) {
      conditions.push(inArray(products.description, sizes));
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const selectFields = {
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      brandId: products.brandId,
      category: products.category,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      costPriceCurrency: products.costPriceCurrency,
      vatRate: products.vatRate,
      unit: products.unit,
      size: products.size,
      stockQuantity: products.stockQuantity,
      minStockLevel: products.minStockLevel,
      maxStockLevel: products.maxStockLevel,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      brandName: brands.name,
    };

    if (page && pageSize) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::integer` })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .where(whereCondition);

      const data = await db.select(selectFields)
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .where(whereCondition)
        .orderBy(desc(products.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return { data, total: Number(count) };
    }

    return await db.select(selectFields)
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(whereCondition)
      .orderBy(desc(products.createdAt));
  }

  async getProductById(id: number) {
    const [product] = await db.select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      brandId: products.brandId,
      category: products.category,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      costPriceCurrency: products.costPriceCurrency,
      vatRate: products.vatRate,
      unit: products.unit,
      size: products.size,
      stockQuantity: products.stockQuantity,
      minStockLevel: products.minStockLevel,
      maxStockLevel: products.maxStockLevel,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      brandName: brands.name,
    }).from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.id, id));
    return product;
  }

  async createProduct(data: InsertProduct) {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>) {
    const [product] = await db.update(products).set({
      ...data,
      updatedAt: new Date()
    }).where(eq(products.id, id)).returning();
    return product;
  }

  async deleteProduct(id: number) {
    const [deletedProduct] = await db.delete(products).where(eq(products.id, id)).returning();
    return deletedProduct;
  }

  // Purchase Order operations
  async getPurchaseOrders(params?: {
    page?: number; pageSize?: number; search?: string;
    status?: string; supplierId?: string; dateFrom?: string; dateTo?: string; excludeYears?: string; paymentStatus?: string;
  }): Promise<any> {
    const { page, pageSize, search, status, supplierId, dateFrom, dateTo, excludeYears } = params || {};

    const conditions: any[] = [];
    if (search) {
      conditions.push(sql`(${purchaseOrders.poNumber} ILIKE ${`%${search}%`} OR coalesce(${purchaseOrders.notes}, '') ILIKE ${`%${search}%`})`);
    }
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) conditions.push(eq(purchaseOrders.status, statuses[0]));
      else if (statuses.length > 1) conditions.push(inArray(purchaseOrders.status, statuses));
    }
    if (supplierId) {
      const ids = String(supplierId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
      if (ids.length === 1) conditions.push(eq(purchaseOrders.supplierId, ids[0]));
      else if (ids.length > 1) conditions.push(inArray(purchaseOrders.supplierId, ids));
    }
    if (dateFrom) conditions.push(sql`${purchaseOrders.orderDate}::date >= ${dateFrom}::date`);
    if (dateTo) conditions.push(sql`${purchaseOrders.orderDate}::date <= ${dateTo}::date`);
    if (excludeYears) {
      for (const range of excludeYears.split(';').filter(Boolean)) {
        const [start, end] = range.split(',');
        if (start && end) conditions.push(sql`NOT (${purchaseOrders.orderDate}::date >= ${start}::date AND ${purchaseOrders.orderDate}::date <= ${end}::date)`);
      }
    }
    if (params?.paymentStatus && params.paymentStatus !== 'all') {
      conditions.push(eq(purchaseOrders.paymentStatus, params.paymentStatus));
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(purchaseOrders)
      .where(whereCondition);

    // Create subqueries for aggregated data
    const itemsAgg = db.select({
      poId: purchaseOrderItems.poId,
      lineItems: sql<number>`count(*)`.as('lineItems'),
      orderedQty: sql<number>`sum(${purchaseOrderItems.quantity})`.as('orderedQty')
    }).from(purchaseOrderItems)
      .groupBy(purchaseOrderItems.poId)
      .as('itemsAgg');

    const receivedAgg = db.select({
      poId: goodsReceipts.poId,
      receivedQty: sql<number>`sum(${goodsReceiptItems.receivedQuantity})`.as('receivedQty'),
      reconciledAmount: sql<string>`sum(${goodsReceiptItems.receivedQuantity} * ${goodsReceiptItems.unitPrice})`.as('reconciledAmount')
    }).from(goodsReceiptItems)
      .innerJoin(goodsReceipts, eq(goodsReceiptItems.receiptId, goodsReceipts.id))
      .groupBy(goodsReceipts.poId)
      .as('receivedAgg');

    const baseQ = db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      brandId: purchaseOrders.brandId,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      expectedDelivery: purchaseOrders.expectedDelivery,
      totalAmount: purchaseOrders.totalAmount,
      vatAmount: purchaseOrders.vatAmount,
      grandTotal: purchaseOrders.grandTotal,
      notes: purchaseOrders.notes,
      currency: purchaseOrders.currency,
      fxRateToAed: purchaseOrders.fxRateToAed,
      objectKey: purchaseOrders.objectKey,
      createdBy: purchaseOrders.createdBy,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      paymentStatus: purchaseOrders.paymentStatus,
      paymentMadeDate: purchaseOrders.paymentMadeDate,
      paymentRemarks: purchaseOrders.paymentRemarks,
      supplierScanKey: purchaseOrders.supplierScanKey,
      hasGrnAttachment: sql<boolean>`exists(
        select 1 from goods_receipts
        where goods_receipts.po_id = ${purchaseOrders.id}
          and (
            goods_receipts.scan_key_1 is not null
            or goods_receipts.scan_key_2 is not null
            or goods_receipts.scan_key_3 is not null
          )
      )`.as('hasGrnAttachment'),
      supplierName: suppliers.name,
      brandName: brands.name,
      lineItems: sql<number>`coalesce(${itemsAgg.lineItems}, 0)`.as('lineItems'),
      orderedQty: sql<number>`coalesce(${itemsAgg.orderedQty}, 0)`.as('orderedQty'),
      receivedQty: sql<number>`coalesce(${receivedAgg.receivedQty}, 0)`.as('receivedQty'),
      reconciledAmount: sql<string>`${receivedAgg.reconciledAmount}`.as('reconciledAmount')
    }).from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
      .leftJoin(brands, eq(purchaseOrders.brandId, brands.id))
      .leftJoin(itemsAgg, eq(itemsAgg.poId, purchaseOrders.id))
      .leftJoin(receivedAgg, eq(receivedAgg.poId, purchaseOrders.id))
      .where(whereCondition)
      .orderBy(desc(purchaseOrders.createdAt));

    const data = (page && pageSize)
      ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
      : await baseQ;
    return (page && pageSize) ? { data, total: Number(count) } : data;
  }

  async getPurchaseOrderById(id: number) {
    const [po] = await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      brandId: purchaseOrders.brandId,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      expectedDelivery: purchaseOrders.expectedDelivery,
      totalAmount: purchaseOrders.totalAmount,
      vatAmount: purchaseOrders.vatAmount,
      grandTotal: purchaseOrders.grandTotal,
      notes: purchaseOrders.notes,
      currency: purchaseOrders.currency,
      fxRateToAed: purchaseOrders.fxRateToAed,
      objectKey: purchaseOrders.objectKey,
      supplierScanKey: purchaseOrders.supplierScanKey,
      createdBy: purchaseOrders.createdBy,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      paymentStatus: purchaseOrders.paymentStatus,
      paymentMadeDate: purchaseOrders.paymentMadeDate,
      paymentRemarks: purchaseOrders.paymentRemarks,
      brandName: brands.name,
    }).from(purchaseOrders)
      .leftJoin(brands, eq(purchaseOrders.brandId, brands.id))
      .where(eq(purchaseOrders.id, id));
    return po;
  }

  async createPurchaseOrder(data: InsertPurchaseOrder) {
    const [po] = await db.insert(purchaseOrders).values(data).returning();
    return po;
  }

  async updatePurchaseOrder(id: number, data: Partial<InsertPurchaseOrder>) {
    const [po] = await db.update(purchaseOrders).set({
      ...data,
      updatedAt: new Date()
    }).where(eq(purchaseOrders.id, id)).returning();
    return po;
  }

  async deletePurchaseOrder(id: number) {
    // First delete all line items associated with this purchase order
    await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, id));
    
    // Then delete the purchase order itself
    const [deletedPO] = await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id)).returning();
    return deletedPO;
  }

  // Quotation operations
  async getQuotations(params?: {
    page?: number; pageSize?: number; search?: string;
    status?: string; customerId?: string; dateFrom?: string; dateTo?: string; excludeYears?: string;
  }): Promise<any> {
    const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears } = params || {};

    const conditions: any[] = [];
    if (search) {
      conditions.push(sql`(${quotations.quoteNumber} ILIKE ${`%${search}%`} OR coalesce(${quotations.notes}, '') ILIKE ${`%${search}%`})`);
    }
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) conditions.push(eq(quotations.status, statuses[0]));
      else if (statuses.length > 1) conditions.push(inArray(quotations.status, statuses));
    }
    if (customerId) {
      const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
      if (ids.length === 1) conditions.push(eq(quotations.customerId, ids[0]));
      else if (ids.length > 1) conditions.push(inArray(quotations.customerId, ids));
    }
    if (dateFrom) conditions.push(sql`${quotations.quoteDate}::date >= ${dateFrom}::date`);
    if (dateTo) conditions.push(sql`${quotations.quoteDate}::date <= ${dateTo}::date`);
    if (excludeYears) {
      for (const range of excludeYears.split(';').filter(Boolean)) {
        const [start, end] = range.split(',');
        if (start && end) conditions.push(sql`NOT (${quotations.quoteDate} >= ${start} AND ${quotations.quoteDate} <= ${end})`);
      }
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(quotations)
      .where(whereCondition);

    const baseQ = db.select({
      id: quotations.id,
      quoteNumber: quotations.quoteNumber,
      customerId: quotations.customerId,
      status: quotations.status,
      quoteDate: quotations.quoteDate,
      validUntil: quotations.validUntil,
      totalAmount: quotations.totalAmount,
      vatAmount: quotations.vatAmount,
      grandTotal: quotations.grandTotal,
      notes: quotations.notes,
      showRemarks: quotations.showRemarks,
      terms: quotations.terms,
      reference: quotations.reference,
      referenceDate: quotations.referenceDate,
      objectKey: quotations.objectKey,
      createdBy: quotations.createdBy,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
      customerName: customers.name,
    }).from(quotations)
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(whereCondition)
      .orderBy(desc(quotations.createdAt));

    const data = (page && pageSize)
      ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
      : await baseQ;
    return (page && pageSize) ? { data, total: Number(count) } : data;
  }

  async getQuotationById(id: number) {
    const [quote] = await db.select().from(quotations).where(eq(quotations.id, id));
    return quote;
  }

  async getQuotationWithItems(id: number) {
    // Get quotation details with customer name
    const [quote] = await db.select({
      id: quotations.id,
      quoteNumber: quotations.quoteNumber,
      customerId: quotations.customerId,
      status: quotations.status,
      quoteDate: quotations.quoteDate,
      validUntil: quotations.validUntil,
      totalAmount: quotations.totalAmount,
      vatAmount: quotations.vatAmount,
      grandTotal: quotations.grandTotal,
      notes: quotations.notes,
      showRemarks: quotations.showRemarks,
      terms: quotations.terms,
      reference: quotations.reference,
      referenceDate: quotations.referenceDate,
      objectKey: quotations.objectKey,
      createdBy: quotations.createdBy,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
      customerName: customers.name,
    }).from(quotations)
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(eq(quotations.id, id));
    
    if (!quote) return null;

    // Get quotation items with brand names and size
    const items = await db.select({
      id: quotationItems.id,
      productId: quotationItems.productId,
      quantity: quotationItems.quantity,
      unitPrice: quotationItems.unitPrice,
      discount: quotationItems.discount,
      vatRate: quotationItems.vatRate,
      lineTotal: quotationItems.lineTotal,
      description: products.name,
      productCode: products.sku,
      brandName: brands.name,
      size: products.size,
    }).from(quotationItems)
      .leftJoin(products, eq(quotationItems.productId, products.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(eq(quotationItems.quoteId, id));

    return { ...quote, items };
  }

  async createQuotation(data: InsertQuotation) {
    const [quote] = await db.insert(quotations).values(data).returning();
    return quote;
  }

  async updateQuotation(id: number, data: Partial<InsertQuotation>) {
    const [updatedQuote] = await db.update(quotations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(quotations.id, id))
      .returning();
    return updatedQuote;
  }

  async deleteQuotation(id: number) {
    // First delete all line items associated with this quotation
    await db.delete(quotationItems).where(eq(quotationItems.quoteId, id));
    
    // Then delete the quotation itself
    const [deletedQuote] = await db.delete(quotations).where(eq(quotations.id, id)).returning();
    return deletedQuote;
  }

  async createInvoiceFromQuotation(quotationId: number, invoiceNumber: string, userId: number) {
    const quote = await this.getQuotationWithItems(quotationId);
    if (!quote) throw new Error(`Quotation with id ${quotationId} not found`);
    if (quote.status === 'Converted') throw new Error(`Quotation ${quote.quoteNumber} has already been converted to an invoice`);
    if (!quote.customerId) throw new Error(`Quotation ${quote.quoteNumber} has no customer assigned`);

    const invoiceData: InsertInvoice = {
      invoiceNumber,
      customerId: quote.customerId,
      customerName: quote.customerName ?? 'Unknown Customer',
      amount: quote.grandTotal ?? quote.totalAmount ?? '0',
      vatAmount: quote.vatAmount ?? undefined,
      status: 'draft',
      invoiceDate: new Date().toISOString().split('T')[0],
      reference: quote.quoteNumber,
      notes: `Converted from Quotation ${quote.quoteNumber}`,
      currency: 'AED',
    };

    const [invoice] = await db.insert(invoices).values(invoiceData).returning();

    for (const item of (quote.items ?? [])) {
      if (Number(item.quantity) > 0) {
        await db.insert(invoiceLineItems).values({
          invoiceId: invoice.id,
          productId: item.productId ?? null,
          productCode: item.productCode ?? null,
          description: item.description ?? '',
          quantity: Number(item.quantity),
          unitPrice: item.unitPrice?.toString() ?? '0',
          lineTotal: item.lineTotal?.toString() ?? '0',
        });
      }
    }

    await this.updateQuotation(quotationId, { status: 'Converted' });

    return { ...invoice, items: quote.items ?? [] };
  }

  // Company Settings operations
  async getCompanySettings() {
    const [settings] = await db.select().from(companySettings).limit(1);
    return settings;
  }

  async updateCompanySettings(data: Partial<CompanySettings>) {
    const existing = await this.getCompanySettings();
    if (existing) {
      const [settings] = await db.update(companySettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(companySettings.id, existing.id))
        .returning();
      return settings;
    } else {
      // For new company settings, we need the required fields
      const defaultSettings = {
        companyName: data.companyName || 'My Company',
        ...data,
        updatedAt: new Date()
      };
      const [settings] = await db.insert(companySettings).values(defaultSettings).returning();
      return settings;
    }
  }

  // Dashboard statistics
  async getDashboardStats() {
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

  // Generate sequential numbers
  // Find the highest numeric suffix from existing POs with the given prefix.
  // Fetches all matching PO numbers and parses the last dash-segment as an integer.
  // Returns 0 when no POs with this prefix exist yet.
  private async getMaxExistingPoNumber(prefix: string): Promise<number> {
    const existing = await db
      .select({ poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .where(like(purchaseOrders.poNumber, `${prefix}-%`));

    let maxNum = 0;
    for (const row of existing) {
      const parts = row.poNumber.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    return maxNum;
  }

  async generatePoNumber() {
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.poNumberPrefix || 'PO';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const counterNumber = settings?.nextPoNumber || 1;

    // Always derive from the actual purchase_orders table so that deletions
    // never leave gaps — the counter in company_settings is only the fallback
    // when no POs with this prefix exist yet (e.g. first PO in a fresh system).
    const dbMaxNumber = await this.getMaxExistingPoNumber(prefix);
    const nextNumber = dbMaxNumber > 0 ? dbMaxNumber + 1 : Math.max(counterNumber, 1);

    // Simple format: PREFIX-NUMBER (e.g., PO-115) or PREFIX-PART-NNN (e.g., PO-UAE-001)
    const formattedNumber = prefix.includes('-')
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
      : `${prefix}-${nextNumber}`;

    // Sync the counter forward so it stays consistent with reality
    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextPoNumber: nextNumber + 1
      });
    }

    return formattedNumber;
  }

  async getNextPoNumber() {
    // Preview the next number without incrementing — must use identical logic to
    // generatePoNumber() so the form always shows the number that will be assigned.
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.poNumberPrefix || 'PO';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const counterNumber = settings?.nextPoNumber || 1;

    const dbMaxNumber = await this.getMaxExistingPoNumber(prefix);
    const nextNumber = dbMaxNumber > 0 ? dbMaxNumber + 1 : Math.max(counterNumber, 1);

    const formattedNumber = prefix.includes('-')
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
      : `${prefix}-${nextNumber}`;

    return formattedNumber;
  }

  async generateGrnNumber() {
    // Use the company-settings sequence — prevents duplicates on concurrent creates or after deletions.
    const settings = await this.getCompanySettings();
    const prefix = settings?.grnNumberPrefix || 'GRN';
    const nextNumber = settings?.nextGrnNumber || 1;

    // Format: PREFIX + 4-digit zero-padded counter (e.g. GRN0001)
    const receiptNumber = `${prefix}${String(nextNumber).padStart(4, '0')}`;

    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextGrnNumber: nextNumber + 1,
      });
    }

    return receiptNumber;
  }

  // Helper function to compute next available number for a given prefix
  private async computeNextNumberForPrefix(prefix: string): Promise<number> {
    // Create regex to match current prefix format exactly
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefixPattern = prefix.includes('-') 
      ? `${escapedPrefix}-(\\d+)$`  // Match "QUO-2025-123" format
      : `${escapedPrefix}-(\\d+)$`;  // Always expect dash separation
    
    // Get only quotation numbers for current prefix (efficient query)
    const existingQuotations = await db.select({
      quoteNumber: quotations.quoteNumber
    }).from(quotations);
    
    // Filter and extract numbers for current prefix only
    const regex = new RegExp(prefixPattern);
    const existingNumbers = existingQuotations
      .map(q => {
        const match = q.quoteNumber.match(regex);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);
    
    // If no quotations exist, start from 1
    if (existingNumbers.length === 0) {
      return 1;
    }
    
    // Find the maximum number and add 1
    // This ensures we never reuse numbers unless they're from the end
    const maxNumber = Math.max(...existingNumbers);
    return maxNumber + 1;
  }

  async generateQuotationNumber() {
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.quotationNumberPrefix || 'QUO';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const nextNumber = settings?.nextQuotationNumber || 1;

    const formattedNumber = prefix.includes('-')
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
      : `${prefix}-${nextNumber}`;

    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextQuotationNumber: nextNumber + 1
      });
    }

    return formattedNumber;
  }

  async getNextQuotationNumber() {
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.quotationNumberPrefix || 'QUO';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const nextNumber = settings?.nextQuotationNumber || 1;

    const formattedNumber = prefix.includes('-')
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`
      : `${prefix}-${nextNumber}`;

    return formattedNumber;
  }

  async generateInvoiceNumber() {
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.invoiceNumberPrefix || 'INV';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const nextNumber = settings?.nextInvoiceNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-UAE-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-UAE-001 style
      : `${prefix}-${nextNumber}`;  // INV-1 style
    
    // Update next number in settings
    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextInvoiceNumber: nextNumber + 1
      });
    }
    
    return formattedNumber;
  }

  async getNextInvoiceNumber() {
    // Preview the next number without incrementing it
    const settings = await this.getCompanySettings();
    const rawPrefix = settings?.invoiceNumberPrefix || 'INV';
    const prefix = rawPrefix.endsWith('-') ? rawPrefix.slice(0, -1) : rawPrefix;
    const nextNumber = settings?.nextInvoiceNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-UAE-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-UAE-001 style
      : `${prefix}-${nextNumber}`;  // INV-1 style
    
    return formattedNumber;
  }

  async generateDoNumber() {
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const rawDoPrefix = settings?.doNumberPrefix || 'DO';
    const prefix = rawDoPrefix.endsWith('-') ? rawDoPrefix.slice(0, -1) : rawDoPrefix;
    const nextNumber = settings?.nextDoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-UAE-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-UAE-001 style
      : `${prefix}-${nextNumber}`;  // DO-1 style
    
    // Update next number in settings
    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextDoNumber: nextNumber + 1
      });
    }
    
    return formattedNumber;
  }

  async getNextDoNumber() {
    // Preview the next number without incrementing it
    const settings = await this.getCompanySettings();
    const rawDoPrefix = settings?.doNumberPrefix || 'DO';
    const prefix = rawDoPrefix.endsWith('-') ? rawDoPrefix.slice(0, -1) : rawDoPrefix;
    const nextNumber = settings?.nextDoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-UAE-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-UAE-001 style
      : `${prefix}-${nextNumber}`;  // DO-1 style
    
    return formattedNumber;
  }

  // Stock Count operations
  async getStockCounts() {
    return await db.select({
      id: stockCounts.id,
      count_date: stockCounts.countDate,
      total_products: stockCounts.totalProducts,
      total_quantity: stockCounts.totalQuantity,
      created_by: users.username,
      created_at: stockCounts.createdAt,
      updated_at: stockCounts.updatedAt,
    }).from(stockCounts)
      .leftJoin(users, eq(stockCounts.createdBy, users.id))
      .orderBy(desc(stockCounts.createdAt));
  }

  async getStockCountById(id: number) {
    const [stockCount] = await db.select().from(stockCounts).where(eq(stockCounts.id, id));
    if (!stockCount) return null;

    const items = await db.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, id));
    
    return {
      id: stockCount.id,
      count_date: stockCount.countDate,
      total_products: stockCount.totalProducts,
      total_quantity: stockCount.totalQuantity,
      created_by: stockCount.createdBy,
      created_at: stockCount.createdAt,
      updated_at: stockCount.updatedAt,
      items
    };
  }

  async createStockCount(data: { items: any[], createdBy: string }) {
    console.log('Creating stock count with data:', JSON.stringify(data, null, 2));
    
    const totalProducts = data.items.filter(item => item.quantity > 0).length;
    const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
    
    console.log('Stock count totals:', { totalProducts, totalQuantity });
    
    const [stockCount] = await db.insert(stockCounts).values({
      countDate: new Date(),
      totalProducts,
      totalQuantity,
      createdBy: data.createdBy,
    }).returning();
    
    console.log('Created stock count:', stockCount);

    const itemsToInsert = data.items.filter(item => item.quantity > 0).map(item => ({
      stockCountId: stockCount.id,
      productId: item.product_id,
      productCode: item.product_code,
      brandName: item.brand_name,
      productName: item.product_name,
      size: item.size,
      quantity: item.quantity,
    }));

    if (itemsToInsert.length > 0) {
      await db.insert(stockCountItems).values(itemsToInsert);
    }

    return {
      id: stockCount.id,
      count_date: stockCount.countDate,
      total_products: stockCount.totalProducts,
      total_quantity: stockCount.totalQuantity,
      created_by: stockCount.createdBy,
      created_at: stockCount.createdAt,
      updated_at: stockCount.updatedAt,
      items: itemsToInsert
    };
  }

  async deleteStockCount(id: number) {
    await db.delete(stockCountItems).where(eq(stockCountItems.stockCountId, id));
    await db.delete(stockCounts).where(eq(stockCounts.id, id));
    return true;
  }

  // Dashboard aggregation for reports - single API call for all data
  async getDashboardData() {
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
        poPaymentStats
      ] = await Promise.all([
        this.getProducts(),
        this.getStockCounts(),
        this.getPurchaseOrders(),
        db.select().from(goodsReceipts).orderBy(desc(goodsReceipts.createdAt)), // Basic GRN data
        // Invoices are fetched directly by the Reports page (/api/invoices) for completeness
        Promise.resolve([]),
        this.getCustomers(),
        this.getSuppliers(),
        this.getCompanySettings(),
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
      ]);

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
        goodsReceipts: grnsData,
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

  // Optimized method to get products with stock analysis
  async getProductsWithStockAnalysis(lowStockThreshold: number = 6) {
    // Get all products with their brand names using proper join
    const allProducts = await db.select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      brandId: products.brandId,
      brandName: brands.name,
      category: products.category,
      size: products.size,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      costPrice: products.costPrice,
      costPriceCurrency: products.costPriceCurrency,
      unit: products.unit,
      minStockLevel: products.minStockLevel,
      maxStockLevel: products.maxStockLevel,
      isActive: products.isActive,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt
    }).from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.isActive, true))
      .orderBy(desc(products.updatedAt));

    // Fetch FX rates for multi-currency AED conversion
    const settings = await this.getCompanySettings();
    const fxGbpToAed = parseFloat(String(settings?.fxGbpToAed ?? 4.85));
    const fxUsdToAed = parseFloat(String(settings?.fxUsdToAed ?? 3.6725));
    const fxInrToAed = parseFloat(String(settings?.fxInrToAed ?? 0.044));
    const getRateToAed = (currency: string | null) => {
      const c = String(currency ?? 'GBP').toUpperCase();
      if (c === 'AED') return 1.0;
      if (c === 'USD') return fxUsdToAed;
      if (c === 'INR') return fxInrToAed;
      return fxGbpToAed; // default GBP
    };

    // Calculate stock summary aggregations server-side
    let totalItems = 0;
    let totalValue = 0; // AED (converted per product currency)
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockProducts: typeof allProducts = [];
    const outOfStockProducts: typeof allProducts = [];

    allProducts.forEach(product => {
      const stock = product.stockQuantity || 0;
      const costPrice = parseFloat(String(product.costPrice) || '0');
      const rate = getRateToAed(product.costPriceCurrency);
      
      totalItems += stock;
      totalValue += stock * costPrice * rate; // Convert to AED using per-product currency rate

      if (stock === 0) {
        outOfStockCount++;
        outOfStockProducts.push(product);
      } else if (stock <= lowStockThreshold) {
        lowStockCount++;
        lowStockProducts.push(product);
      }
    });

    return {
      products: allProducts,
      stockSummary: {
        totalItems,
        totalValue,
        lowStockCount,
        outOfStockCount
      },
      lowStockProducts,
      outOfStockProducts
    };
  }

  // Invoice operations
  async getInvoices(params?: {
    page?: number; pageSize?: number; search?: string;
    status?: string; customerId?: string; dateFrom?: string; dateTo?: string;
    taxTreatment?: string; excludeYears?: string; paymentStatus?: string;
  }): Promise<any> {
    const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears } = params || {};

    const conditions: any[] = [];
    if (search) {
      conditions.push(sql`(${invoices.invoiceNumber} ILIKE ${`%${search}%`} OR ${invoices.customerName} ILIKE ${`%${search}%`} OR coalesce(${invoices.notes}, '') ILIKE ${`%${search}%`})`);
    }
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) conditions.push(eq(invoices.status, statuses[0]));
      else if (statuses.length > 1) conditions.push(inArray(invoices.status, statuses));
    }
    if (customerId) {
      const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
      if (ids.length === 1) conditions.push(eq(invoices.customerId, ids[0]));
      else if (ids.length > 1) conditions.push(inArray(invoices.customerId, ids));
    }
    if (dateFrom) conditions.push(sql`${invoices.invoiceDate}::date >= ${dateFrom}::date`);
    if (dateTo) conditions.push(sql`${invoices.invoiceDate}::date <= ${dateTo}::date`);
    if (excludeYears) {
      for (const range of excludeYears.split(';').filter(Boolean)) {
        const [start, end] = range.split(',');
        if (start && end) conditions.push(sql`NOT (${invoices.invoiceDate}::date >= ${start}::date AND ${invoices.invoiceDate}::date <= ${end}::date)`);
      }
    }
    if (params?.taxTreatment) {
      const treatments = params.taxTreatment.split(',').filter(Boolean);
      if (treatments.length === 1) conditions.push(eq(invoices.taxTreatment, treatments[0]));
      else if (treatments.length > 1) conditions.push(inArray(invoices.taxTreatment, treatments));
    }
    if (params?.paymentStatus && params.paymentStatus !== 'all') {
      conditions.push(eq(invoices.paymentStatus, params.paymentStatus));
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(invoices)
      .where(whereCondition);

    const baseQ = db.select().from(invoices).where(whereCondition).orderBy(desc(invoices.createdAt));
    const data = (page && pageSize)
      ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
      : await baseQ;
    return (page && pageSize) ? { data, total: Number(count) } : data;
  }

  async getInvoiceById(id: number) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(data: InsertInvoice) {
    const [invoice] = await db.insert(invoices).values(data).returning();
    return invoice;
  }

  async updateInvoice(id: number, data: Partial<InsertInvoice>) {
    const [invoice] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return invoice;
  }

  async deleteInvoice(id: number) {
    const [deletedInvoice] = await db.delete(invoices).where(eq(invoices.id, id)).returning();
    return deletedInvoice;
  }

  // Delivery Order operations
  async getDeliveryOrders(params?: {
    page?: number; pageSize?: number; search?: string;
    status?: string; customerId?: string; dateFrom?: string; dateTo?: string;
    taxTreatment?: string; excludeYears?: string;
  }): Promise<any> {
    const { page, pageSize, search, status, customerId, dateFrom, dateTo, excludeYears, taxTreatment } = params || {};

    const conditions: any[] = [];
    if (search) {
      conditions.push(sql`(${deliveryOrders.orderNumber} ILIKE ${`%${search}%`} OR ${deliveryOrders.customerName} ILIKE ${`%${search}%`} OR coalesce(${deliveryOrders.notes}, '') ILIKE ${`%${search}%`})`);
    }
    if (status) {
      const statuses = status.split(',').filter(Boolean);
      if (statuses.length === 1) conditions.push(eq(deliveryOrders.status, statuses[0]));
      else if (statuses.length > 1) conditions.push(inArray(deliveryOrders.status, statuses));
    }
    if (customerId) {
      const ids = String(customerId).split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
      if (ids.length === 1) conditions.push(eq(deliveryOrders.customerId, ids[0]));
      else if (ids.length > 1) conditions.push(inArray(deliveryOrders.customerId, ids));
    }
    if (dateFrom) conditions.push(sql`${deliveryOrders.orderDate}::date >= ${dateFrom}::date`);
    if (dateTo) conditions.push(sql`${deliveryOrders.orderDate}::date <= ${dateTo}::date`);
    if (excludeYears) {
      for (const range of excludeYears.split(';').filter(Boolean)) {
        const [start, end] = range.split(',');
        if (start && end) conditions.push(sql`NOT (${deliveryOrders.orderDate}::date >= ${start}::date AND ${deliveryOrders.orderDate}::date <= ${end}::date)`);
      }
    }
    if (taxTreatment) {
      const treatments = taxTreatment.split(',').filter(Boolean);
      if (treatments.length === 1) conditions.push(eq(deliveryOrders.taxTreatment, treatments[0]));
      else if (treatments.length > 1) conditions.push(inArray(deliveryOrders.taxTreatment, treatments));
    }
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(deliveryOrders)
      .where(whereCondition);

    const baseQ = db.select().from(deliveryOrders).where(whereCondition).orderBy(desc(deliveryOrders.createdAt));
    const data = (page && pageSize)
      ? await baseQ.limit(pageSize).offset((page - 1) * pageSize)
      : await baseQ;
    return (page && pageSize) ? { data, total: Number(count) } : data;
  }

  async getDeliveryOrderById(id: number) {
    const [deliveryOrder] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
    return deliveryOrder;
  }

  async createDeliveryOrder(data: InsertDeliveryOrder) {
    const [deliveryOrder] = await db.insert(deliveryOrders).values(data).returning();
    return deliveryOrder;
  }

  async updateDeliveryOrder(id: number, data: Partial<InsertDeliveryOrder>) {
    const [deliveryOrder] = await db.update(deliveryOrders).set(data).where(eq(deliveryOrders.id, id)).returning();
    return deliveryOrder;
  }

  async deleteDeliveryOrder(id: number) {
    const [deletedDeliveryOrder] = await db.delete(deliveryOrders).where(eq(deliveryOrders.id, id)).returning();
    return deletedDeliveryOrder;
  }
}

export const businessStorage = new BusinessStorage();