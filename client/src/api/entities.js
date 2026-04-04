// Real API entity implementations
class ApiEntity {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async list(sort) {
    const url = sort ? `/api/${this.endpoint}?sort=${encodeURIComponent(sort)}` : `/api/${this.endpoint}`;
    const response = await fetch(url, {
      credentials: 'include' // Include session cookies
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    const result = await response.json();
    // Auto-extract .data from paginated responses { data: [], total: N }
    return Array.isArray(result) ? result : (result?.data ?? result);
  }

  async create(data) {
    const response = await fetch(`/api/${this.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include' // Include session cookies
    });
    if (!response.ok) throw new Error(`Failed to create ${this.endpoint}`);
    return await response.json();
  }

  async update(id, data) {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) throw new Error(`Failed to update ${this.endpoint}`);
    return await response.json();
  }

  async delete(id) {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) throw new Error(`Failed to delete ${this.endpoint}`);
    return await response.json();
  }

  async getById(id) {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    return await response.json();
  }

  async filter(params) {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/${this.endpoint}?${queryString}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error(`Failed to filter ${this.endpoint}`);
    const result = await response.json();
    // Auto-extract .data from paginated responses { data: [], total: N }
    return Array.isArray(result) ? result : (result?.data ?? result);
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

// API-backed entities now implemented
export const Invoice = new ApiEntity('invoices');
export const DeliveryOrder = new ApiEntity('delivery-orders');

// Fallback entities for features not yet implemented
export const GoodsReceipt = new FallbackEntity('GoodsReceipt');
export const InventoryLot = new FallbackEntity('InventoryLot');
export const StockCount = new ApiEntity('stock-counts');
export const CompanySettings = {
  async list() {
    const response = await fetch('/api/company-settings', {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch company settings');
    }
    const settings = await response.json();
    return settings ? [settings] : [];
  },
  
  async create(data) {
    const response = await fetch('/api/company-settings', {
      method: 'PUT', // Server uses PUT for both create and update
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to create company settings');
    }
    return await response.json();
  },
  
  async update(id, data) {
    const response = await fetch('/api/company-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to update company settings');
    }
    return await response.json();
  }
};
export const Books = new ApiEntity('books');
export const StorageSettings = new FallbackEntity('StorageSettings');
export const StorageUsage = new FallbackEntity('StorageUsage');
const _recycleBinEntity = new ApiEntity('recycle-bin');
_recycleBinEntity.restore = async function(id) {
  const response = await fetch(`/api/recycle-bin/${id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to restore document');
  return await response.json();
};
export const RecycleBin = _recycleBinEntity;
export const AuditLog = new ApiEntity('audit-logs');
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
