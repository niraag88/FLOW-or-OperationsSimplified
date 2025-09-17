import { db } from "./db";
import { eq, desc, like, and, gte, lte, sql } from "drizzle-orm";
import {
  brands, suppliers, customers, products, purchaseOrders, quotations,
  vatReturns, companySettings, purchaseOrderItems, quotationItems,
  stockCounts, stockCountItems, users, goodsReceipts, goodsReceiptItems,
  invoices, deliveryOrders,
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
  async getProducts() {
    return await db.select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      description: products.description,
      brandId: products.brandId,
      category: products.category,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
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
      .where(eq(products.isActive, true))
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
  async getPurchaseOrders() {
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
      receivedQty: sql<number>`sum(${goodsReceiptItems.receivedQuantity})`.as('receivedQty')
    }).from(goodsReceiptItems)
      .innerJoin(goodsReceipts, eq(goodsReceiptItems.receiptId, goodsReceipts.id))
      .groupBy(goodsReceipts.poId)
      .as('receivedAgg');

    return await db.select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      supplierId: purchaseOrders.supplierId,
      status: purchaseOrders.status,
      orderDate: purchaseOrders.orderDate,
      expectedDelivery: purchaseOrders.expectedDelivery,
      totalAmount: purchaseOrders.totalAmount,
      vatAmount: purchaseOrders.vatAmount,
      grandTotal: purchaseOrders.grandTotal,
      notes: purchaseOrders.notes,
      objectKey: purchaseOrders.objectKey,
      createdBy: purchaseOrders.createdBy,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      supplierName: brands.name, // Since supplierId is actually brandId from the form
      brandName: brands.name,
      // Aggregated data for efficient loading
      lineItems: sql<number>`coalesce(${itemsAgg.lineItems}, 0)`.as('lineItems'),
      orderedQty: sql<number>`coalesce(${itemsAgg.orderedQty}, 0)`.as('orderedQty'),
      receivedQty: sql<number>`coalesce(${receivedAgg.receivedQty}, 0)`.as('receivedQty')
    }).from(purchaseOrders)
      .leftJoin(brands, eq(purchaseOrders.supplierId, brands.id)) // Join directly to brands since supplierId is brandId
      .leftJoin(itemsAgg, eq(itemsAgg.poId, purchaseOrders.id))
      .leftJoin(receivedAgg, eq(receivedAgg.poId, purchaseOrders.id))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrderById(id: number) {
    const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
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
  async getQuotations() {
    return await db.select({
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
      .orderBy(desc(quotations.createdAt));
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
  async generatePoNumber() {
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const prefix = settings?.poNumberPrefix || 'PO';
    const nextNumber = settings?.nextPoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., PO-1, PO-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // PO-2025-001 style
      : `${prefix}-${nextNumber}`;  // PO-1 style
    
    // Update next number in settings
    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextPoNumber: nextNumber + 1
      });
    }
    
    return formattedNumber;
  }

  async getNextPoNumber() {
    // Preview the next number without incrementing it
    const settings = await this.getCompanySettings();
    const prefix = settings?.poNumberPrefix || 'PO';
    const nextNumber = settings?.nextPoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., PO-1, PO-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // PO-2025-001 style
      : `${prefix}-${nextNumber}`;  // PO-1 style
    
    return formattedNumber;
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
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const prefix = settings?.quotationNumberPrefix || 'QUO';
    
    // Use helper to get next available number for this prefix
    const nextNumber = await this.computeNextNumberForPrefix(prefix);
    
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // QUO-2025-001 style
      : `${prefix}-${nextNumber}`;  // QUO-1 style
    
    // Update settings to track the highest number + 1 for future reference
    if (settings) {
      await this.updateCompanySettings({
        ...settings,
        nextQuotationNumber: nextNumber + 1
      });
    }
    
    return formattedNumber;
  }

  async getNextQuotationNumber() {
    // Preview the next number without incrementing it
    const settings = await this.getCompanySettings();
    const prefix = settings?.quotationNumberPrefix || 'QUO';
    
    // Use same helper logic for consistency
    const nextNumber = await this.computeNextNumberForPrefix(prefix);
    
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // QUO-2025-001 style
      : `${prefix}-${nextNumber}`;  // QUO-1 style
    
    return formattedNumber;
  }

  async generateInvoiceNumber() {
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const prefix = settings?.invoiceNumberPrefix || 'INV';
    const nextNumber = settings?.nextInvoiceNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-2025-001 style
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
    const prefix = settings?.invoiceNumberPrefix || 'INV';
    const nextNumber = settings?.nextInvoiceNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., INV-1, INV-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // INV-2025-001 style
      : `${prefix}-${nextNumber}`;  // INV-1 style
    
    return formattedNumber;
  }

  async generateDoNumber() {
    // Get settings for configurable numbering
    const settings = await this.getCompanySettings();
    const prefix = settings?.doNumberPrefix || 'DO';
    const nextNumber = settings?.nextDoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-2025-001 style
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
    const prefix = settings?.doNumberPrefix || 'DO';
    const nextNumber = settings?.nextDoNumber || 1;
    
    // Simple format: PREFIX-NUMBER (e.g., DO-1, DO-2025-001)
    const formattedNumber = prefix.includes('-') 
      ? `${prefix}-${String(nextNumber).padStart(3, '0')}`  // DO-2025-001 style
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
        settingsData
      ] = await Promise.all([
        this.getProducts(),
        this.getStockCounts(),
        this.getPurchaseOrders(),
        db.select().from(goodsReceipts).orderBy(desc(goodsReceipts.createdAt)), // Basic GRN data
        // Note: Invoices would go here when implemented
        Promise.resolve([]), // Placeholder for invoices
        this.getCustomers(),
        this.getSuppliers(),
        this.getCompanySettings()
      ]);

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

    // Calculate stock summary aggregations server-side
    let totalItems = 0;
    let totalValue = 0; // GBP
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockProducts: typeof allProducts = [];
    const outOfStockProducts: typeof allProducts = [];

    allProducts.forEach(product => {
      const stock = product.stockQuantity || 0;
      const costPrice = parseFloat(String(product.costPrice) || '0');
      
      totalItems += stock;
      totalValue += stock * costPrice; // Use cost price for proper inventory valuation

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
  async getInvoices() {
    return await db.select().from(invoices).orderBy(desc(invoices.createdAt));
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
  async getDeliveryOrders() {
    return await db.select().from(deliveryOrders).orderBy(desc(deliveryOrders.createdAt));
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