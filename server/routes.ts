import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import rateLimit from 'express-rate-limit';
import { storage } from "./storage";
import { businessStorage } from "./businessStorage";
import { Client } from '@replit/object-storage';
import { invoices, deliveryOrders, auditLog, users, recycleBin, type InsertAuditLog, type InsertUser, type UpdateUser, type User, type InsertInvoice } from "@shared/schema";
import { insertBrandSchema, insertSupplierSchema, insertCustomerSchema, insertProductSchema, insertPurchaseOrderSchema, insertQuotationSchema, insertInvoiceSchema, insertDeliveryOrderSchema, stockCounts, stockCountItems, goodsReceipts, goodsReceiptItems, stockMovements, products, purchaseOrders, purchaseOrderItems, invoiceLineItems, deliveryOrderItems, suppliers, brands, quotations, quotationItems, customers, companySettings, financialYears, insertFinancialYearSchema } from "@shared/schema";
import * as XLSX from 'xlsx';
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import pkg from 'pg';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import { execSync } from 'child_process';
const { Pool } = pkg;

// Initialize clients with the bucket ID from environment
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// In-memory store for signed URL tokens (in production, use Redis or similar)
const signedTokens = new Map<string, { key: string; expires: number; type: 'upload' | 'download'; contentType?: string; fileSize?: number; checksum?: string }>();

// Cleanup expired tokens every hour
setInterval(() => {
  const now = Date.now();
  const tokensToDelete: string[] = [];
  signedTokens.forEach((data, token) => {
    if (data.expires < now) {
      tokensToDelete.push(token);
    }
  });
  tokensToDelete.forEach(token => signedTokens.delete(token));
}, 60 * 60 * 1000);

// PDF generation helper functions
async function generateInvoicePDF(invoice: any): Promise<string> {
  const formatDate = (dateString: string | Date) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .invoice-title { font-size: 32px; font-weight: bold; color: #333; }
        .invoice-details { margin-top: 10px; }
        .company-info { text-align: right; }
        .section { margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .totals { text-align: right; margin-top: 20px; }
        .total-line { margin: 5px 0; }
        .final-total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .signature-section { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; }
        .signature-box { text-align: center; border-top: 1px solid #333; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="invoice-title">TAX INVOICE</h1>
          <div class="invoice-details">
            <p>Invoice Number: <strong>${invoice.invoiceNumber}</strong></p>
            <p>Invoice Date: <strong>${formatDate(invoice.createdAt)}</strong></p>
          </div>
        </div>
        <div class="company-info">
          <h2>Company Name</h2>
          <p>Company Address</p>
          <p>Tel: Company Phone</p>
          <p>Email: company@email.com</p>
        </div>
      </div>

      <div class="section grid">
        <div>
          <h3>Bill To:</h3>
          <p><strong>${invoice.customerName}</strong></p>
        </div>
        <div>
          <h3>Invoice Details:</h3>
          <p>Status: ${invoice.status}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Service/Product</td>
            <td class="text-right">$${invoice.amount}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="total-line final-total">Total: $${invoice.amount}</div>
      </div>

      <div class="signature-section">
        <div class="signature-box">
          <p>Authorized Signature</p>
        </div>
        <div class="signature-box">
          <p>Customer Signature</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generatePOPDF(purchaseOrder: any): Promise<string> {
  const formatDate = (dateString: string | Date) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB');
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Purchase Order ${purchaseOrder.poNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .po-title { font-size: 32px; font-weight: bold; color: #333; }
        .po-details { margin-top: 10px; }
        .company-info { text-align: right; }
        .section { margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        .totals { text-align: right; margin-top: 20px; }
        .total-line { margin: 5px 0; }
        .final-total { font-size: 18px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .text-right { text-align: right; }
        .signature-section { margin-top: 50px; display: grid; grid-template-columns: 1fr 1fr; gap: 50px; }
        .signature-box { text-align: center; border-top: 1px solid #333; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <h1 class="po-title">PURCHASE ORDER</h1>
          <div class="po-details">
            <p>PO Number: <strong>${purchaseOrder.poNumber}</strong></p>
            <p>Order Date: <strong>${formatDate(purchaseOrder.orderDate)}</strong></p>
            ${purchaseOrder.expectedDelivery ? `<p>Expected Delivery: <strong>${formatDate(purchaseOrder.expectedDelivery)}</strong></p>` : ''}
          </div>
        </div>
        <div class="company-info">
          <h2>SUPERNATURE LLC</h2>
          <p>Company Address</p>
          <p>Tel: Company Phone</p>
          <p>Email: company@email.com</p>
        </div>
      </div>

      <div class="section grid">
        <div>
          <h3>Supplier:</h3>
          <p><strong>${purchaseOrder.supplierName || 'Unknown Supplier'}</strong></p>
        </div>
        <div>
          <h3>Order Details:</h3>
          <p>Status: <strong>${purchaseOrder.status}</strong></p>
          <p>Currency: <strong>GBP</strong></p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product Code</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price (GBP)</th>
            <th>Line Total (GBP)</th>
          </tr>
        </thead>
        <tbody>
          ${purchaseOrder.items && purchaseOrder.items.length > 0 ? 
            purchaseOrder.items.map((item: any) => `
              <tr>
                <td>${item.product_code || ''}</td>
                <td>${item.description || ''}</td>
                <td class="text-right">${item.quantity || 0}</td>
                <td class="text-right">${(parseFloat(item.unit_price) || 0).toFixed(2)}</td>
                <td class="text-right">${(parseFloat(item.line_total) || 0).toFixed(2)}</td>
              </tr>
            `).join('') : 
            '<tr><td colspan="5" style="text-align: center; color: #666;">No line items added</td></tr>'
          }
        </tbody>
      </table>

      <div class="totals">
        <div class="total-line">
          <span>Total (GBP): <strong>${parseFloat(purchaseOrder.totalAmount || 0).toFixed(2)}</strong></span>
        </div>
        <div class="total-line">
          <span>Total (AED): <strong>${(parseFloat(purchaseOrder.totalAmount || 0) * 5.0).toFixed(2)}</strong></span>
        </div>
      </div>

      ${purchaseOrder.notes ? `
        <div class="section" style="margin-top: 30px;">
          <h3>Notes:</h3>
          <p>${purchaseOrder.notes}</p>
        </div>
      ` : ''}

      <div class="signature-section">
        <div class="signature-box">
          <p>Prepared By</p>
        </div>
        <div class="signature-box">
          <p>Approved By</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function generateDOPDF(
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

// Configure multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Session type declaration
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Operations token authentication middleware
const requireOpsToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.OPS_TOKEN;
  
  if (!expectedToken) {
    return res.status(500).json({ error: 'OPS_TOKEN not configured' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required with Bearer token' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Invalid operations token' });
  }
  
  next();
};

// Input validation functions
// Validate PDF magic bytes
const validatePdfMagicBytes = (fileBuffer: Buffer) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  
  // Check for PDF signature "%PDF" at the beginning
  const magicBytes = fileBuffer.slice(0, 4).toString('ascii');
  if (magicBytes !== '%PDF') {
    return { valid: false, error: 'Invalid file format. Only real PDF files are allowed.' };
  }
  
  console.log('Validated real PDF');
  return { valid: true };
};

const validateImageMagicBytes = (fileBuffer: Buffer, contentType: string) => {
  if (!fileBuffer || fileBuffer.length < 4) {
    return { valid: false, error: 'Invalid file format.' };
  }
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    // JPEG starts with FF D8 FF
    if (fileBuffer[0] !== 0xFF || fileBuffer[1] !== 0xD8 || fileBuffer[2] !== 0xFF) {
      return { valid: false, error: 'Invalid file format. Only real JPEG images are allowed.' };
    }
  } else if (contentType === 'image/png') {
    // PNG starts with 89 50 4E 47 (i.e. \x89PNG)
    if (fileBuffer[0] !== 0x89 || fileBuffer[1] !== 0x50 || fileBuffer[2] !== 0x4E || fileBuffer[3] !== 0x47) {
      return { valid: false, error: 'Invalid file format. Only real PNG images are allowed.' };
    }
  }
  return { valid: true };
};

const validateUploadInput = (key: string, contentType: string, fileSize?: number) => {
  // Validate key path
  if (!key.startsWith('invoices/') && !key.startsWith('delivery/')) {
    return { valid: false, error: 'Key must start with invoices/ or delivery/' };
  }
  
  // Validate content type
  if (contentType !== 'application/pdf') {
    return { valid: false, error: 'Content type must be application/pdf' };
  }
  
  // Validate file size (25 MB limit)
  const maxSize = 25 * 1024 * 1024; // 25 MB
  if (fileSize && fileSize > maxSize) {
    return { valid: false, error: 'File size must be ≤ 25 MB' };
  }
  
  return { valid: true };
};

// Session configuration
const PostgresSessionStore = connectPg(session);
const sessionStore = new PostgresSessionStore({
  pool,
  createTableIfMissing: true,
  tableName: 'sessions'
});

// Extended Request interface for authentication
interface AuthenticatedRequest extends Request {
  user?: User;
}

// Password hashing utilities
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Authentication middleware
const requireAuth = (allowedRoles: Array<"Admin" | "Manager" | "Staff"> = ["Admin", "Manager", "Staff"]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Get user from database
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

// Role-based authorization middleware
const requireRole = (role: "Admin" | "Manager" | "Staff") => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Get user from database
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: 'User not found' });
      }

      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      // Admin always has access
      if (user.role === 'Admin') {
        req.user = user;
        return next();
      }

      // Check specific role requirement
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Require SESSION_SECRET — refuse to start with a hardcoded fallback
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required but not set');
  }

  // Session middleware setup with hardened security
  app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
      httpOnly: true, // Prevent JavaScript access to cookies
      sameSite: 'lax', // CSRF protection
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '3600000'), // Default 1 hour (configurable)
    }
  }));
  // Rate limiters
  // Strict: 5 login attempts per 15 minutes per IP — blocks brute-force attacks
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // General: 300 requests per minute per IP — prevents API flooding
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Authentication endpoints
  
  // POST /api/auth/login
  app.post('/api/auth/login', loginLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      // Find user by username
      const [user] = await db.select().from(users).where(eq(users.username, username));
      
      if (!user || !await comparePassword(password, user.password)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));

      // Create session
      req.session.userId = user.id;

      // Return user info (without password)
      const { password: _, ...userInfo } = user;
      res.json({ user: userInfo });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  // GET /api/auth/me - Get current user
  app.get('/api/auth/me', requireAuth(), async (req: AuthenticatedRequest, res) => {
    const { password: _, ...userInfo } = req.user!;
    res.json({ user: userInfo });
  });

  // User Management (Admin only)
  
  // GET /api/users - List all users (Admin only)
  app.get('/api/users', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        active: users.active,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy
      }).from(users);
      
      res.json({ users: allUsers });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  // POST /api/users - Create new user (Admin only)
  app.post('/api/users', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password, role, firstName, lastName, email, active } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      // Check if username already exists
      const [existingUser] = await db.select().from(users).where(eq(users.username, username));
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create user
      const [newUser] = await db.insert(users).values({
        username,
        password: hashedPassword,
        role: role || 'Staff',
        firstName,
        lastName,
        email,
        active: active !== undefined ? active : true,
        createdBy: req.user!.id
      }).returning({
        id: users.id,
        username: users.username,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        active: users.active,
        createdAt: users.createdAt,
        createdBy: users.createdBy
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: newUser.id, targetType: 'user', action: 'CREATE', details: `User @${newUser.username} (${newUser.role}) created` });
      res.status(201).json({ user: newUser });

    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  // PUT /api/users/:id - Update user (Admin only)  
  app.put('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const { username, role, firstName, lastName, email, active, password } = req.body;

      // Validate optional username change — must be unique (excluding current user)
      if (username !== undefined && username !== '') {
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.username, username));
        if (existing && existing.id !== userId) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }

      // Validate optional password if provided (trim first for consistent behaviour)
      const trimmedPassword = typeof password === 'string' ? password.trim() : undefined;
      if (trimmedPassword) {
        if (trimmedPassword.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
      }

      // Hash the trimmed password if one was provided
      const hashedPassword = trimmedPassword ? await hashPassword(trimmedPassword) : undefined;

      const [updatedUser] = await db.update(users)
        .set({
          ...(username !== undefined && username !== '' && { username }),
          ...(role !== undefined && { role }),
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(email !== undefined && { email }),
          ...(active !== undefined && { active }),
          ...(hashedPassword !== undefined && { password: hashedPassword })
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          active: users.active,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
          createdBy: users.createdBy
        });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'UPDATE', details: `User @${updatedUser.username} updated` });
      res.json({ user: updatedUser });

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // DELETE /api/users/:id - Delete user (Admin only)
  app.delete('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;

      // Don't allow deleting yourself
      if (userId === req.user!.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const [deletedUser] = await db.delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id, username: users.username });

      if (!deletedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'DELETE', details: `User @${deletedUser.username} deleted` });
      res.json({ success: true, deletedUser });

    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // PUT /api/users/:id/password - Change user password (Admin only)
  app.put('/api/users/:id/password', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      // Hash the new password
      const hashedPassword = await hashPassword(password);

      // Update user's password
      const [updatedUser] = await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email
        });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'UPDATE', details: `Password changed for user @${updatedUser.username}` });
      res.json({ success: true, message: 'Password updated successfully' });

    } catch (error) {
      console.error('Error changing user password:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

  // Business Entity Management Routes
  
  // Brand management routes
  app.get('/api/brands', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const brands = await businessStorage.getBrands();
      res.json(brands);
    } catch (error) {
      console.error('Error fetching brands:', error);
      res.status(500).json({ error: 'Failed to fetch brands' });
    }
  });

  app.post('/api/brands', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertBrandSchema.parse(req.body);
      const brand = await businessStorage.createBrand(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brand.id), targetType: 'brand', action: 'CREATE', details: `Brand '${brand.name}' created` });
      res.status(201).json(brand);
    } catch (error) {
      console.error('Error creating brand:', error);
      res.status(500).json({ error: 'Failed to create brand' });
    }
  });

  app.put('/api/brands/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const validatedData = insertBrandSchema.partial().parse(req.body);
      const brand = await businessStorage.updateBrand(brandId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'UPDATE', details: `Brand '${brand.name}' updated` });
      res.json(brand);
    } catch (error) {
      console.error('Error updating brand:', error);
      res.status(500).json({ error: 'Failed to update brand' });
    }
  });

  app.delete('/api/brands/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const deletedBrand = await businessStorage.deleteBrand(brandId);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'DELETE', details: `Brand '${deletedBrand?.name || brandId}' deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting brand:', error);
      res.status(500).json({ error: 'Failed to delete brand' });
    }
  });

  // Supplier management routes
  app.get('/api/suppliers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const suppliers = await businessStorage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
  });

  app.post('/api/suppliers', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const supplier = await businessStorage.createSupplier(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplier.id), targetType: 'supplier', action: 'CREATE', details: `Supplier '${supplier.name}' created` });
      res.status(201).json(supplier);
    } catch (error) {
      console.error('Error creating supplier:', error);
      res.status(500).json({ error: 'Failed to create supplier' });
    }
  });

  app.put('/api/suppliers/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      const validatedData = insertSupplierSchema.partial().parse(req.body);
      const supplier = await businessStorage.updateSupplier(supplierId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'UPDATE', details: `Supplier '${supplier.name}' updated` });
      res.json(supplier);
    } catch (error) {
      console.error('Error updating supplier:', error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  });

  app.delete('/api/suppliers/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      const deletedSupplier = await businessStorage.deleteSupplier(supplierId);
      if (!deletedSupplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'DELETE', details: `Supplier '${deletedSupplier.name}' deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      res.status(500).json({ error: 'Failed to delete supplier' });
    }
  });

  // Customer management routes
  app.get('/api/customers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const customers = await businessStorage.getCustomers();
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.post('/api/customers', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await businessStorage.createCustomer(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(customer.id), targetType: 'customer', action: 'CREATE', details: `Customer '${customer.name}' created` });
      res.status(201).json(customer);
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: 'Failed to create customer' });
    }
  });

  app.put('/api/customers/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const customerId = parseInt(req.params.id);
      const validatedData = insertCustomerSchema.partial().parse(req.body);
      const customer = await businessStorage.updateCustomer(customerId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(customerId), targetType: 'customer', action: 'UPDATE', details: `Customer '${customer.name}' updated` });
      res.json(customer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  // Product management routes
  app.get('/api/products', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const products = await businessStorage.getProducts();
      
      // Handle filtering by query parameters
      if (req.query.sku) {
        const filteredProducts = products.filter(product => 
          product.sku === req.query.sku
        );
        return res.json(filteredProducts);
      }
      
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  });

  // Optimized endpoint for stock analysis with pre-calculated summaries
  app.get('/api/products/stock-analysis', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const lowStockThreshold = req.query.threshold ? parseInt(String(req.query.threshold)) : 6;
      const stockData = await businessStorage.getProductsWithStockAnalysis(lowStockThreshold);
      res.json(stockData);
    } catch (error) {
      console.error('Error fetching stock analysis:', error);
      res.status(500).json({ error: 'Failed to fetch stock analysis' });
    }
  });

  // Dashboard aggregation endpoint - replaces 9+ individual API calls
  app.get('/api/dashboard', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const dashboardData = await businessStorage.getDashboardData();
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  app.get('/api/products/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await businessStorage.getProductById(productId);
      
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      res.json(product);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ error: 'Failed to fetch product' });
    }
  });

  app.post('/api/products', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      const product = await businessStorage.createProduct(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(product.id), targetType: 'product', action: 'CREATE', details: `Product '${product.name}' (SKU: ${product.sku}) created` });
      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ error: 'Failed to create product' });
    }
  });

  app.put('/api/products/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const validatedData = insertProductSchema.partial().parse(req.body);
      const product = await businessStorage.updateProduct(productId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(productId), targetType: 'product', action: 'UPDATE', details: `Product '${product.name}' updated` });
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      const [productToDelete] = await db.select({ name: products.name, sku: products.sku }).from(products).where(eq(products.id, productId));
      await businessStorage.deleteProduct(productId);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(productId), targetType: 'product', action: 'DELETE', details: `Product '${productToDelete?.name || productId}' (SKU: ${productToDelete?.sku || '?'}) deleted` });
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // Purchase Order management routes
  app.get('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, supplierId, dateFrom, dateTo } = req.query as Record<string, string>;
      const result = await businessStorage.getPurchaseOrders({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        supplierId: supplierId ? parseInt(supplierId) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });

  // Get next PO number (preview only, doesn't increment)
  app.get('/api/purchase-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextPoNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next PO number:', error);
      res.status(500).json({ error: 'Failed to get next PO number' });
    }
  });

  app.post('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poNumber = await businessStorage.generatePoNumber();
      
      // Transform date strings to Date objects for validation
      const transformedBody = {
        ...req.body,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined
      };
      
      const validatedData = insertPurchaseOrderSchema.parse({
        ...transformedBody,
        poNumber,
        createdBy: req.user!.id
      });
      
      // Create the purchase order first
      const purchaseOrder = await businessStorage.createPurchaseOrder(validatedData);
      
      // If there are line items, save them
      if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
        for (const item of req.body.items) {
          if (item.productId && item.quantity > 0) {
            await db.insert(purchaseOrderItems).values({
              poId: purchaseOrder.id,
              productId: parseInt(item.productId),
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              lineTotal: item.lineTotal.toString()
            });
          }
        }
      }
      
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(purchaseOrder.id), targetType: 'purchase_order', action: 'CREATE', details: `PO #${purchaseOrder.poNumber} created` });
      res.status(201).json(purchaseOrder);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      res.status(500).json({ error: 'Failed to create purchase order' });
    }
  });

  app.put('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      
      const transformedBody = {
        ...req.body,
        supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : undefined,
        orderDate: req.body.orderDate ? new Date(req.body.orderDate) : undefined,
        expectedDelivery: req.body.expectedDelivery ? new Date(req.body.expectedDelivery) : undefined
      };
      
      const validatedData = insertPurchaseOrderSchema.partial().parse(transformedBody);
      
      // Update the purchase order
      const updatedPO = await businessStorage.updatePurchaseOrder(poId, validatedData);
      
      // Handle line items update
      if (req.body.items && Array.isArray(req.body.items)) {
        // Delete existing line items
        await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
        
        // Insert new line items
        for (const item of req.body.items) {
          if (item.productId && item.quantity > 0) {
            await db.insert(purchaseOrderItems).values({
              poId: poId,
              productId: parseInt(item.productId),
              quantity: item.quantity,
              unitPrice: item.unitPrice.toString(),
              lineTotal: item.lineTotal.toString()
            });
          }
        }
      }
      
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'UPDATE', details: `PO #${updatedPO.poNumber} updated (status: ${updatedPO.status})` });
      res.json(updatedPO);
    } catch (error) {
      console.error('Error updating purchase order:', error);
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  });

  app.delete('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      // Fetch PO header and line items before deleting
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));

      // Atomically save to recycle bin and delete
      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'PurchaseOrder',
          documentId: poId.toString(),
          documentNumber: po.poNumber,
          documentData: JSON.stringify({ header: po, items }),
          deletedBy: userEmail,
          originalStatus: po.status,
          canRestore: true,
        });
        await tx.delete(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
        await tx.delete(purchaseOrders).where(eq(purchaseOrders.id, poId));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(poId), targetType: 'purchase_order', action: 'DELETE', details: `PO #${po.poNumber} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      res.status(500).json({ error: 'Failed to delete purchase order' });
    }
  });

  // Get purchase order items for goods receipt
  app.get('/api/purchase-orders/:id/items', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      
      const items = await db.select({
        id: purchaseOrderItems.id,
        productId: purchaseOrderItems.productId,
        productName: products.name,
        productSku: products.sku,
        size: products.size,
        quantity: purchaseOrderItems.quantity,
        receivedQuantity: purchaseOrderItems.receivedQuantity,
        unitPrice: purchaseOrderItems.unitPrice,
        lineTotal: purchaseOrderItems.lineTotal
      })
      .from(purchaseOrderItems)
      .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
      .where(eq(purchaseOrderItems.poId, poId));
      
      res.json(items);
    } catch (error) {
      console.error('Error fetching PO items:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order items' });
    }
  });

  // Quotation management routes
  app.get('/api/quotations', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo } = req.query as Record<string, string>;
      const result = await businessStorage.getQuotations({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId ? parseInt(customerId) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      res.status(500).json({ error: 'Failed to fetch quotations' });
    }
  });

  // GET /api/invoices
  app.get('/api/invoices', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo } = req.query as Record<string, string>;
      const result = await businessStorage.getInvoices({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId ? parseInt(customerId) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      res.json(result);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  // Get next invoice number (preview only, doesn't increment)
  app.get('/api/invoices/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextInvoiceNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next invoice number:', error);
      res.status(500).json({ error: 'Failed to get next invoice number' });
    }
  });

  // Get specific invoice with items for editing
  app.get('/api/invoices/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get the invoice with customer details (using basic invoices table)
      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: invoices.customerName,
        invoiceDate: invoices.invoiceDate,
        amount: invoices.amount,
        vatAmount: invoices.vatAmount,
        status: invoices.status,
        notes: invoices.notes,
        currency: invoices.currency,
        reference: invoices.reference,
        referenceDate: invoices.referenceDate,
        createdAt: invoices.createdAt,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBillingAddress: customers.billingAddress,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment,
      }).from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(eq(invoices.id, id));
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Get line items with product details
      const lineItems = await db.select({
        id: invoiceLineItems.id,
        productId: invoiceLineItems.productId,
        brandId: invoiceLineItems.brandId,
        productCode: invoiceLineItems.productCode,
        description: invoiceLineItems.description,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        lineTotal: invoiceLineItems.lineTotal,
      }).from(invoiceLineItems)
        .leftJoin(products, eq(products.id, invoiceLineItems.productId))
        .where(eq(invoiceLineItems.invoiceId, id));

      const totalAmount = parseFloat(invoice.amount) || 0;
      const vatAmount = parseFloat(invoice.vatAmount || '0') || 0;
      const subtotal = totalAmount - vatAmount;

      // Derive tax_rate and tax_treatment — if VAT is stored use it;
      // otherwise fall back to the customer's VAT treatment (Local = StandardRated)
      let derivedTaxRate: number;
      let derivedTaxTreatment: string;
      if (vatAmount > 0 && subtotal > 0) {
        derivedTaxTreatment = 'StandardRated';
        derivedTaxRate = Math.round(vatAmount / subtotal * 10000) / 10000;
      } else {
        const localTreatments = ['Local', 'standard', 'Standard', 'local'];
        const isLocal = localTreatments.includes(invoice.customerVatTreatment || '');
        derivedTaxTreatment = isLocal ? 'StandardRated' : 'ZeroRated';
        derivedTaxRate = 0.05;
      }

      // Format the response with snake_case field names to match InvoiceForm expectations
      // All numeric fields returned as actual numbers to avoid string/number mismatch in forms
      const invoiceWithItems = {
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        customer_id: invoice.customerId,
        customer_name: invoice.customerName,
        invoice_date: invoice.invoiceDate ? String(invoice.invoiceDate).split('T')[0] : '',
        subtotal,
        tax_amount: vatAmount,
        total_amount: totalAmount,
        tax_rate: derivedTaxRate,
        tax_treatment: derivedTaxTreatment,
        currency: invoice.currency || 'AED',
        status: invoice.status,
        remarks: invoice.notes || '',
        show_remarks: !!(invoice.notes),
        reference: invoice.reference || '',
        reference_date: invoice.referenceDate ? String(invoice.referenceDate).split('T')[0] : '',
        attachments: [],
        customer: invoice.customerId ? {
          contact_name: invoice.customerContactPerson || '',
          email: invoice.customerEmail || '',
          phone: invoice.customerPhone || '',
          address: invoice.customerBillingAddress || '',
          trn_number: invoice.customerVatNumber || '',
          vat_treatment: invoice.customerVatTreatment || 'Local',
        } : null,
        items: lineItems.map(item => ({
          id: item.id,
          product_id: item.productId,
          product_name: item.productName || item.description,
          product_code: item.productCode || item.productSku || '',
          description: item.description || item.productName || '',
          size: item.productSize || '',
          brand_id: item.brandId,
          quantity: Number(item.quantity),
          unit_price: parseFloat(item.unitPrice) || 0,
          line_total: parseFloat(item.lineTotal) || 0,
        }))
      };
      
      res.json(invoiceWithItems);
    } catch (error) {
      console.error('Error fetching invoice:', error);
      res.status(500).json({ error: 'Failed to fetch invoice' });
    }
  });

  // POST /api/invoices/from-quotation - Create invoice from quotation (DISABLED - Enhanced system under development)
  // app.post('/api/invoices/from-quotation', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
  //   try {
  //     const { quotationId } = req.body;
  //     
  //     if (!quotationId) {
  //       return res.status(400).json({ error: 'Quotation ID is required' });
  //     }
  //     
  //     // Generate unique invoice number
  //     const nextNumber = await businessStorage.generateInvoiceNumber();
  //     
  //     console.log('Creating enhanced invoice from quotation:', quotationId);
  //     const invoice = await businessStorage.createEnhancedInvoiceFromQuotation(
  //       quotationId, 
  //       nextNumber, 
  //       req.user!.id
  //     );
  //     
  //     res.status(201).json(invoice);
  //   } catch (error) {
  //     console.error('Error creating invoice from quotation:', error);
  //     if (error instanceof Error) {
  //       res.status(400).json({ error: error.message });
  //     } else {
  //       res.status(500).json({ error: 'Failed to create invoice' });
  //     }
  //   }
  // });

  // POST /api/invoices - Create new invoice
  app.post('/api/invoices', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.generateInvoiceNumber();
      const body = req.body;

      // Look up customer name from customer_id
      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const invoiceData: InsertInvoice = {
        invoiceNumber: nextNumber,
        customerName,
        amount: body.total_amount ? body.total_amount.toString() : '0',
        status: body.status || 'draft',
        customerId: customerId,
        vatAmount: body.tax_amount ? body.tax_amount.toString() : undefined,
        invoiceDate: body.invoice_date || undefined,
        reference: body.reference || undefined,
        referenceDate: body.reference_date || undefined,
        notes: body.remarks || body.notes || undefined,
        currency: body.currency || 'AED',
        objectKey: undefined,
        scanKey: undefined,
      };

      const invoice = await businessStorage.createInvoice(invoiceData);

      // Save line items
      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(invoiceLineItems).values({
              invoiceId: invoice.id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoice.id), targetType: 'invoice', action: 'CREATE', details: `Invoice #${invoice.invoiceNumber} created for ${customerName}` });
      res.status(201).json({ ...invoice, items: body.items || [] });
    } catch (error) {
      console.error('Error creating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create invoice' });
      }
    }
  });

  // PUT /api/invoices/:id - Update existing invoice
  app.put('/api/invoices/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = req.body;

      // Look up customer name from customer_id
      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      // Update the invoice record
      await db.update(invoices).set({
        customerName,
        customerId: customerId || null,
        amount: body.total_amount ? body.total_amount.toString() : '0',
        vatAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        status: body.status || 'draft',
        invoiceDate: body.invoice_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        notes: body.remarks || body.notes || null,
        currency: body.currency || 'AED',
      }).where(eq(invoices.id, id));

      // Replace line items only when new items are explicitly provided
      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(invoiceLineItems).values({
              invoiceId: id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPDATE', details: `Invoice #${updated.invoiceNumber} updated (status: ${updated.status})` });
      res.json({ ...updated, items: body.items || [] });
    } catch (error) {
      console.error('Error updating invoice:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update invoice' });
      }
    }
  });

  // PATCH /api/invoices/:id/scan-key - Store an uploaded file's storage key
  app.patch('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(invoices).set({ scanKey }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'UPLOAD', details: `Scan attached to Invoice #${updated.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating invoice scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  // DELETE /api/invoices/:id/scan-key - Remove the uploaded file and clear the scan key
  app.delete('/api/invoices/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.scanKey) {
        try {
          await objectStorageClient.delete(invoice.scanKey);
        } catch (storageErr) {
          console.warn('Could not delete object from storage (clearing key anyway):', storageErr);
        }
      }
      await db.update(invoices).set({ scanKey: null }).where(eq(invoices.id, id));
      const [updated] = await db.select().from(invoices).where(eq(invoices.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'invoice', action: 'REMOVE_FILE', details: `Scan removed from Invoice #${invoice.invoiceNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing invoice scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  // GET /api/delivery-orders
  app.get('/api/delivery-orders', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { page, pageSize, search, status, customerId, dateFrom, dateTo } = req.query as Record<string, string>;
      const result = await businessStorage.getDeliveryOrders({
        page: page ? parseInt(page) : undefined,
        pageSize: pageSize ? parseInt(pageSize) : undefined,
        search: search || undefined,
        status: status || undefined,
        customerId: customerId ? parseInt(customerId) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      // Transform to snake_case field names the frontend expects
      const mappedData = result.data.map((d: any) => ({
        ...d,
        do_number: d.orderNumber,
        customer_name: d.customerName,
        order_date: d.orderDate,
        tax_amount: d.taxAmount,
        total_amount: d.totalAmount,
      }));
      res.json({ data: mappedData, total: result.total });
    } catch (error) {
      console.error('Error fetching delivery orders:', error);
      res.status(500).json({ error: 'Failed to fetch delivery orders' });
    }
  });

  // Get next delivery order number (preview only, doesn't increment)
  app.get('/api/delivery-orders/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextDoNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next delivery order number:', error);
      res.status(500).json({ error: 'Failed to get next delivery order number' });
    }
  });

  // GET /api/delivery-orders/:id - Get delivery order with items for editing
  app.get('/api/delivery-orders/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [doRecord] = await db.select({
        id: deliveryOrders.id,
        orderNumber: deliveryOrders.orderNumber,
        customerId: deliveryOrders.customerId,
        customerName: deliveryOrders.customerName,
        orderDate: deliveryOrders.orderDate,
        reference: deliveryOrders.reference,
        referenceDate: deliveryOrders.referenceDate,
        subtotal: deliveryOrders.subtotal,
        taxAmount: deliveryOrders.taxAmount,
        totalAmount: deliveryOrders.totalAmount,
        currency: deliveryOrders.currency,
        notes: deliveryOrders.notes,
        taxRate: deliveryOrders.taxRate,
        status: deliveryOrders.status,
        customerVatTreatment: customers.vatTreatment,
      }).from(deliveryOrders)
        .leftJoin(customers, eq(customers.id, deliveryOrders.customerId))
        .where(eq(deliveryOrders.id, id));

      if (!doRecord) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      const lineItems = await db.select({
        id: deliveryOrderItems.id,
        productId: deliveryOrderItems.productId,
        brandId: deliveryOrderItems.brandId,
        productCode: deliveryOrderItems.productCode,
        description: deliveryOrderItems.description,
        productName: products.name,
        productSku: products.sku,
        productSize: products.size,
        quantity: deliveryOrderItems.quantity,
        unitPrice: deliveryOrderItems.unitPrice,
        lineTotal: deliveryOrderItems.lineTotal,
      }).from(deliveryOrderItems)
        .leftJoin(products, eq(products.id, deliveryOrderItems.productId))
        .where(eq(deliveryOrderItems.doId, id));

      // All numeric fields returned as actual numbers to avoid string/number mismatch in forms
      const taxAmt = parseFloat(doRecord.taxAmount || '0');
      const taxRt = doRecord.taxRate ? parseFloat(doRecord.taxRate) : 0.05;
      const doSubtotal = parseFloat(doRecord.subtotal || '0');
      const doTotal = parseFloat(doRecord.totalAmount || '0');
      res.json({
        id: doRecord.id,
        do_number: doRecord.orderNumber,
        customer_id: doRecord.customerId,
        customer_name: doRecord.customerName,
        order_date: doRecord.orderDate ? String(doRecord.orderDate).split('T')[0] : '',
        reference: doRecord.reference || '',
        reference_date: doRecord.referenceDate ? String(doRecord.referenceDate).split('T')[0] : '',
        subtotal: doSubtotal,
        tax_amount: taxAmt,
        total_amount: doTotal,
        currency: doRecord.currency || 'AED',
        remarks: doRecord.notes || '',
        show_remarks: !!(doRecord.notes),
        tax_rate: taxRt,
        tax_treatment: (() => {
          if (taxAmt > 0) return 'StandardRated';
          const localTreatments = ['Local', 'standard', 'Standard', 'local'];
          return localTreatments.includes(doRecord.customerVatTreatment || '') ? 'StandardRated' : 'ZeroRated';
        })(),
        status: doRecord.status,
        attachments: [],
        items: lineItems.map(item => ({
          id: item.id,
          product_id: item.productId,
          product_name: item.productName || item.description,
          product_code: item.productCode || item.productSku || '',
          description: item.description || item.productName || '',
          size: item.productSize || '',
          brand_id: item.brandId,
          quantity: Number(item.quantity),
          unit_price: parseFloat(item.unitPrice) || 0,
          line_total: parseFloat(item.lineTotal) || 0,
        }))
      });
    } catch (error) {
      console.error('Error fetching delivery order:', error);
      res.status(500).json({ error: 'Failed to fetch delivery order' });
    }
  });

  // POST /api/delivery-orders - Create new delivery order
  app.post('/api/delivery-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.generateDoNumber();
      const body = req.body;

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      const [doRecord] = await db.insert(deliveryOrders).values({
        orderNumber: body.do_number || nextNumber,
        customerName,
        customerId: customerId || null,
        deliveryAddress: '',
        status: body.status || 'draft',
        orderDate: body.order_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        subtotal: body.subtotal ? body.subtotal.toString() : '0',
        taxAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        totalAmount: body.total_amount ? body.total_amount.toString() : '0',
        currency: body.currency || 'AED',
        notes: body.remarks || body.notes || null,
        taxRate: body.tax_rate ? body.tax_rate.toString() : '0.05',
      }).returning();

      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(deliveryOrderItems).values({
              doId: doRecord.id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(doRecord.id), targetType: 'delivery_order', action: 'CREATE', details: `DO #${doRecord.orderNumber} created for ${customerName}` });
      res.status(201).json({ ...doRecord, do_number: doRecord.orderNumber, items: body.items || [] });
    } catch (error) {
      console.error('Error creating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create delivery order' });
      }
    }
  });

  // PUT /api/delivery-orders/:id - Update existing delivery order
  app.put('/api/delivery-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = req.body;

      let customerName = body.customer_name || 'Unknown Customer';
      let customerId: number | undefined = undefined;
      if (body.customer_id) {
        const customer = await businessStorage.getCustomerById(parseInt(body.customer_id));
        if (customer) {
          customerName = customer.name;
          customerId = customer.id;
        }
      }

      await db.update(deliveryOrders).set({
        customerName,
        customerId: customerId || null,
        status: body.status || 'draft',
        orderDate: body.order_date || null,
        reference: body.reference || null,
        referenceDate: body.reference_date || null,
        subtotal: body.subtotal ? body.subtotal.toString() : '0',
        taxAmount: body.tax_amount ? body.tax_amount.toString() : '0',
        totalAmount: body.total_amount ? body.total_amount.toString() : '0',
        currency: body.currency || 'AED',
        notes: body.remarks || body.notes || null,
        taxRate: body.tax_rate ? body.tax_rate.toString() : '0.05',
      }).where(eq(deliveryOrders.id, id));

      await db.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, id));
      if (body.items && Array.isArray(body.items) && body.items.length > 0) {
        for (const item of body.items) {
          if (Number(item.quantity) > 0 && Number(item.unit_price) >= 0) {
            await db.insert(deliveryOrderItems).values({
              doId: id,
              productId: item.product_id ? parseInt(item.product_id) : null,
              brandId: item.brand_id ? parseInt(item.brand_id) : null,
              productCode: item.product_code || null,
              description: item.description || item.product_name || '',
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              lineTotal: item.line_total.toString(),
            });
          }
        }
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPDATE', details: `DO #${updated.orderNumber} updated (status: ${updated.status})` });
      res.json({ ...updated, do_number: updated.orderNumber, items: body.items || [] });
    } catch (error) {
      console.error('Error updating delivery order:', error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update delivery order' });
      }
    }
  });

  // PATCH /api/delivery-orders/:id/scan-key - Store an uploaded file's storage key
  app.patch('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const { scanKey } = req.body;
      if (!scanKey || typeof scanKey !== 'string') {
        return res.status(400).json({ error: 'scanKey is required' });
      }
      await db.update(deliveryOrders).set({ scanKey }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'UPLOAD', details: `Scan attached to DO #${updated.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to update scan key' });
    }
  });

  // DELETE /api/delivery-orders/:id/scan-key - Remove the uploaded file and clear the scan key
  app.delete('/api/delivery-orders/:id/scan-key', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }
      if (doRecord.scanKey) {
        try {
          await objectStorageClient.delete(doRecord.scanKey);
        } catch (storageErr) {
          console.warn('Could not delete object from storage (clearing key anyway):', storageErr);
        }
      }
      await db.update(deliveryOrders).set({ scanKey: null }).where(eq(deliveryOrders.id, id));
      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'delivery_order', action: 'REMOVE_FILE', details: `Scan removed from DO #${doRecord.orderNumber}` });
      res.json(updated);
    } catch (error) {
      console.error('Error removing delivery order scan key:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  app.post('/api/quotations', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const quoteNumber = await businessStorage.generateQuotationNumber();
      
      // Convert string dates back to Date objects for validation
      const requestData = {
        ...req.body,
        quoteNumber,
        createdBy: req.user!.id,
        quoteDate: req.body.quoteDate ? new Date(req.body.quoteDate) : undefined,
        validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
        referenceDate: req.body.reference_date ? new Date(req.body.reference_date) : undefined
      };
      
      const validatedData = insertQuotationSchema.parse(requestData);
      const quotation = await businessStorage.createQuotation(validatedData);
      
      // If there are line items, save them (same as PO system)
      if (req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0) {
        for (const item of req.body.items) {
          if (item.product_id && Number(item.quantity) > 0) {
            await db.insert(quotationItems).values({
              quoteId: quotation.id,
              productId: parseInt(item.product_id),
              quantity: Number(item.quantity),
              unitPrice: item.unit_price.toString(),
              discount: item.discount ? item.discount.toString() : "0.00",
              vatRate: item.vat_rate ? item.vat_rate.toString() : "0.05",
              lineTotal: item.line_total.toString()
            });
          }
        }
      }
      
      const quoteCustomerName = req.body.customerName || `Customer ID ${req.body.customerId || 'unknown'}`;
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(quotation.id), targetType: 'quotation', action: 'CREATE', details: `Quotation #${quotation.quoteNumber} created for ${quoteCustomerName}` });
      res.status(201).json(quotation);
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ error: 'Failed to create quotation' });
    }
  });

  // Get next quotation number (preview only, doesn't increment)
  app.get('/api/quotations/next-number', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const nextNumber = await businessStorage.getNextQuotationNumber();
      res.json({ nextNumber });
    } catch (error) {
      console.error('Error getting next quotation number:', error);
      res.status(500).json({ error: 'Failed to get next quotation number' });
    }
  });

  // Get specific quotation with items for editing
  app.get('/api/quotations/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const quotation = await businessStorage.getQuotationWithItems(id);
      if (!quotation) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      res.json(quotation);
    } catch (error) {
      console.error('Error fetching quotation:', error);
      res.status(500).json({ error: 'Failed to fetch quotation' });
    }
  });

  // Get quotation items for editing (optimized like PO system)
  app.get('/api/quotations/:id/items', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const quoteId = parseInt(req.params.id);
      
      const items = await db.select({
        id: quotationItems.id,
        productId: quotationItems.productId,
        productName: products.name,
        productSku: products.sku,
        quantity: quotationItems.quantity,
        unitPrice: quotationItems.unitPrice,
        discount: quotationItems.discount,
        vatRate: quotationItems.vatRate,
        lineTotal: quotationItems.lineTotal,
        description: products.name // Use product name as description
      })
      .from(quotationItems)
      .leftJoin(products, eq(quotationItems.productId, products.id))
      .where(eq(quotationItems.quoteId, quoteId));
      
      res.json(items);
    } catch (error) {
      console.error('Error fetching quotation items:', error);
      res.status(500).json({ error: 'Failed to fetch quotation items' });
    }
  });

  // Update quotation
  app.put('/api/quotations/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Convert date strings to Date objects if present
      const processedData = { ...req.body };
      if (processedData.quoteDate && typeof processedData.quoteDate === 'string') {
        processedData.quoteDate = new Date(processedData.quoteDate);
      }
      if (processedData.validUntil && typeof processedData.validUntil === 'string') {
        processedData.validUntil = new Date(processedData.validUntil);
      }
      if (processedData.referenceDate && typeof processedData.referenceDate === 'string') {
        processedData.referenceDate = new Date(processedData.referenceDate);
      }
      
      const validatedData = insertQuotationSchema.partial().parse(processedData);
      const updatedQuote = await businessStorage.updateQuotation(id, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'quotation', action: 'UPDATE', details: `Quotation #${updatedQuote.quoteNumber} updated (status: ${updatedQuote.status})` });
      res.json(updatedQuote);
    } catch (error) {
      console.error('Error updating quotation:', error);
      res.status(500).json({ error: 'Failed to update quotation' });
    }
  });

  // Delete quotation
  app.delete('/api/quotations/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const userEmail = req.user?.email || req.user?.username || 'unknown';

      // Fetch quotation header and line items before deleting
      const [quoteHeader] = await db.select().from(quotations).where(eq(quotations.id, id));
      if (!quoteHeader) {
        return res.status(404).json({ error: 'Quotation not found' });
      }
      const lineItems = await db.select().from(quotationItems).where(eq(quotationItems.quoteId, id));
      const header = quoteHeader;

      // Atomically save to recycle bin and delete
      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'Quotation',
          documentId: id.toString(),
          documentNumber: header.quoteNumber,
          documentData: JSON.stringify({ header, items: lineItems }),
          deletedBy: userEmail,
          originalStatus: header.status,
          canRestore: true,
        });
        await tx.delete(quotationItems).where(eq(quotationItems.quoteId, id));
        await tx.delete(quotations).where(eq(quotations.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'quotation', action: 'DELETE', details: `Quotation #${quoteHeader.quoteNumber} deleted (moved to recycle bin)` });
      res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
      console.error('Error deleting quotation:', error);
      res.status(500).json({ error: 'Failed to delete quotation' });
    }
  });

  // Stock Count management routes
  app.get('/api/stock-counts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountsList = await db.select({
        id: stockCounts.id,
        countDate: stockCounts.countDate,
        totalProducts: stockCounts.totalProducts,
        totalQuantity: stockCounts.totalQuantity,
        createdBy: stockCounts.createdBy,
        createdAt: stockCounts.createdAt
      }).from(stockCounts).orderBy(desc(stockCounts.createdAt));
      
      res.json(stockCountsList);
    } catch (error) {
      console.error('Error fetching stock counts:', error);
      res.status(500).json({ error: 'Failed to fetch stock counts' });
    }
  });

  app.get('/api/stock-counts/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      
      // Get stock count header
      const [stockCount] = await db.select().from(stockCounts).where(eq(stockCounts.id, stockCountId));
      if (!stockCount) {
        return res.status(404).json({ error: 'Stock count not found' });
      }
      
      // Get stock count items
      const items = await db.select().from(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));
      
      res.json({ ...stockCount, items });
    } catch (error) {
      console.error('Error fetching stock count:', error);
      res.status(500).json({ error: 'Failed to fetch stock count' });
    }
  });

  app.post('/api/stock-counts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const { items } = req.body;
      
      // Validate input
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required and cannot be empty' });
      }
      
      // Filter items with quantity > 0
      const validItems = items.filter(item => item.quantity > 0);
      if (validItems.length === 0) {
        return res.status(400).json({ error: 'At least one item must have a quantity greater than 0' });
      }
      
      // Calculate totals
      const totalProducts = validItems.length;
      const totalQuantity = validItems.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
      
      // Create stock count header
      const [stockCount] = await db.insert(stockCounts).values({
        countDate: new Date(),
        totalProducts,
        totalQuantity,
        createdBy: req.user.id
      }).returning();
      
      // Create stock count items
      const stockCountItemsData = validItems.map(item => ({
        stockCountId: stockCount.id,
        productId: item.product_id,
        productCode: item.product_code,
        brandName: item.brand_name || '',
        productName: item.product_name,
        size: item.size || '',
        quantity: parseInt(item.quantity) || 0
      }));
      
      await db.insert(stockCountItems).values(stockCountItemsData);
      
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCount.id), targetType: 'stock_count', action: 'CREATE', details: `Stock count created: ${totalProducts} products, ${totalQuantity} total qty` });
      res.status(201).json({ 
        id: stockCount.id,
        message: `Stock count created with ${totalProducts} products and ${totalQuantity} total quantity` 
      });
    } catch (error) {
      console.error('Error creating stock count:', error);
      res.status(500).json({ error: 'Failed to create stock count' });
    }
  });

  app.delete('/api/stock-counts/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const stockCountId = parseInt(req.params.id);
      
      // Delete items first due to foreign key constraint
      await db.delete(stockCountItems).where(eq(stockCountItems.stockCountId, stockCountId));
      // Then delete the stock count
      await db.delete(stockCounts).where(eq(stockCounts.id, stockCountId));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(stockCountId), targetType: 'stock_count', action: 'DELETE', details: `Stock count #${stockCountId} deleted` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting stock count:', error);
      res.status(500).json({ error: 'Failed to delete stock count' });
    }
  });

  // === AUTOMATED INVENTORY MANAGEMENT ===

  // Helper function to update product stock and create movement record
  async function updateProductStock(productId: number, quantityChange: number, movementType: string, referenceId: number, referenceType: string, unitCost: number, notes: string, userId: string) {
    // Get current product stock
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product) {
      throw new Error(`Product with ID ${productId} not found`);
    }

    const previousStock = product.stockQuantity || 0;
    const newStock = previousStock + quantityChange;

    // Update product stock quantity
    await db.update(products)
      .set({ 
        stockQuantity: newStock,
        updatedAt: new Date()
      })
      .where(eq(products.id, productId));

    // Create stock movement record
    await db.insert(stockMovements).values({
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

  // Get all goods receipts
  app.get('/api/goods-receipts', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const receipts = await db.select({
        id: goodsReceipts.id,
        receiptNumber: goodsReceipts.receiptNumber,
        poId: goodsReceipts.poId,
        supplierId: goodsReceipts.supplierId,
        receivedDate: goodsReceipts.receivedDate,
        status: goodsReceipts.status,
        notes: goodsReceipts.notes,
        createdAt: goodsReceipts.createdAt
      }).from(goodsReceipts).orderBy(desc(goodsReceipts.createdAt));
      
      res.json(receipts);
    } catch (error) {
      console.error('Error fetching goods receipts:', error);
      res.status(500).json({ error: 'Failed to fetch goods receipts' });
    }
  });

  // Create goods receipt from purchase order
  app.post('/api/goods-receipts', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { poId, items, notes, forceClose } = req.body;
      
      if (!poId || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Purchase Order ID and items are required' });
      }

      // Get purchase order details
      const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Generate receipt number
      const receiptCount = await db.select().from(goodsReceipts).then(rows => rows.length);
      const receiptNumber = `GR${String(receiptCount + 1).padStart(4, '0')}`;

      // Create goods receipt
      const [receipt] = await db.insert(goodsReceipts).values({
        receiptNumber,
        poId,
        supplierId: po.supplierId,
        receivedDate: new Date(),
        status: 'confirmed',
        notes: notes || '',
        createdBy: req.user!.id
      }).returning();

      // Process each item and update stock
      for (const item of items) {
        if (item.receivedQuantity > 0) { // Only process items with received quantity
          // Create receipt item
          await db.insert(goodsReceiptItems).values({
            receiptId: receipt.id,
            poItemId: item.poItemId,
            productId: item.productId,
            orderedQuantity: item.orderedQuantity,
            receivedQuantity: item.receivedQuantity,
            unitPrice: item.unitPrice.toString()
          });

          // Update product stock automatically
          await updateProductStock(
            item.productId,
            item.receivedQuantity, // Add to stock
            'goods_receipt',
            receipt.id,
            'goods_receipt',
            parseFloat(item.unitPrice),
            `Goods received from PO ${po.poNumber}`,
            req.user!.id
          );
        }

        // Update PO item received quantity (cumulative)
        const currentItem = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.id, item.poItemId)).limit(1);
        const newReceivedQuantity = (currentItem[0]?.receivedQuantity || 0) + item.receivedQuantity;
        
        await db.update(purchaseOrderItems)
          .set({ receivedQuantity: newReceivedQuantity })
          .where(eq(purchaseOrderItems.id, item.poItemId));
      }

      // Update PO status logic
      const poItems = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.poId, poId));
      const allReceived = poItems.every(item => (item.receivedQuantity ?? 0) >= item.quantity);
      
      if (allReceived || forceClose) {
        await db.update(purchaseOrders)
          .set({ status: 'closed', updatedAt: new Date() })
          .where(eq(purchaseOrders.id, poId));
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(receipt.id), targetType: 'goods_receipt', action: 'CREATE', details: `Goods receipt ${receipt.receiptNumber} from PO #${po.poNumber}` });
      res.status(201).json({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        poStatus: (allReceived || forceClose) ? 'closed' : 'submitted',
        message: `Goods receipt ${receipt.receiptNumber} created and stock updated for ${items.filter(i => i.receivedQuantity > 0).length} products`
      });
      
    } catch (error) {
      console.error('Error creating goods receipt:', error);
      res.status(500).json({ error: 'Failed to create goods receipt' });
    }
  });

  // Process invoice sale and deduct stock automatically
  app.post('/api/invoices/:id/process-sale', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      
      // Get invoice items (from invoiceLineItems table)
      const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId));
      
      if (items.length === 0) {
        return res.status(400).json({ error: 'No items found for this invoice' });
      }

      // Process each item and deduct from stock
      for (const item of items) {
        if (!item.productId) continue;
        await updateProductStock(
          item.productId,
          -item.quantity, // Deduct from stock (negative quantity)
          'sale',
          invoiceId,
          'invoice',
          parseFloat(item.unitPrice.toString()),
          `Sale from Invoice #${invoiceId}`,
          req.user!.id
        );
      }

      // Update invoice status to mark as stock-processed (on basic invoices table)
      await db.update(invoices)
        .set({ status: 'confirmed' })
        .where(eq(invoices.id, invoiceId));

      const [processedInvoice] = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, invoiceId));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(invoiceId), targetType: 'invoice', action: 'UPDATE', details: `Invoice #${processedInvoice?.invoiceNumber || invoiceId} processed: stock deducted for ${items.length} products` });
      res.json({
        message: `Stock deducted for ${items.length} products from invoice #${invoiceId}`
      });
      
    } catch (error) {
      console.error('Error processing invoice sale:', error);
      res.status(500).json({ error: 'Failed to process invoice sale' });
    }
  });

  // Get stock movements for a product
  app.get('/api/products/:id/stock-movements', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      
      const movements = await db.select().from(stockMovements)
        .where(eq(stockMovements.productId, productId))
        .orderBy(desc(stockMovements.createdAt));
      
      res.json(movements);
    } catch (error) {
      console.error('Error fetching stock movements:', error);
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  });

  // Get all stock movements with product details
  app.get('/api/stock-movements', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const movements = await db.select({
        id: stockMovements.id,
        productId: stockMovements.productId,
        productName: products.name,
        productSku: products.sku,
        movementType: stockMovements.movementType,
        referenceId: stockMovements.referenceId,
        referenceType: stockMovements.referenceType,
        quantity: stockMovements.quantity,
        previousStock: stockMovements.previousStock,
        newStock: stockMovements.newStock,
        unitCost: stockMovements.unitCost,
        notes: stockMovements.notes,
        createdAt: stockMovements.createdAt
      })
      .from(stockMovements)
      .leftJoin(products, eq(stockMovements.productId, products.id))
      .orderBy(desc(stockMovements.createdAt));
      
      res.json(movements);
    } catch (error) {
      console.error('Error fetching stock movements:', error);
      res.status(500).json({ error: 'Failed to fetch stock movements' });
    }
  });

  // Bulk create stock movements for initial stock setup
  app.post('/api/stock-movements/bulk', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const { movements } = req.body;
      
      if (!movements || !Array.isArray(movements)) {
        return res.status(400).json({ error: 'Movements array is required' });
      }

      const results = [];
      
      // Process each movement
      for (const movement of movements) {
        const { productId, quantity, movementType, notes } = movement;
        
        if (!productId || !quantity || quantity <= 0) {
          continue; // Skip invalid movements
        }

        // Get current product stock
        const [product] = await db.select().from(products)
          .where(eq(products.id, productId))
          .limit(1);
          
        if (!product) {
          continue; // Skip if product doesn't exist
        }

        const previousStock = product.stockQuantity || 0;
        const newStock = previousStock + quantity;

        // Create stock movement record
        const [stockMovement] = await db.insert(stockMovements).values({
          productId,
          movementType: movementType || 'adjustment',
          quantity,
          previousStock,
          newStock,
          unitCost: product.costPrice || '0.00',
          notes: notes || 'Initial stock entry',
          createdBy: req.user!.id
        }).returning();

        // Update product stock
        await db.update(products)
          .set({ 
            stockQuantity: newStock,
            updatedAt: new Date()
          })
          .where(eq(products.id, productId));

        results.push(stockMovement);
      }

      res.json({ 
        success: true, 
        created: results.length,
        movements: results 
      });
    } catch (error) {
      console.error('Error creating bulk stock movements:', error);
      res.status(500).json({ error: 'Failed to create stock movements' });
    }
  });

  // Dashboard statistics
  app.get('/api/dashboard/stats', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await businessStorage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
  });

  // Company settings
  app.get('/api/company-settings', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const settings = await businessStorage.getCompanySettings();
      res.json(settings || {});
    } catch (error) {
      console.error('Error fetching company settings:', error);
      res.status(500).json({ error: 'Failed to fetch company settings' });
    }
  });

  app.put('/api/company-settings', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const settings = await businessStorage.updateCompanySettings({
        ...req.body,
        updatedBy: req.user!.id
      });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: 'company', targetType: 'company_settings', action: 'UPDATE', details: 'Company settings updated' });
      res.json(settings);
    } catch (error) {
      console.error('Error updating company settings:', error);
      res.status(500).json({ error: 'Failed to update company settings' });
    }
  });

  // POST /api/storage/sign-upload
  // Generate a signed token for uploading files (since Replit doesn't support native signed URLs)
  app.post('/api/storage/sign-upload', requireAuth(['Admin', 'Staff', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const { key, contentType, checksum, fileSize } = req.body;
      
      if (!key) {
        return res.status(400).json({ error: 'Key is required' });
      }
      
      if (!contentType) {
        return res.status(400).json({ error: 'Content type is required' });
      }
      
      // Validate input
      const validation = validateUploadInput(key, contentType, fileSize);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Additional role-based validation
      if (req.user?.role !== 'Admin') {
        // Staff/Manager can only upload to their own invoices/delivery orders
        // This would need proper user ID checking in a real implementation
        if (!key.includes(req.user?.id || '')) {
          return res.status(403).json({ error: 'Can only upload to your own files' });
        }
      }

      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (10 * 60 * 1000); // 10 minutes

      // Store token with metadata including validation info
      signedTokens.set(token, {
        key: key,
        expires: expires,
        type: 'upload',
        contentType: contentType,
        fileSize: fileSize,
        checksum: checksum
      });

      // Return upload URL that points to our proxy endpoint
      const uploadUrl = `/api/storage/upload/${token}`;

      res.json({
        url: uploadUrl,
        method: 'PUT',
        headers: {
          'Content-Type': contentType || 'application/octet-stream',
          ...(checksum && { 'Content-MD5': checksum })
        }
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // PUT /api/storage/upload/:token
  // Handle uploads via signed token
  app.put('/api/storage/upload/:token', upload.single('file'), async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = signedTokens.get(token);

      if (!tokenData || tokenData.expires < Date.now() || tokenData.type !== 'upload') {
        return res.status(401).json({ error: 'Invalid or expired upload token' });
      }

      // Get file data from request body (for PUT with raw data) or from multer
      let fileData: Buffer;
      if (req.file) {
        fileData = req.file.buffer;
      } else {
        // Handle raw PUT data
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        await new Promise((resolve) => req.on('end', resolve));
        fileData = Buffer.concat(chunks);
      }
      
      // Validate file size against token
      if (tokenData.fileSize && fileData.length !== tokenData.fileSize) {
        signedTokens.delete(token);
        return res.status(400).json({ error: 'File size mismatch' });
      }
      
      // Validate checksum if provided
      if (tokenData.checksum) {
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(fileData).digest('hex');
        if (hash !== tokenData.checksum) {
          signedTokens.delete(token);
          return res.status(400).json({ error: 'Checksum mismatch' });
        }
      }

      // Validate PDF magic bytes
      if (tokenData.contentType === 'application/pdf') {
        const pdfValidation = validatePdfMagicBytes(fileData);
        if (!pdfValidation.valid) {
          signedTokens.delete(token);
          return res.status(400).json({ error: pdfValidation.error });
        }
      }

      // Upload to Replit Object Storage
      const result = await objectStorageClient.uploadFromBytes(tokenData.key, fileData);

      // Clean up token
      signedTokens.delete(token);

      res.json({ success: true, key: tokenData.key });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // POST /api/storage/upload-scan - Upload PDF scan with validation
  app.post('/api/storage/upload-scan', requireAuth(), upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const storageKey = req.headers['x-storage-key'] as string;
      const contentType = req.headers['x-content-type'] as string;
      const fileSize = parseInt(req.headers['x-file-size'] as string);

      // Validate headers
      if (!storageKey || !contentType || !fileSize) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      // Validate content type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(contentType)) {
        return res.status(400).json({ error: 'Only PDF, JPG, and PNG files are allowed' });
      }

      // Validate file size (25MB max)
      if (fileSize > 25 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size exceeds 25MB limit' });
      }

      // Validate storage key format (allow pdf, jpg, jpeg, png extensions)
      if (!storageKey.match(/^(invoices|delivery)\/\d{4}\/[^\/]+\.(pdf|jpg|jpeg|png)$/)) {
        return res.status(400).json({ error: 'Invalid storage key format' });
      }

      // Validate actual file size matches header
      if (req.file.size !== fileSize) {
        return res.status(400).json({ error: 'File size mismatch' });
      }

      // Validate magic bytes to confirm actual file type
      if (contentType === 'application/pdf') {
        const pdfValidation = validatePdfMagicBytes(req.file.buffer);
        if (!pdfValidation.valid) {
          return res.status(400).json({ error: pdfValidation.error });
        }
      } else {
        const imgValidation = validateImageMagicBytes(req.file.buffer, contentType);
        if (!imgValidation.valid) {
          return res.status(400).json({ error: imgValidation.error });
        }
      }

      // Upload to Replit Object Storage
      const result = await objectStorageClient.uploadFromBytes(storageKey, req.file.buffer);

      if (!result.ok) {
        throw new Error(`Upload failed: ${result.error}`);
      }

      res.json({ success: true, key: storageKey });
    } catch (error) {
      console.error('Error uploading scan:', error);
      res.status(500).json({ error: 'Failed to upload scan' });
    }
  });

  // GET /api/storage/signed-get
  // Generate a signed token for downloading files
  app.get('/api/storage/signed-get', requireAuth(), async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      // Verify the object exists
      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + (60 * 60 * 1000); // 1 hour

      // Store token with metadata
      signedTokens.set(token, {
        key: key as string,
        expires: expires,
        type: 'download'
      });

      const downloadUrl = `/api/storage/download/${token}`;
      res.json({ url: downloadUrl });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // GET /api/storage/download/:token
  // Handle downloads via signed token
  app.get('/api/storage/download/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const tokenData = signedTokens.get(token);

      if (!tokenData || tokenData.expires < Date.now() || tokenData.type !== 'download') {
        return res.status(401).json({ error: 'Invalid or expired download token' });
      }

      // Derive Content-Type from file extension so browsers can preview inline
      const ext = tokenData.key.split('.').pop()?.toLowerCase() || '';
      const contentTypeMap: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
      };
      const fileContentType = contentTypeMap[ext] || 'application/octet-stream';

      // Use only the basename for the download filename (not the full key path)
      const filename = tokenData.key.split('/').pop() || 'download';

      res.set({
        'Content-Type': fileContentType,
        'Content-Disposition': `inline; filename="${filename}"`,
      });

      // Stream directly from object storage to the response — avoids the
      // [Buffer] → Buffer.from() conversion bug in downloadAsBytes
      const stream = objectStorageClient.downloadAsStream(tokenData.key);
      stream.on('error', (err: Error) => {
        console.error('Error streaming file from storage:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download file' });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // GET /api/storage/list-prefix
  // List objects with a given prefix
  app.get('/api/storage/list-prefix', requireAuth(['Admin']), async (req, res) => {
    try {
      const { prefix = '' } = req.query;
      
      const result = await objectStorageClient.list({ prefix: prefix as string });
      
      if (!result.ok) {
        throw new Error('Failed to list objects');
      }

      // Transform to match expected format
      const formattedObjects = result.value.map((obj: any) => ({
        key: obj.name,
        size: obj.size || 0,
        lastModified: obj.timeCreated,
        etag: obj.etag
      }));

      res.json({ objects: formattedObjects });
    } catch (error) {
      console.error('Error listing objects:', error);
      res.status(500).json({ error: 'Failed to list objects' });
    }
  });

  // GET /api/db/size
  // Get database size in bytes
  app.get('/api/db/size', requireAuth(['Admin']), async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT pg_database_size(current_database()) as bytes;
      `);
      
      const bytes = parseInt(result.rows[0].bytes);
      res.json({ bytes });
    } catch (error) {
      console.error('Error getting database size:', error);
      res.status(500).json({ error: 'Failed to get database size' });
    }
  });

  // GET /api/storage/total-size
  // Get total size of all objects in the bucket
  app.get('/api/storage/total-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const result = await objectStorageClient.list();
      
      if (!result.ok) {
        throw new Error('Failed to list objects');
      }

      // Sum up sizes
      const totalSize = result.value.reduce((sum: number, obj: any) => sum + (obj.size || 0), 0);

      res.json({ bytes: totalSize });
    } catch (error) {
      console.error('Error calculating total size:', error);
      res.status(500).json({ error: 'Failed to calculate total size' });
    }
  });

  // GET /api/db/size
  // Get current database size
  app.get('/api/db/size', async (req, res) => {
    try {
      const query = `
        SELECT 
          pg_database_size(current_database()) as size_bytes,
          pg_size_pretty(pg_database_size(current_database())) as size_pretty
      `;
      
      const result = await pool.query(query);
      const { size_bytes, size_pretty } = result.rows[0];

      res.json({ 
        bytes: parseInt(size_bytes),
        pretty: size_pretty
      });
    } catch (error) {
      console.error('Error getting database size:', error);
      res.status(500).json({ error: 'Failed to get database size' });
    }
  });

  // GET /api/system/app-size
  // Returns total workspace filesystem size in bytes using du
  app.get('/api/system/app-size', requireAuth(['Admin']), async (req, res) => {
    try {
      const output = execSync('du -sb /home/runner/workspace 2>/dev/null').toString();
      const bytes = parseInt(output.split('\t')[0]);
      res.json({ bytes });
    } catch (error) {
      console.error('Error getting app size:', error);
      res.status(500).json({ error: 'Failed to get app size' });
    }
  });

  // Additional utility endpoints

  // GET /api/storage/object-info
  // Get detailed information about a specific object
  app.get('/api/storage/object-info', requireAuth(['Admin']), async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      const exists = await objectStorageClient.exists(key as string);
      if (!exists.ok || !exists.value) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Since Replit client doesn't have a stat method, we'll return basic info
      res.json({
        key: key,
        exists: true,
        message: 'Object exists - detailed metadata not available with current client'
      });
    } catch (error) {
      console.error('Error getting object info:', error);
      res.status(500).json({ error: 'Failed to get object information' });
    }
  });

  // DELETE /api/storage/object
  // Delete an object (Admin only)
  app.delete('/api/storage/object', requireRole('Admin'), async (req, res) => {
    try {
      const { key } = req.query;
      
      if (!key) {
        return res.status(400).json({ error: 'Key parameter is required' });
      }

      const result = await objectStorageClient.delete(key as string);
      
      if (!result.ok) {
        throw new Error('Failed to delete object');
      }
      
      res.json({ success: true, message: 'Object deleted successfully' });
    } catch (error) {
      console.error('Error deleting object:', error);
      res.status(500).json({ error: 'Failed to delete object' });
    }
  });

  const writeAuditLog = (auditData: InsertAuditLog) => {
    db.insert(auditLog).values(auditData).catch((err) => {
      console.error('Audit log write failed:', err);
    });
  };

  // GET /api/audit-logs — return all audit log entries, newest first (Admin + Manager only)
  app.get('/api/audit-logs', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(500);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // ── Recycle Bin routes ──────────────────────────────────────────────────────

  // GET /api/recycle-bin — list all items, newest first
  app.get('/api/recycle-bin', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const items = await db.select().from(recycleBin).orderBy(desc(recycleBin.deletedDate));
      // Return snake_case to match what the frontend expects
      const mapped = items.map(item => ({
        id: item.id,
        document_type: item.documentType,
        document_id: item.documentId,
        document_number: item.documentNumber,
        deleted_by: item.deletedBy,
        deleted_date: item.deletedDate,
        reason: item.reason,
        original_status: item.originalStatus,
        can_restore: item.canRestore,
        created_at: item.createdAt,
      }));
      res.json(mapped);
    } catch (error) {
      console.error('Error fetching recycle bin:', error);
      res.status(500).json({ error: 'Failed to fetch recycle bin' });
    }
  });

  // DELETE /api/recycle-bin/:id — permanently delete from recycle bin
  app.delete('/api/recycle-bin/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [rbItem] = await db.select({ documentType: recycleBin.documentType, documentNumber: recycleBin.documentNumber }).from(recycleBin).where(eq(recycleBin.id, id));
      await db.delete(recycleBin).where(eq(recycleBin.id, id));
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'DELETE', details: `Permanently deleted ${rbItem?.documentType} #${rbItem?.documentNumber}` });
      res.json({ success: true, message: 'Permanently deleted from recycle bin' });
    } catch (error) {
      console.error('Error permanently deleting from recycle bin:', error);
      res.status(500).json({ error: 'Failed to permanently delete' });
    }
  });

  // POST /api/recycle-bin/:id/restore — restore a document to its original table
  app.post('/api/recycle-bin/:id/restore', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const [item] = await db.select().from(recycleBin).where(eq(recycleBin.id, id));

      if (!item) {
        return res.status(404).json({ error: 'Recycle bin item not found' });
      }

      const { header, items: lineItems = [] } = JSON.parse(item.documentData);

      if (!['Invoice', 'DeliveryOrder', 'Quotation', 'PurchaseOrder'].includes(item.documentType)) {
        return res.status(400).json({ error: `Unknown document type: ${item.documentType}` });
      }

      // Atomically restore document and remove from recycle bin
      await db.transaction(async (tx) => {
        if (item.documentType === 'Invoice') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(invoices).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, invoiceId: _inv, ...liData } = li;
            await tx.insert(invoiceLineItems).values({ ...liData, invoiceId: restored.id });
          }
        } else if (item.documentType === 'DeliveryOrder') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(deliveryOrders).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, doId: _did, ...liData } = li;
            await tx.insert(deliveryOrderItems).values({ ...liData, doId: restored.id });
          }
        } else if (item.documentType === 'Quotation') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, customerName: _cn, ...headerData } = header;
          const [restored] = await tx.insert(quotations).values({
            ...headerData,
            quoteDate: headerData.quoteDate ? new Date(headerData.quoteDate) : new Date(),
            validUntil: headerData.validUntil ? new Date(headerData.validUntil) : new Date(),
            referenceDate: headerData.referenceDate ? new Date(headerData.referenceDate) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, quoteId: _qid, ...liData } = li;
            await tx.insert(quotationItems).values({ ...liData, quoteId: restored.id });
          }
        } else if (item.documentType === 'PurchaseOrder') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, supplierName: _sn, ...headerData } = header;
          const [restored] = await tx.insert(purchaseOrders).values({
            ...headerData,
            orderDate: headerData.orderDate ? new Date(headerData.orderDate) : new Date(),
            expectedDelivery: headerData.expectedDelivery ? new Date(headerData.expectedDelivery) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, poId: _pid, ...liData } = li;
            await tx.insert(purchaseOrderItems).values({ ...liData, poId: restored.id });
          }
        }
        // Remove from recycle bin atomically with the restore
        await tx.delete(recycleBin).where(eq(recycleBin.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'UPDATE', details: `Restored ${item.documentType} #${item.documentNumber} from recycle bin` });
      res.json({ success: true, message: `${item.documentNumber} has been restored successfully` });
    } catch (error) {
      console.error('Error restoring document:', error);
      res.status(500).json({ error: 'Failed to restore document' });
    }
  });

  // ── Document delete routes (send to Recycle Bin first) ────────────────────

  // DELETE /api/invoices/:id
  app.delete('/api/invoices/:id', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'unknown';
      const userEmail = req.user?.email || req.user?.username || 'unknown';
      
      // Get the invoice
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(id)));
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Fetch line items for this invoice
      const items = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, parseInt(id)));

      // Atomically save to recycle bin and delete
      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'Invoice',
          documentId: id,
          documentNumber: invoice.invoiceNumber,
          documentData: JSON.stringify({ header: invoice, items }),
          deletedBy: userEmail,
          originalStatus: invoice.status,
          canRestore: true,
        });
        await tx.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, parseInt(id)));
        await tx.delete(invoices).where(eq(invoices.id, parseInt(id)));
      });

      // Delete from object storage (non-DB, outside transaction)
      if (invoice.objectKey) {
        try {
          await objectStorageClient.delete(invoice.objectKey);
        } catch (error) {
          console.warn(`Failed to delete object ${invoice.objectKey}:`, error);
        }
      }
      
      writeAuditLog({ actor: userId, actorName: req.user?.username || userId, targetId: id, targetType: 'invoice', action: 'DELETE', details: `Invoice #${invoice.invoiceNumber} permanently deleted` });
      
      res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  });

  // DELETE /api/delivery-orders/:id
  app.delete('/api/delivery-orders/:id', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'unknown';
      const userEmail = req.user?.email || req.user?.username || 'unknown';
      
      // Get the delivery order
      const [deliveryOrder] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, parseInt(id)));
      
      if (!deliveryOrder) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      // Fetch line items for this delivery order
      const items = await db.select().from(deliveryOrderItems).where(eq(deliveryOrderItems.doId, parseInt(id)));

      // Atomically save to recycle bin and delete
      await db.transaction(async (tx) => {
        await tx.insert(recycleBin).values({
          documentType: 'DeliveryOrder',
          documentId: id,
          documentNumber: deliveryOrder.orderNumber,
          documentData: JSON.stringify({ header: deliveryOrder, items }),
          deletedBy: userEmail,
          originalStatus: deliveryOrder.status,
          canRestore: true,
        });
        await tx.delete(deliveryOrderItems).where(eq(deliveryOrderItems.doId, parseInt(id)));
        await tx.delete(deliveryOrders).where(eq(deliveryOrders.id, parseInt(id)));
      });

      // Delete from object storage (non-DB, outside transaction)
      if (deliveryOrder.objectKey) {
        try {
          await objectStorageClient.delete(deliveryOrder.objectKey);
        } catch (error) {
          console.warn(`Failed to delete object ${deliveryOrder.objectKey}:`, error);
        }
      }
      
      writeAuditLog({ actor: userId, actorName: req.user?.username || userId, targetId: id, targetType: 'delivery_order', action: 'DELETE', details: `DO #${deliveryOrder.orderNumber} permanently deleted` });
      
      res.json({ success: true, message: 'Delivery order deleted successfully' });
    } catch (error) {
      console.error('Error deleting delivery order:', error);
      res.status(500).json({ error: 'Failed to delete delivery order' });
    }
  });


  // Configuration flag for persistent exports
  const persistExports = false; // Keep code path available but disabled

  // GET /api/export/invoice - Generate invoice data for print view
  app.get('/api/export/invoice', requireAuth(), async (req, res) => {
    try {
      const { invoiceId } = req.query;
      
      if (!invoiceId) {
        return res.status(400).json({ error: 'invoiceId parameter is required' });
      }

      // Get invoice data from database with customer details
      const [invoice] = await db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerName: invoices.customerName,
        customerId: invoices.customerId,
        status: invoices.status,
        invoiceDate: invoices.invoiceDate,
        createdAt: invoices.createdAt,
        amount: invoices.amount,
        vatAmount: invoices.vatAmount,
        notes: invoices.notes,
        reference: invoices.reference,
        referenceDate: invoices.referenceDate,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerBillingAddress: customers.billingAddress,
        customerShippingAddress: customers.shippingAddress,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment,
      }).from(invoices)
        .leftJoin(customers, eq(customers.id, invoices.customerId))
        .where(eq(invoices.id, parseInt(invoiceId as string)));
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Get company settings for default VAT rate
      const [companySettingsData] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = companySettingsData?.defaultVatRate ? parseFloat(companySettingsData.defaultVatRate) : 0.05;
      const vatEnabled = companySettingsData?.vatEnabled ?? true;

      // Use stored VAT values; fall back to calculation only if vatAmount is null
      const storedTotal = parseFloat(invoice.amount) || 0;
      const storedVat = parseFloat(invoice.vatAmount || '0') || 0;
      const isInternational = invoice.customerVatTreatment === 'International';

      let totalAmount: number, taxAmount: number, subtotal: number, applicableVatRate: number;
      if (storedVat > 0 || storedTotal > 0) {
        // Use stored values
        totalAmount = storedTotal;
        taxAmount = storedVat;
        subtotal = totalAmount - taxAmount;
        applicableVatRate = subtotal > 0 ? taxAmount / subtotal : 0;
      } else {
        // Legacy path: recalculate
        subtotal = storedTotal;
        applicableVatRate = (isInternational || !vatEnabled) ? 0 : defaultVatRate;
        taxAmount = subtotal * applicableVatRate;
        totalAmount = subtotal + taxAmount;
      }

      // Fetch real line items from invoiceLineItems table
      const storedItems = await db.select({
        productCode: invoiceLineItems.productCode,
        description: invoiceLineItems.description,
        productSku: products.sku,
        productSize: products.size,
        productName: products.name,
        quantity: invoiceLineItems.quantity,
        unitPrice: invoiceLineItems.unitPrice,
        lineTotal: invoiceLineItems.lineTotal,
      }).from(invoiceLineItems)
        .leftJoin(products, eq(products.id, invoiceLineItems.productId))
        .where(eq(invoiceLineItems.invoiceId, parseInt(invoiceId as string)));

      const invoiceItemsList = storedItems.map(item => ({
        product_code: item.productCode || item.productSku || '',
        description: item.description || item.productName || '',
        size: item.productSize || '',
        quantity: item.quantity,
        unit_price: parseFloat(item.unitPrice),
        line_total: parseFloat(item.lineTotal),
      }));

      // Structure the invoice data for frontend print view (matching quotation format)
      const invoiceWithItems = {
        id: invoice.id,
        invoice_number: invoice.invoiceNumber,
        invoice_date: invoice.invoiceDate || invoice.createdAt,
        reference: invoice.reference,
        reference_date: invoice.referenceDate,
        subtotal: subtotal,
        tax_amount: taxAmount,
        vat_rate: Math.round(applicableVatRate * 100),
        total_amount: totalAmount,
        status: invoice.status,
        remarks: invoice.notes || '',
        customer: {
          name: invoice.customerName,
          contact_name: invoice.customerContactPerson || '',
          email: invoice.customerEmail || '',
          phone: invoice.customerPhone || '',
          address: invoice.customerBillingAddress || invoice.customerShippingAddress || '',
          trn_number: invoice.customerVatNumber || '',
          type: invoice.customerVatTreatment || 'Local'
        },
        items: invoiceItemsList
      };

      // Return structured data for frontend print view
      res.json({
        success: true,
        data: invoiceWithItems,
        message: 'Invoice data for print view'
      });
      
    } catch (error) {
      console.error('Error exporting invoice:', error);
      res.status(500).json({ error: 'Failed to export invoice' });
    }
  });

  // GET /api/export/do - Generate and stream delivery order PDF
  app.get('/api/export/do', requireAuth(), async (req, res) => {
    try {
      const { doId } = req.query;
      
      if (!doId) {
        return res.status(400).json({ error: 'doId parameter is required' });
      }

      // Get delivery order data from database
      const [deliveryOrder] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, parseInt(doId as string)));
      
      if (!deliveryOrder) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }

      // Load line items joined to products
      const doItems = await db.select({
        productCode: products.sku,
        description: deliveryOrderItems.description,
        quantity: deliveryOrderItems.quantity,
        unitPrice: deliveryOrderItems.unitPrice,
        lineTotal: deliveryOrderItems.lineTotal,
      }).from(deliveryOrderItems)
        .leftJoin(products, eq(products.id, deliveryOrderItems.productId))
        .where(eq(deliveryOrderItems.doId, deliveryOrder.id));

      // Load company settings
      const [companySetting] = await db.select().from(companySettings).limit(1);
      const company = companySetting ? {
        name: companySetting.companyName || '',
        address: companySetting.address || '',
        phone: companySetting.phone || '',
        email: companySetting.email || '',
      } : null;

      // Generate PDF using puppeteer
      const puppeteer = await import('puppeteer');
      
      const templateHtml = await generateDOPDF(deliveryOrder, doItems, company);
      
      const browser = await puppeteer.default.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
        headless: true
      });
      
      const page = await browser.newPage();
      await page.setContent(templateHtml, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1.2cm', right: '1.2cm', bottom: '1.2cm', left: '1.2cm' }
      });
      
      await browser.close();

      // Set headers for PDF streaming
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="delivery-order-${deliveryOrder.orderNumber}.pdf"`,
        'Content-Length': pdfBuffer.length
      });

      // Stream the PDF bytes
      res.send(pdfBuffer);
      
    } catch (error) {
      console.error('Error exporting delivery order:', error);
      res.status(500).json({ error: 'Failed to export delivery order' });
    }
  });

  // GET /api/export/po - Generate and stream purchase order PDF
  app.get('/api/export/po', requireAuth(), async (req, res) => {
    try {
      const { poId } = req.query;
      
      if (!poId) {
        return res.status(400).json({ error: 'poId parameter is required' });
      }

      // Get purchase order data from database
      const [purchaseOrder] = await db.select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        supplierId: purchaseOrders.supplierId,
        status: purchaseOrders.status,
        orderDate: purchaseOrders.orderDate,
        expectedDelivery: purchaseOrders.expectedDelivery,
        totalAmount: purchaseOrders.totalAmount,
        notes: purchaseOrders.notes,
        supplierName: brands.name, // Since supplierId is actually brandId
        supplierAddress: brands.description, // Address is stored in description field
        supplierContactPerson: brands.contactPerson,
        supplierEmail: brands.contactEmail,
        supplierPhone: brands.contactPhone,
      }).from(purchaseOrders)
        .leftJoin(brands, eq(purchaseOrders.supplierId, brands.id)) // Join to brands instead
        .where(eq(purchaseOrders.id, parseInt(poId as string)));
      
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Get purchase order items
      const items = await db.select({
        productCode: products.sku,
        description: products.name,
        size: products.size,
        quantity: purchaseOrderItems.quantity,
        unitPrice: purchaseOrderItems.unitPrice,
        lineTotal: purchaseOrderItems.lineTotal
      }).from(purchaseOrderItems)
        .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
        .where(eq(purchaseOrderItems.poId, parseInt(poId as string)));

      // Add items to purchase order object
      const purchaseOrderWithItems = {
        ...purchaseOrder,
        items: items.map(item => ({
          product_code: item.productCode,
          description: item.description,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          line_total: item.lineTotal
        }))
      };

      // Return structured data for frontend PDF generation instead
      res.json({
        success: true,
        data: purchaseOrderWithItems,
        message: 'Use frontend PDF generation'
      });
      
    } catch (error) {
      console.error('Error exporting purchase order:', error);
      res.status(500).json({ error: 'Failed to export purchase order' });
    }
  });

  // GET /api/export/quotation - Generate quotation data for print view
  app.get('/api/export/quotation', requireAuth(), async (req, res) => {
    try {
      const { quotationId } = req.query;
      
      if (!quotationId) {
        return res.status(400).json({ error: 'quotationId parameter is required' });
      }

      // Get quotation data from database
      const [quotation] = await db.select({
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
        customerName: customers.name,
        customerBillingAddress: customers.billingAddress,
        customerShippingAddress: customers.shippingAddress,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerVatNumber: customers.vatNumber,
        customerVatTreatment: customers.vatTreatment, // Add vat treatment for auto-calculation
      }).from(quotations)
        .leftJoin(customers, eq(quotations.customerId, customers.id))
        .where(eq(quotations.id, parseInt(quotationId as string)));
      
      if (!quotation) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

      // Get company settings for default VAT rate
      const [companySettingsData] = await db.select().from(companySettings).limit(1);
      const defaultVatRate = companySettingsData?.defaultVatRate ? parseFloat(companySettingsData.defaultVatRate) : 0.05;
      const vatEnabled = companySettingsData?.vatEnabled ?? true;

      // Calculate VAT based on customer type (Local vs International)
      const isInternational = quotation.customerVatTreatment === 'International';
      const subtotal = parseFloat(quotation.totalAmount || '0') || 0;
      
      // Apply VAT: 0% for International, company rate for Local
      const applicableVatRate = (isInternational || !vatEnabled) ? 0 : defaultVatRate;
      const recalculatedVatAmount = subtotal * applicableVatRate;
      const recalculatedGrandTotal = subtotal + recalculatedVatAmount;

      // Get quotation items
      const items = await db.select({
        productCode: products.sku,
        description: products.name,
        size: products.size,
        quantity: quotationItems.quantity,
        unitPrice: quotationItems.unitPrice,
        discount: quotationItems.discount,
        vatRate: quotationItems.vatRate,
        lineTotal: quotationItems.lineTotal
      }).from(quotationItems)
        .leftJoin(products, eq(quotationItems.productId, products.id))
        .where(eq(quotationItems.quoteId, parseInt(quotationId as string)));

      // Add items to quotation object with recalculated VAT
      const quotationWithItems = {
        ...quotation,
        vatAmount: recalculatedVatAmount, // Use recalculated VAT based on customer type
        grandTotal: recalculatedGrandTotal, // Use recalculated grand total
        vat_rate_percentage: applicableVatRate * 100, // Add VAT rate percentage for display
        items: items.map(item => ({
          product_code: item.productCode,
          description: item.description,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount: item.discount,
          vat_rate: item.vatRate,
          line_total: item.lineTotal
        }))
      };

      // Return structured data for frontend print view
      res.json({
        success: true,
        data: quotationWithItems,
        message: 'Quotation data for print view'
      });
      
    } catch (error) {
      console.error('Error exporting quotation:', error);
      res.status(500).json({ error: 'Failed to export quotation' });
    }
  });

  // GET /api/ops/backup-status
  // Get latest backup information
  app.get('/api/ops/backup-status', requireAuth(['Admin']), async (req, res) => {
    try {
      // List backup files to get latest timestamps and sizes
      const dbBackupsResult = await objectStorageClient.list({ prefix: 'backups/db/' });
      const manifestBackupsResult = await objectStorageClient.list({ prefix: 'backups/objects/' });

      let latestDbBackup = null;
      let latestManifestBackup = null;

      if (dbBackupsResult.ok && dbBackupsResult.value.length > 0) {
        latestDbBackup = dbBackupsResult.value
          .sort((a: any, b: any) => new Date(b.timeCreated || b.updated).getTime() - new Date(a.timeCreated || a.updated).getTime())[0];
      }

      if (manifestBackupsResult.ok && manifestBackupsResult.value.length > 0) {
        latestManifestBackup = manifestBackupsResult.value
          .sort((a: any, b: any) => new Date(b.timeCreated || b.updated).getTime() - new Date(a.timeCreated || a.updated).getTime())[0];
      }

      res.json({
        latestDbBackup: latestDbBackup ? {
          filename: (latestDbBackup as any).name,
          size: (latestDbBackup as any).size || 0,
          timestamp: (latestDbBackup as any).timeCreated || (latestDbBackup as any).updated
        } : null,
        latestManifestBackup: latestManifestBackup ? {
          filename: (latestManifestBackup as any).name,
          size: (latestManifestBackup as any).size || 0,
          timestamp: (latestManifestBackup as any).timeCreated || (latestManifestBackup as any).updated
        } : null
      });

    } catch (error) {
      console.error('Error getting backup status:', error);
      res.status(500).json({ error: 'Failed to get backup status' });
    }
  });

  // Operations endpoint for automated backups
  // POST /api/ops/run-backups
  // Run both database and manifest backups with Admin + OPS_TOKEN auth
  app.post('/api/ops/run-backups', requireAuth(['Admin']), requireOpsToken, async (req: AuthenticatedRequest, res) => {
    try {
      console.log('Starting automated backup process...');
      
      // Import the backup functions
      // @ts-ignore - JavaScript modules without TypeScript declarations
      const { uploadBackup } = await import('../scripts/uploadBackup.js');
      // @ts-ignore - JavaScript modules without TypeScript declarations  
      const { writeManifest } = await import('../scripts/writeManifest.js');
      
      // Run both backups in parallel
      const [dbResult, manifestResult] = await Promise.all([
        uploadBackup(),
        writeManifest()
      ]);
      
      // Check if both succeeded
      const success = dbResult.success && manifestResult.success;
      
      const response = {
        success,
        timestamp: new Date().toISOString(),
        dbBackup: {
          success: dbResult.success,
          filename: dbResult.filename,
          storageKey: dbResult.storageKey,
          error: dbResult.error
        },
        manifestBackup: {
          success: manifestResult.success,
          filename: manifestResult.filename,
          storageKey: manifestResult.storageKey,
          totalObjects: manifestResult.totalObjects,
          totalSize: manifestResult.totalSize,
          totals: manifestResult.totals,
          error: manifestResult.error
        }
      };
      
      if (success) {
        console.log('Automated backup completed successfully');
        res.status(200).json(response);
      } else {
        console.error('Automated backup failed:', { dbResult, manifestResult });
        res.status(500).json(response);
      }
      
    } catch (error) {
      console.error('Error running automated backups:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });


  // ============================================================
  // Financial Years (Books) API
  // ============================================================

  // GET /api/books — list all financial years sorted by year descending
  app.get('/api/books', requireAuth(), async (req, res) => {
    try {
      const years = await db.select().from(financialYears).orderBy(desc(financialYears.year));
      res.json(years);
    } catch (error) {
      console.error('Error fetching financial years:', error);
      res.status(500).json({ error: 'Failed to fetch financial years' });
    }
  });

  // POST /api/books — create a new financial year
  app.post('/api/books', requireAuth(['Admin', 'Manager']), async (req, res) => {
    try {
      const body = req.body;
      const year = parseInt(body.year);
      if (isNaN(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid year' });
      }
      // Check for duplicate
      const existing = await db.select().from(financialYears).where(eq(financialYears.year, year));
      if (existing.length > 0) {
        return res.status(409).json({ error: `Financial year ${year} already exists` });
      }
      const [created] = await db.insert(financialYears).values({
        year,
        startDate: body.start_date || `${year}-01-01`,
        endDate: body.end_date || `${year}-12-31`,
        status: 'Open',
      }).returning();
      writeAuditLog({ actor: (req as AuthenticatedRequest).user!.id, actorName: (req as AuthenticatedRequest).user!.username, targetId: String(created.id), targetType: 'financial_year', action: 'CREATE', details: `Financial year ${year} created` });
      res.status(201).json(created);
    } catch (error) {
      console.error('Error creating financial year:', error);
      res.status(500).json({ error: 'Failed to create financial year' });
    }
  });

  // PUT /api/books/:id — update a financial year (close/reopen)
  app.put('/api/books/:id', requireAuth(['Admin', 'Manager']), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
      const { status } = req.body;
      if (!['Open', 'Closed'].includes(status)) {
        return res.status(400).json({ error: 'Status must be Open or Closed' });
      }
      const [updated] = await db.update(financialYears)
        .set({ status })
        .where(eq(financialYears.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Financial year not found' });
      writeAuditLog({ actor: (req as AuthenticatedRequest).user!.id, actorName: (req as AuthenticatedRequest).user!.username, targetId: String(id), targetType: 'financial_year', action: 'UPDATE', details: `Financial year ${updated.year} set to ${status}` });
      res.json(updated);
    } catch (error) {
      console.error('Error updating financial year:', error);
      res.status(500).json({ error: 'Failed to update financial year' });
    }
  });

  // GET /api/books/:id/export — export all records for this year as Excel
  app.get('/api/books/:id/export', requireAuth(), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

      const [book] = await db.select().from(financialYears).where(eq(financialYears.id, id));
      if (!book) return res.status(404).json({ error: 'Financial year not found' });

      const startDate = new Date(book.startDate);
      const endDate = new Date(book.endDate);
      endDate.setHours(23, 59, 59, 999);

      // Fetch all records for the year
      const [allInvoices, allQuotations, allPOs, allDOs] = await Promise.all([
        db.select().from(invoices),
        db.select().from(quotations),
        db.select().from(purchaseOrders),
        db.select().from(deliveryOrders),
      ]);

      const inRange = (dateVal: string | Date | null | undefined) => {
        if (!dateVal) return false;
        const d = new Date(dateVal);
        return d >= startDate && d <= endDate;
      };

      const yearInvoices = allInvoices.filter(r => inRange(r.invoiceDate));
      const yearQuotations = allQuotations.filter(r => inRange(r.quoteDate));
      const yearPOs = allPOs.filter(r => inRange(r.orderDate));
      const yearDOs = allDOs.filter(r => inRange(r.orderDate));

      const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB') : '';
      const fmtNum = (n: any) => n ? parseFloat(String(n)).toFixed(2) : '0.00';

      const wb = XLSX.utils.book_new();

      // Invoices sheet
      const invRows = yearInvoices.map(r => ({
        'Invoice Number': r.invoiceNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.invoiceDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.amount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.amount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows.length ? invRows : [{ 'Note': 'No invoices in this period' }]), 'Invoices');

      // Quotations sheet
      const quoteRows = yearQuotations.map(r => ({
        'Quote Number': r.quoteNumber,
        'Customer ID': r.customerId,
        'Date': fmtDate(r.quoteDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.totalAmount),
        'VAT (AED)': fmtNum(r.vatAmount),
        'Total (AED)': fmtNum(r.grandTotal),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quoteRows.length ? quoteRows : [{ 'Note': 'No quotations in this period' }]), 'Quotations');

      // Purchase Orders sheet
      const poRows = yearPOs.map(r => ({
        'PO Number': r.poNumber,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Total (GBP)': fmtNum(r.totalAmount),
        'VAT': fmtNum(r.vatAmount),
        'Grand Total (GBP)': fmtNum(r.grandTotal),
        'Notes': r.notes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(poRows.length ? poRows : [{ 'Note': 'No purchase orders in this period' }]), 'Purchase Orders');

      // Delivery Orders sheet
      const doRows = yearDOs.map(r => ({
        'DO Number': r.orderNumber,
        'Customer': r.customerName,
        'Date': fmtDate(r.orderDate),
        'Status': r.status,
        'Subtotal (AED)': fmtNum(r.subtotal),
        'VAT (AED)': fmtNum(r.taxAmount),
        'Total (AED)': fmtNum(r.totalAmount),
        'Reference': r.reference || '',
        'Notes': r.notes || '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(doRows.length ? doRows : [{ 'Note': 'No delivery orders in this period' }]), 'Delivery Orders');

      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `FLOW_Year_${book.year}_Export.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(xlsxBuffer);
    } catch (error) {
      console.error('Error exporting financial year:', error);
      res.status(500).json({ error: 'Failed to export financial year' });
    }
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const httpServer = createServer(app);

  return httpServer;
}
