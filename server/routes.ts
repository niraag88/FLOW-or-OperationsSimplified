import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { businessStorage } from "./businessStorage";
import { Client } from '@replit/object-storage';
import { invoices, deliveryOrders, auditLog, users, type InsertAuditLog, type InsertUser, type UpdateUser, type User } from "@shared/schema";
import { insertBrandSchema, insertSupplierSchema, insertCustomerSchema, insertProductSchema, insertPurchaseOrderSchema, insertQuotationSchema } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
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
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
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

  app.post('/api/purchase-orders', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const poNumber = await businessStorage.generatePoNumber();
      const validatedData = insertPurchaseOrderSchema.parse({
        ...req.body,
        poNumber,
        createdBy: req.user!.id
      });
      const purchaseOrder = await businessStorage.createPurchaseOrder(validatedData);
      res.status(201).json(purchaseOrder);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      res.status(500).json({ error: 'Failed to create purchase order' });
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
      const quoteNumber = await businessStorage.generateQuoteNumber();
      const validatedData = insertQuotationSchema.parse({
        ...req.body,
        quoteNumber,
        createdBy: req.user!.id
      });
      const quotation = await businessStorage.createQuotation(validatedData);
      res.status(201).json(quotation);
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ error: 'Failed to create quotation' });
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
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
      const { uploadBackup } = await import('../scripts/uploadBackup.js');
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
