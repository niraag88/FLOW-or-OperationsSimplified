import { db } from "./db";
import { eq, desc, like, and, gte, lte } from "drizzle-orm";
import {
  brands, suppliers, customers, products, purchaseOrders, quotations,
  vatReturns, companySettings, purchaseOrderItems, quotationItems,
  stockCounts, stockCountItems,
  type Brand, type Supplier, type Customer, type Product, 
  type PurchaseOrder, type Quotation, type VatReturn, type CompanySettings,
  type StockCount, type StockCountItem,
  type InsertBrand, type InsertSupplier, type InsertCustomer, 
  type InsertProduct, type InsertPurchaseOrder, type InsertQuotation,
  type InsertStockCount, type InsertStockCountItem
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
    await db.update(brands).set({ 
      isActive: false,
      updatedAt: new Date()
    }).where(eq(brands.id, id));
    return true;
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

  // Purchase Order operations
  async getPurchaseOrders() {
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
      supplierName: suppliers.name,
    }).from(purchaseOrders)
      .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
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
      terms: quotations.terms,
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

  async createQuotation(data: InsertQuotation) {
    const [quote] = await db.insert(quotations).values(data).returning();
    return quote;
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
    const result = await db.select({ poNumber: purchaseOrders.poNumber })
      .from(purchaseOrders)
      .orderBy(desc(purchaseOrders.id))
      .limit(1);
    
    if (result.length === 0) {
      return "PO-2024-001";
    }
    
    const lastNumber = result[0].poNumber;
    const match = lastNumber.match(/PO-(\d{4})-(\d{3})/);
    if (match) {
      const year = new Date().getFullYear();
      const currentYear = parseInt(match[1]);
      const currentNum = parseInt(match[2]);
      
      if (year === currentYear) {
        return `PO-${year}-${String(currentNum + 1).padStart(3, '0')}`;
      } else {
        return `PO-${year}-001`;
      }
    }
    return "PO-2024-001";
  }

  async generateQuoteNumber() {
    const result = await db.select({ quoteNumber: quotations.quoteNumber })
      .from(quotations)
      .orderBy(desc(quotations.id))
      .limit(1);
    
    if (result.length === 0) {
      return "QT-2024-001";
    }
    
    const lastNumber = result[0].quoteNumber;
    const match = lastNumber.match(/QT-(\d{4})-(\d{3})/);
    if (match) {
      const year = new Date().getFullYear();
      const currentYear = parseInt(match[1]);
      const currentNum = parseInt(match[2]);
      
      if (year === currentYear) {
        return `QT-${year}-${String(currentNum + 1).padStart(3, '0')}`;
      } else {
        return `QT-${year}-001`;
      }
    }
    return "QT-2024-001";
  }

  // Stock Count operations
  async getStockCounts() {
    return await db.select({
      id: stockCounts.id,
      count_date: stockCounts.countDate,
      total_products: stockCounts.totalProducts,
      total_quantity: stockCounts.totalQuantity,
      created_by: stockCounts.createdBy,
      created_at: stockCounts.createdAt,
      updated_at: stockCounts.updatedAt,
    }).from(stockCounts).orderBy(desc(stockCounts.createdAt));
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

  async createStockCount(data: { items: any[] }) {
    const totalProducts = data.items.filter(item => item.quantity > 0).length;
    const totalQuantity = data.items.reduce((sum, item) => sum + item.quantity, 0);
    
    const [stockCount] = await db.insert(stockCounts).values({
      countDate: new Date(),
      totalProducts,
      totalQuantity,
      createdBy: 'admin',
    }).returning();

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
}

export const businessStorage = new BusinessStorage();