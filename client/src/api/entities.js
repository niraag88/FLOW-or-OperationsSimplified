// Real API entity implementations
class ApiEntity {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async list(sort) {
    const url = sort ? `/api/${this.endpoint}?sort=${encodeURIComponent(sort)}` : `/api/${this.endpoint}`;
    console.log(`Fetching ${this.endpoint} from:`, url);
    const response = await fetch(url, {
      credentials: 'include' // Include session cookies
    });
    console.log(`Response for ${this.endpoint}:`, response.status, response.ok);
    if (!response.ok) {
      console.error(`Failed to fetch ${this.endpoint}: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    const data = await response.json();
    console.log(`Data for ${this.endpoint}:`, data);
    return data;
  }

  async create(data) {
    const response = await fetch(`/api/${this.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Failed to create ${this.endpoint}`);
    return await response.json();
  }

  async update(id, data) {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`Failed to update ${this.endpoint}`);
    return await response.json();
  }

  async delete(id) {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`Failed to delete ${this.endpoint}`);
    return await response.json();
  }

  async getById(id) {
    const response = await fetch(`/api/${this.endpoint}/${id}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    return await response.json();
  }

  async filter(params) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/${this.endpoint}?${queryString}`);
    if (!response.ok) throw new Error(`Failed to filter ${this.endpoint}`);
    return await response.json();
  }
}

// Fallback entity for endpoints that don't exist yet
class FallbackEntity {
  constructor(name) {
    this.name = name;
  }

  async list(sort) {
    console.warn(`${this.name}.list() not implemented yet - returning empty array`);
    return [];
  }

  async create(data) {
    console.warn(`${this.name}.create() not implemented yet`);
    return { id: Math.random().toString(36).slice(2), ...data };
  }

  async update(id, data) {
    console.warn(`${this.name}.update() not implemented yet`);
    return { id, ...data };
  }

  async delete(id) {
    console.warn(`${this.name}.delete() not implemented yet`);
    return { success: true };
  }

  async getById(id) {
    console.warn(`${this.name}.getById() not implemented yet`);
    return null;
  }

  async filter(params) {
    console.warn(`${this.name}.filter() not implemented yet - returning empty array`);
    return [];
  }
}

// API-backed entities
export const Product = new ApiEntity('products');
export const Supplier = new ApiEntity('suppliers');
export const Customer = new ApiEntity('customers');
export const Brand = new ApiEntity('brands');
export const PurchaseOrder = new ApiEntity('purchase-orders');
export const Quotation = new ApiEntity('quotations');

// Fallback entities for features not yet implemented
export const GoodsReceipt = new FallbackEntity('GoodsReceipt');
export const DeliveryOrder = new FallbackEntity('DeliveryOrder');
export const Invoice = new FallbackEntity('Invoice');
export const InventoryLot = new FallbackEntity('InventoryLot');
export const StockCount = {
  ...new ApiEntity('stock-counts'),
  async getById(id) {
    const response = await fetch(`/api/stock-counts/${id}`);
    if (!response.ok) {
      throw new Error('Failed to fetch stock count');
    }
    return await response.json();
  }
};
export const CompanySettings = new FallbackEntity('CompanySettings');
export const Books = new FallbackEntity('Books');
export const StorageSettings = new FallbackEntity('StorageSettings');
export const StorageUsage = new FallbackEntity('StorageUsage');
export const RecycleBin = new FallbackEntity('RecycleBin');
export const AuditLog = new FallbackEntity('AuditLog');
export const InventoryAudit = new FallbackEntity('InventoryAudit');

// User auth entity
export const User = {
  async me() {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error('Failed to fetch user');
    }
    const data = await response.json();
    return data.user;
  }
};
