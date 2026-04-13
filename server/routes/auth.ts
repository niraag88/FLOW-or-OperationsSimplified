import type { Express } from "express";
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { users } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, comparePassword, writeAuditLog, type AuthenticatedRequest } from "../middleware";

export function registerAuthRoutes(app: Express, loginLimiter: RateLimitRequestHandler) {
  app.post('/api/auth/login', loginLimiter, async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const [user] = await db.select().from(users).where(eq(users.username, username));

      if (!user || !await comparePassword(password, user.password)) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (!user.active) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));

      req.session.userId = user.id;
      const { password: _, ...userInfo } = user;

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error during login:', saveErr);
          return res.status(500).json({ error: 'Login failed' });
        }
        res.json({ user: userInfo });
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error during logout:', err);
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', requireAuth(), async (req: AuthenticatedRequest, res) => {
    const { password: _, ...userInfo } = req.user!;
    res.json({ user: userInfo });
  });
}
