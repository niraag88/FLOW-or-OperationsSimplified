import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { sessionStore } from "./middleware";

import { registerAuthRoutes } from "./routes/auth";
import { registerProductRoutes } from "./routes/products";
import { registerSupplierRoutes } from "./routes/suppliers";
import { registerPurchaseOrderRoutes } from "./routes/purchase-orders";
import { registerQuotationRoutes } from "./routes/quotations";
import { registerInvoiceRoutes } from "./routes/invoices";
import { registerDeliveryOrderRoutes } from "./routes/delivery-orders";
import { registerGoodsReceiptRoutes } from "./routes/goods-receipts";
import { registerInventoryRoutes } from "./routes/inventory";
import { registerSettingsRoutes } from "./routes/settings";
import { registerSystemRoutes } from "./routes/system";

export async function registerRoutes(app: Express): Promise<Server> {
  app.set('trust proxy', 1);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('SESSION_SECRET environment variable is required but not set');
  }

  app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '28800000'),
    }
  }));

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 5 : 200,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 300 : 2000,
    message: { error: 'Too many requests. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);

  registerSystemRoutes(app);
  registerAuthRoutes(app, loginLimiter);
  registerProductRoutes(app);
  registerSupplierRoutes(app);
  registerPurchaseOrderRoutes(app);
  registerQuotationRoutes(app);
  registerInvoiceRoutes(app);
  registerDeliveryOrderRoutes(app);
  registerGoodsReceiptRoutes(app);
  registerInventoryRoutes(app);
  registerSettingsRoutes(app);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const httpServer = createServer(app);
  return httpServer;
}
