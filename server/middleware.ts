import type { Request, Response, NextFunction } from "express";
import { Client } from '@replit/object-storage';
import { users, auditLog, products, stockMovements, storageObjects, type InsertAuditLog, type User } from "@shared/schema";
import { db, pool } from "./db";
import { eq, sql } from "drizzle-orm";
import multer from 'multer';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';

export const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

setInterval(async () => {
  try {
    await pool.query('DELETE FROM signed_tokens WHERE expires < $1', [Date.now()]);
  } catch (err) {
    console.error('Failed to clean up expired signed tokens:', err);
  }
}, 60 * 60 * 1000);

export async function generateDOPDF(
  deliveryOrder: any,
  items: Array<{ productCode: string | null; description: string | null; quantity: number; unitPrice: string; lineTotal: string }>,
  company: { name?: string; address?: string; phone?: string; email?: string } | null
): Promise<string> {
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  const fmt = (n: string | number | null | undefined) =>
    Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const currency = deliveryOrder.currency || 'AED';

  const itemRows = items.map((item, idx) => `
    <tr>
      <td class="text-center">${idx + 1}</td>
      <td>${item.productCode || '-'}</td>
      <td>${item.description || '-'}</td>
      <td class="text-right">${item.quantity}</td>
      <td class="text-right">${fmt(item.unitPrice)}</td>
      <td class="text-right">${fmt(item.lineTotal)}</td>
    </tr>
  `).join('');

  const subtotal = parseFloat(deliveryOrder.subtotal || '0');
  const taxAmount = parseFloat(deliveryOrder.taxAmount || '0');
  const totalAmount = parseFloat(deliveryOrder.totalAmount || '0');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Delivery Order ${deliveryOrder.orderNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 13px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 24px; border-bottom: 2px solid #333; padding-bottom: 16px; }
        .do-title { font-size: 28px; font-weight: bold; color: #333; }
        .do-details { margin-top: 8px; }
        .do-details p { margin: 2px 0; }
        .company-info { text-align: right; }
        .company-info h2 { margin: 0 0 4px 0; font-size: 16px; }
        .company-info p { margin: 2px 0; }
        .section { margin-bottom: 16px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border: 1px solid #ddd; padding: 8px 10px; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .totals-table { width: 300px; margin-left: auto; margin-top: 16px; }
        .totals-table td { border: none; padding: 4px 8px; }
        .totals-table .total-row { font-weight: bold; border-top: 2px solid #333; }
        .signature-section { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
        .signature-box { text-align: center; border-top: 1px solid #333; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="do-title">DELIVERY ORDER</h1>
          <div class="do-details">
            <p>DO Number: <strong>${deliveryOrder.orderNumber}</strong></p>
            <p>Order Date: <strong>${formatDate(deliveryOrder.orderDate)}</strong></p>
            ${deliveryOrder.reference ? `<p>Reference: <strong>${deliveryOrder.reference}</strong></p>` : ''}
          </div>
        </div>
        <div class="company-info">
          <h2>${company?.name || ''}</h2>
          ${company?.address ? `<p>${company.address}</p>` : ''}
          ${company?.phone ? `<p>Tel: ${company.phone}</p>` : ''}
          ${company?.email ? `<p>Email: ${company.email}</p>` : ''}
        </div>
      </div>

      <div class="section grid">
        <div>
          <strong>Deliver To:</strong><br/>
          ${deliveryOrder.customerName}<br/>
          ${deliveryOrder.deliveryAddress || ''}
        </div>
        <div>
          <strong>Status:</strong> ${deliveryOrder.status}<br/>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th class="text-center" style="width:40px">No.</th>
            <th style="width:120px">Product Code</th>
            <th>Description</th>
            <th class="text-right" style="width:70px">Qty</th>
            <th class="text-right" style="width:110px">Unit Price (${currency})</th>
            <th class="text-right" style="width:110px">Total (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="6" style="text-align:center;color:#999">No items</td></tr>`}
        </tbody>
      </table>

      <table class="totals-table">
        <tbody>
          <tr>
            <td>Subtotal:</td>
            <td class="text-right">${currency} ${fmt(subtotal)}</td>
          </tr>
          ${taxAmount > 0 ? `<tr><td>VAT:</td><td class="text-right">${currency} ${fmt(taxAmount)}</td></tr>` : ''}
          <tr class="total-row">
            <td>Total:</td>
            <td class="text-right">${currency} ${fmt(totalAmount)}</td>
          </tr>
        </tbody>
      </table>

      ${deliveryOrder.notes ? `<div class="section" style="margin-top:20px"><strong>Remarks:</strong><br/>${deliveryOrder.notes}</div>` : ''}

      <div class="signature-section">
        <div class="signature-box"><p>Delivered By</p></div>
        <div class="signature-box"><p>Received By</p></div>
      </div>
    </body>
    </html>
  `;
}

export const upload = multer({ storage: multer.memoryStorage() });

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

export const requireOpsToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.OPS_TOKEN;

  if (!expectedToken) {
    return res.status(500).json({ error: 'OPS_TOKEN not configured' });
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required with Bearer token' });
  }

  const token = authHeader.substring(7);

  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid operations token' });
  }

  next();
};

export const validatePdfMagicBytes = (fileBuffer: Buffer) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  const magicBytes = fileBuffer.slice(0, 4).toString('ascii');
  if (magicBytes !== '%PDF') {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  console.log('Validated real PDF');
  return { valid: true };
};

export const validateImageMagicBytes = (fileBuffer: Buffer, contentType: string) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format.' };
  }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    if (fileBuffer[0] !== 0xFF || fileBuffer[1] !== 0xD8 || fileBuffer[2] !== 0xFF) {
      return { valid: false, error: 'Invalid file format. Only real JPEG images are allowed.' };
    }
  } else if (contentType === 'image/png') {
    if (fileBuffer[0] !== 0x89 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x4E || fileBuffer[3] !== 0x47) {
      return { valid: false, error: 'Invalid file format. Only real PNG images are allowed.' };
    }
  }
  return { valid: true };
};

export const validateUploadInput = (key: string, contentType: string, fileSize?: number) => {
  if (!key.startsWith('invoices/') && !key.startsWith('delivery/')) {
    return { valid: false, error: 'Key must start with invoices/ or delivery/' };
  }
  if (contentType !== 'application/pdf') {
    return { valid: false, error: 'Content type must be application/pdf' };
  }
  const maxSize = 25 * 1024 * 1024;
  if (fileSize && fileSize > maxSize) {
    return { valid: false, error: 'File size must be ≤ 25 MB' };
  }
  return { valid: true };
};

const PostgresSessionStore = connectPg(session);
export const sessionStore = new PostgresSessionStore({
  pool,
  createTableIfMissing: true,
  tableName: 'sessions'
});

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export const requireAuth = (allowedRoles: Array<"Admin" | "Manager" | "Staff"> = ["Admin", "Manager", "Staff"]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'User not found' });
      }
      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
};

export const requireRole = (role: "Admin" | "Manager" | "Staff") => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'User not found' });
      }
      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }
      if (user.role === 'Admin') {
        req.user = user;
        return next();
      }
      if (user.role !== role) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.user = user;
      next();
    } catch (error) {
      console.error('Role auth middleware error:', error);
      return res.status(500).json({ error: 'Authentication error' });
    }
  };
};

export const writeAuditLog = (auditData: InsertAuditLog) => {
  db.insert(auditLog).values(auditData).catch((err) => {
    console.error('Audit log write failed:', err);
  });
};

export type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function updateProductStock(
  productId: number,
  quantityChange: number,
  movementType: string,
  referenceId: number,
  referenceType: string,
  unitCost: number,
  notes: string,
  userId: string,
  tx?: DbClient
) {
  const dbClient: DbClient = tx ?? db;

  const [updated] = await dbClient
    .update(products)
    .set({
      stockQuantity: sql`COALESCE(stock_quantity, 0) + ${quantityChange}`,
      updatedAt: new Date()
    })
    .where(eq(products.id, productId))
    .returning({
      newStock: products.stockQuantity,
      previousStock: sql<number>`${products.stockQuantity} - ${quantityChange}`,
    });

  if (!updated) {
    throw new Error(`Product with ID ${productId} not found`);
  }

  const newStock = updated.newStock ?? 0;
  const previousStock = updated.previousStock ?? 0;

  await dbClient.insert(stockMovements).values({
    productId,
    movementType,
    referenceId,
    referenceType,
    quantity: quantityChange,
    previousStock,
    newStock,
    unitCost: unitCost.toString(),
    notes,
    createdBy: userId
  });

  return { previousStock, newStock };
}
