import type { Express } from "express";
import type { RateLimitRequestHandler } from 'express-rate-limit';
import { users } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword, comparePassword, writeAuditLog, type AuthenticatedRequest } from "../middleware";

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
      res.json({ user: userInfo });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', requireAuth(), async (req: AuthenticatedRequest, res) => {
    const { password: _, ...userInfo } = req.user!;
    res.json({ user: userInfo });
  });

  app.get('/api/users', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
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

  app.post('/api/users', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password, role, firstName, lastName, email, active } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const [existingUser] = await db.select().from(users).where(eq(users.username, username));
      if (existingUser) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const hashedPassword = await hashPassword(password);

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

  app.put('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const { username, role, firstName, lastName, email, active, password } = req.body;

      if (username !== undefined && username !== '') {
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.username, username));
        if (existing && existing.id !== userId) {
          return res.status(400).json({ error: 'Username already taken' });
        }
      }

      const trimmedPassword = typeof password === 'string' ? password.trim() : undefined;
      if (trimmedPassword) {
        if (trimmedPassword.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
      }

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

  app.delete('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;

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

      const hashedPassword = await hashPassword(password);

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
}
