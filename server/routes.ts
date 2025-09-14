import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { businessStorage } from "./businessStorage";
import { Client } from '@replit/object-storage';
import { invoices, deliveryOrders, auditLog, users, type InsertAuditLog, type InsertUser, type UpdateUser, type User } from "@shared/schema";
import { insertBrandSchema, insertSupplierSchema, insertCustomerSchema, insertProductSchema, insertPurchaseOrderSchema, insertQuotationSchema, stockCounts, stockCountItems, goodsReceipts, goodsReceiptItems, stockMovements, products, purchaseOrders, purchaseOrderItems, enhancedInvoices, invoiceItems, suppliers, brands, quotations, quotationItems, customers } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import pkg from 'pg';
import crypto from 'crypto';
import multer from 'multer';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
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

async function generateDOPDF(deliveryOrder: any): Promise<string> {
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
      <title>Delivery Order ${deliveryOrder.orderNumber}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .do-title { font-size: 32px; font-weight: bold; color: #333; }
        .do-details { margin-top: 10px; }
        .company-info { text-align: right; }
        .section { margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
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
          <h1 class="do-title">DELIVERY ORDER</h1>
          <div class="do-details">
            <p>DO Number: <strong>${deliveryOrder.orderNumber}</strong></p>
            <p>Order Date: <strong>${formatDate(deliveryOrder.createdAt)}</strong></p>
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
          <h3>Deliver To:</h3>
          <p><strong>${deliveryOrder.customerName}</strong></p>
          <p>${deliveryOrder.deliveryAddress}</p>
        </div>
        <div>
          <h3>Delivery Details:</h3>
          <p>Status: ${deliveryOrder.status}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Customer</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Delivery Items</td>
            <td>${deliveryOrder.customerName}</td>
            <td>${deliveryOrder.status}</td>
          </tr>
        </tbody>
      </table>

      <div class="signature-section">
        <div class="signature-box">
          <p>Delivered By</p>
        </div>
        <div class="signature-box">
          <p>Received By</p>
        </div>
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
  // Session middleware setup with hardened security
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
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
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Authentication endpoints
  
  // POST /api/auth/login
  app.post('/api/auth/login', async (req: AuthenticatedRequest, res) => {
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
      const { role, firstName, lastName, email, active } = req.body;

      const [updatedUser] = await db.update(users)
        .set({
          ...(role !== undefined && { role }),
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(email !== undefined && { email }),
          ...(active !== undefined && { active })
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
      res.json(brand);
    } catch (error) {
      console.error('Error updating brand:', error);
      res.status(500).json({ error: 'Failed to update brand' });
    }
  });

  app.delete('/api/brands/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      await businessStorage.deleteBrand(brandId);
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
      res.json(supplier);
    } catch (error) {
      console.error('Error updating supplier:', error);
      res.status(500).json({ error: 'Failed to update supplier' });
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
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const productId = parseInt(req.params.id);
      await businessStorage.deleteProduct(productId);
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // Purchase Order management routes
  app.get('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const purchaseOrders = await businessStorage.getPurchaseOrders();
      res.json(purchaseOrders);
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
      
      res.json(updatedPO);
    } catch (error) {
      console.error('Error updating purchase order:', error);
      res.status(500).json({ error: 'Failed to update purchase order' });
    }
  });

  app.delete('/api/purchase-orders/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poId = parseInt(req.params.id);
      const deletedPO = await businessStorage.deletePurchaseOrder(poId);
      res.json({ success: true, deletedPO });
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
      const quotations = await businessStorage.getQuotations();
      res.json(quotations);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      res.status(500).json({ error: 'Failed to fetch quotations' });
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
          if (item.product_id && item.quantity > 0) {
            await db.insert(quotationItems).values({
              quoteId: quotation.id,
              productId: parseInt(item.product_id),
              quantity: item.quantity,
              unitPrice: item.unit_price.toString(),
              discount: item.discount ? item.discount.toString() : "0.00",
              vatRate: item.vat_rate ? item.vat_rate.toString() : "0.05",
              lineTotal: item.line_total.toString()
            });
          }
        }
      }
      
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

  // Delete quotation
  app.delete('/api/quotations/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const deletedQuote = await businessStorage.deleteQuotation(id);
      res.json({ success: true, message: 'Quotation deleted successfully', data: deletedQuote });
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
      
      // Get invoice items
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      
      if (items.length === 0) {
        return res.status(400).json({ error: 'No items found for this invoice' });
      }

      // Process each item and deduct from stock
      for (const item of items) {
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

      // Update invoice status to mark as stock-processed
      await db.update(enhancedInvoices)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(eq(enhancedInvoices.id, invoiceId));

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
      if (contentType !== 'application/pdf') {
        return res.status(400).json({ error: 'Only PDF files are allowed' });
      }

      // Validate file size (25MB max)
      if (fileSize > 25 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size exceeds 25MB limit' });
      }

      // Validate storage key format
      if (!storageKey.match(/^(invoices|delivery)\/\d{4}\/[^\/]+\.pdf$/)) {
        return res.status(400).json({ error: 'Invalid storage key format' });
      }

      // Validate actual file size matches header
      if (req.file.size !== fileSize) {
        return res.status(400).json({ error: 'File size mismatch' });
      }

      // Validate PDF magic bytes
      const pdfValidation = validatePdfMagicBytes(req.file.buffer);
      if (!pdfValidation.valid) {
        return res.status(400).json({ error: pdfValidation.error });
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

      // Download file from Replit Object Storage as bytes and stream to response
      const downloadResult = await objectStorageClient.downloadAsBytes(tokenData.key);
      if (!downloadResult.ok) {
        return res.status(404).json({ error: 'Object not found' });
      }

      // Set appropriate headers
      res.set({
        'Content-Disposition': `attachment; filename="${tokenData.key}"`,
        'Content-Type': 'application/octet-stream'
      });

      // Send the file data
      res.send(downloadResult.value);
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

  // Retention policy helpers
  const checkRetentionPolicy = (createdAt: Date, legalHold: boolean) => {
    if (legalHold) {
      return { canDelete: false, error: 'Cannot delete: Record is under legal hold' };
    }
    
    // 5-year retention policy
    const fiveYearsLater = new Date(createdAt);
    fiveYearsLater.setFullYear(fiveYearsLater.getFullYear() + 5);
    
    if (fiveYearsLater > new Date()) {
      const retentionDate = fiveYearsLater.toISOString().split('T')[0];
      return { 
        canDelete: false, 
        error: `Retention policy: cannot delete until ${retentionDate}` 
      };
    }
    
    return { canDelete: true };
  };

  const writeAuditLog = async (auditData: InsertAuditLog) => {
    await db.insert(auditLog).values(auditData);
  };

  // DELETE /api/invoices/:id
  // Delete an invoice with retention policy checks
  app.delete('/api/invoices/:id', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'unknown';
      
      // Get the invoice
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(id)));
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      
      // Check retention policy
      const retentionCheck = checkRetentionPolicy(invoice.createdAt, invoice.legalHold);
      if (!retentionCheck.canDelete) {
        return res.status(403).json({ error: retentionCheck.error });
      }
      
      // Delete from storage if object exists
      if (invoice.objectKey) {
        try {
          await objectStorageClient.delete(invoice.objectKey);
        } catch (error) {
          console.warn(`Failed to delete object ${invoice.objectKey}:`, error);
        }
      }
      
      // Delete from database
      await db.delete(invoices).where(eq(invoices.id, parseInt(id)));
      
      // Write audit log
      await writeAuditLog({
        actor: userId,
        targetId: id,
        targetType: 'invoice',
        objectKey: invoice.objectKey,
        action: 'DELETE'
      });
      
      res.json({ success: true, message: 'Invoice deleted successfully' });
    } catch (error) {
      console.error('Error deleting invoice:', error);
      res.status(500).json({ error: 'Failed to delete invoice' });
    }
  });

  // DELETE /api/delivery-orders/:id  
  // Delete a delivery order with retention policy checks
  app.delete('/api/delivery-orders/:id', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 'unknown';
      
      // Get the delivery order
      const [deliveryOrder] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, parseInt(id)));
      
      if (!deliveryOrder) {
        return res.status(404).json({ error: 'Delivery order not found' });
      }
      
      // Check retention policy
      const retentionCheck = checkRetentionPolicy(deliveryOrder.createdAt, deliveryOrder.legalHold);
      if (!retentionCheck.canDelete) {
        return res.status(403).json({ error: retentionCheck.error });
      }
      
      // Delete from storage if object exists
      if (deliveryOrder.objectKey) {
        try {
          await objectStorageClient.delete(deliveryOrder.objectKey);
        } catch (error) {
          console.warn(`Failed to delete object ${deliveryOrder.objectKey}:`, error);
        }
      }
      
      // Delete from database
      await db.delete(deliveryOrders).where(eq(deliveryOrders.id, parseInt(id)));
      
      // Write audit log
      await writeAuditLog({
        actor: userId,
        targetId: id,
        targetType: 'delivery_order',
        objectKey: deliveryOrder.objectKey,
        action: 'DELETE'
      });
      
      res.json({ success: true, message: 'Delivery order deleted successfully' });
    } catch (error) {
      console.error('Error deleting delivery order:', error);
      res.status(500).json({ error: 'Failed to delete delivery order' });
    }
  });


  // Configuration flag for persistent exports
  const persistExports = false; // Keep code path available but disabled

  // GET /api/export/invoice - Generate and stream invoice PDF
  app.get('/api/export/invoice', requireAuth(), async (req, res) => {
    try {
      const { invoiceId } = req.query;
      
      if (!invoiceId) {
        return res.status(400).json({ error: 'invoiceId parameter is required' });
      }

      // Get invoice data from database
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, parseInt(invoiceId as string)));
      
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Generate PDF using puppeteer
      const puppeteer = await import('puppeteer');
      const ReactDOMServer = await import('react-dom/server');
      const React = await import('react');
      
      // Import the InvoiceTemplate (we'll need to create a server-side version)
      const templateHtml = await generateInvoicePDF(invoice);
      
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
        'Content-Disposition': `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
        'Content-Length': pdfBuffer.length
      });

      // Stream the PDF bytes
      res.send(pdfBuffer);
      
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

      // Generate PDF using puppeteer
      const puppeteer = await import('puppeteer');
      
      // Import the DOTemplate (we'll need to create a server-side version)
      const templateHtml = await generateDOPDF(deliveryOrder);
      
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
        terms: quotations.terms,
        reference: quotations.reference,
        referenceDate: quotations.referenceDate,
        customerName: customers.name,
        customerBillingAddress: customers.billingAddress,
        customerShippingAddress: customers.shippingAddress,
        customerContactPerson: customers.contactPerson,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      }).from(quotations)
        .leftJoin(customers, eq(quotations.customerId, customers.id))
        .where(eq(quotations.id, parseInt(quotationId as string)));
      
      if (!quotation) {
        return res.status(404).json({ error: 'Quotation not found' });
      }

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

      // Add items to quotation object
      const quotationWithItems = {
        ...quotation,
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


  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  const httpServer = createServer(app);

  return httpServer;
}
