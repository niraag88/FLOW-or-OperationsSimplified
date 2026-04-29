interface EntityData {
  [key: string]: unknown;
}

class ApiEntity {
  endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async list(sort?: string): Promise<unknown[]> {
    const url = sort ? `/api/${this.endpoint}?sort=${encodeURIComponent(sort)}` : `/api/${this.endpoint}`;
    const response = await fetch(url, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    const result = await response.json() as unknown;
    return Array.isArray(result) ? result : ((result as EntityData)?.data as unknown[] ?? [result]);
  }

  async create(data: EntityData): Promise<unknown> {
    const response = await fetch(`/api/${this.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as EntityData;
      throw new Error((body.error as string) || `Failed to create ${this.endpoint}`);
    }
    return await response.json() as unknown;
  }

  async update(id: number | string, data: EntityData): Promise<unknown> {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as EntityData;
      throw new Error((body.error as string) || `Failed to update ${this.endpoint}`);
    }
    return await response.json() as unknown;
  }

  async delete(id: number | string): Promise<unknown> {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as EntityData;
      throw new Error((body.error as string) || `Failed to delete ${this.endpoint}`);
    }
    return await response.json() as unknown;
  }

  async getById(id: number | string): Promise<unknown> {
    const response = await fetch(`/api/${this.endpoint}/${id}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch ${this.endpoint}`);
    }
    return await response.json() as unknown;
  }

  async filter(params: Record<string, string>): Promise<unknown[]> {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/${this.endpoint}?${queryString}`, {
      credentials: 'include'
    });
    if (!response.ok) throw new Error(`Failed to filter ${this.endpoint}`);
    const result = await response.json() as unknown;
    return Array.isArray(result) ? result : ((result as EntityData)?.data as unknown[] ?? [result]);
  }
}

export const Product = new ApiEntity('products');
export const Supplier = new ApiEntity('suppliers');
export const Customer = new ApiEntity('customers');
export const Brand = new ApiEntity('brands');
export const PurchaseOrder = new ApiEntity('purchase-orders');
export const Quotation = new ApiEntity('quotations');

export const Invoice = new ApiEntity('invoices');
export const DeliveryOrder = new ApiEntity('delivery-orders');

export const StockCount = new ApiEntity('stock-counts');
export const CompanySettings = {
  async list(): Promise<unknown[]> {
    const response = await fetch('/api/company-settings', {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to fetch company settings');
    }
    const settings = await response.json() as unknown;
    return settings ? [settings] : [];
  },

  async create(data: EntityData): Promise<unknown> {
    const response = await fetch('/api/company-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to create company settings');
    }
    return await response.json() as unknown;
  },

  async update(_id: number | string, data: EntityData): Promise<unknown> {
    const response = await fetch('/api/company-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Failed to update company settings');
    }
    return await response.json() as unknown;
  }
};

interface RecycleBinEntity extends ApiEntity {
  restore(id: number | string): Promise<unknown>;
  // Server requires the typed confirmation phrase
  // (RECYCLE_BIN_PERMANENT_DELETE_PHRASE).
  deletePermanent(id: number | string, confirmation: string): Promise<unknown>;
}

const _recycleBinEntity = new ApiEntity('recycle-bin') as RecycleBinEntity;
_recycleBinEntity.restore = async function(id: number | string): Promise<unknown> {
  const response = await fetch(`/api/recycle-bin/${id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Failed to restore document');
  return await response.json() as unknown;
};
_recycleBinEntity.deletePermanent = async function(
  id: number | string,
  confirmation: string,
): Promise<unknown> {
  const response = await fetch(`/api/recycle-bin/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation }),
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as EntityData;
    throw new Error(
      (body.message as string) ||
        (body.error as string) ||
        'Failed to permanently delete document',
    );
  }
  return await response.json() as unknown;
};
export const RecycleBin = _recycleBinEntity;
export const AuditLog = new ApiEntity('audit-logs');

export const User = {
  async me(): Promise<unknown> {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    if (!response.ok) {
      if (response.status === 401) return null;
      throw new Error('Failed to fetch user');
    }
    const data = await response.json() as { user: unknown };
    return data.user;
  }
};
